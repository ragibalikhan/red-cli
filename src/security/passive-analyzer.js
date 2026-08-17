/**
 * Passive Response Analyzer
 * Checks HTTP responses for security misconfigurations, secrets, PII, and vulnerabilities.
 * Runs automatically on web_fetch responses — zero extra requests.
 */

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret|secret_key|secretkey)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})/ },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'GitLab Token', pattern: /glpat-[A-Za-z0-9\-_]{20,}/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,}-[A-Za-z0-9\-]+/ },
  { name: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey|api_secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/i },
  { name: 'Database URL', pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/ },
  { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/  },
];

const PII_PATTERNS = [
  { name: 'Email Address', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: 'Credit Card (Visa)', pattern: /\b4[0-9]{12}(?:[0-9]{3})?\b/ },
  { name: 'Credit Card (MC)', pattern: /\b5[1-5][0-9]{14}\b/ },
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'Phone Number', pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { name: 'IPv4 (Internal)', pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/ },
];

const SECURITY_HEADERS = [
  { name: 'Strict-Transport-Security', severity: 'medium', desc: 'Missing HSTS — vulnerable to SSL stripping' },
  { name: 'Content-Security-Policy', severity: 'medium', desc: 'Missing CSP — vulnerable to XSS' },
  { name: 'X-Frame-Options', severity: 'low', desc: 'Missing X-Frame-Options — vulnerable to clickjacking' },
  { name: 'X-Content-Type-Options', severity: 'low', desc: 'Missing X-Content-Type-Options — MIME sniffing risk' },
  { name: 'Referrer-Policy', severity: 'info', desc: 'Missing Referrer-Policy' },
  { name: 'Permissions-Policy', severity: 'info', desc: 'Missing Permissions-Policy' },
];

/**
 * Analyze an HTTP response for security issues.
 * @param {object} opts - { url, statusCode, headers, body }
 * @returns {object} { findings: Array<{ severity, title, detail, evidence }> }
 */
export function analyzeResponse({ url, statusCode, headers = {}, body = '' }) {
  const findings = [];
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  // 1. Security headers check
  for (const h of SECURITY_HEADERS) {
    if (!lowerHeaders[h.name.toLowerCase()]) {
      findings.push({ severity: h.severity, title: `Missing ${h.name}`, detail: h.desc, evidence: `Header not present in response from ${url}` });
    }
  }

  // 2. Cookie flags check
  const setCookie = lowerHeaders['set-cookie'] || '';
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const cookie of cookies) {
    if (!cookie) continue;
    const name = cookie.split('=')[0];
    if (!cookie.toLowerCase().includes('httponly')) {
      findings.push({ severity: 'medium', title: `Cookie missing HttpOnly: ${name}`, detail: 'Cookie accessible via JavaScript — XSS can steal it', evidence: cookie.slice(0, 100) });
    }
    if (!cookie.toLowerCase().includes('secure')) {
      findings.push({ severity: 'low', title: `Cookie missing Secure flag: ${name}`, detail: 'Cookie sent over HTTP — vulnerable to interception', evidence: cookie.slice(0, 100) });
    }
    if (!cookie.toLowerCase().includes('samesite')) {
      findings.push({ severity: 'low', title: `Cookie missing SameSite: ${name}`, detail: 'No SameSite attribute — CSRF risk', evidence: cookie.slice(0, 100) });
    }
  }

  // 3. Server version disclosure
  const server = lowerHeaders['server'] || '';
  if (server && /[0-9]/.test(server)) {
    findings.push({ severity: 'info', title: 'Server version disclosed', detail: `Server header reveals version: ${server}`, evidence: server });
  }
  const powered = lowerHeaders['x-powered-by'] || '';
  if (powered) {
    findings.push({ severity: 'info', title: 'Technology disclosed via X-Powered-By', detail: powered, evidence: powered });
  }

  // 4. Secrets in response body
  for (const s of SECRET_PATTERNS) {
    const match = body.match(s.pattern);
    if (match) {
      const masked = match[0].slice(0, 8) + '***' + match[0].slice(-4);
      findings.push({ severity: 'high', title: `Secret found: ${s.name}`, detail: `Detected ${s.name} in response body`, evidence: masked });
    }
  }

  // 5. PII in response body
  for (const p of PII_PATTERNS) {
    const match = body.match(p.pattern);
    if (match) {
      findings.push({ severity: 'medium', title: `PII detected: ${p.name}`, detail: `Found ${p.name} pattern in response`, evidence: match[0].slice(0, 30) + '...' });
    }
  }

  // 6. CORS misconfiguration
  const acao = lowerHeaders['access-control-allow-origin'] || '';
  const acac = lowerHeaders['access-control-allow-credentials'] || '';
  if (acao === '*' && acac.toLowerCase() === 'true') {
    findings.push({ severity: 'high', title: 'CORS misconfiguration', detail: 'Wildcard origin with credentials allowed — any site can steal authenticated data', evidence: `ACAO: ${acao}, ACAC: ${acac}` });
  } else if (acao === '*') {
    findings.push({ severity: 'low', title: 'Permissive CORS (wildcard origin)', detail: 'Access-Control-Allow-Origin: * — public access', evidence: acao });
  }

  // 7. Insecure cache on authenticated responses
  const cacheControl = lowerHeaders['cache-control'] || '';
  const hasAuth = lowerHeaders['authorization'] || lowerHeaders['cookie'];
  if (hasAuth && !cacheControl.includes('no-store') && !cacheControl.includes('private')) {
    findings.push({ severity: 'low', title: 'Insecure caching on authenticated response', detail: 'Response may be cached by proxies — sensitive data exposure risk', evidence: `Cache-Control: ${cacheControl || '(not set)'}` });
  }

  return { findings, url, checkedAt: new Date().toISOString() };
}

export default { analyzeResponse };
