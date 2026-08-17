/**
 * Finding Correlator
 * Chains findings together to identify attack paths and escalation opportunities.
 * AI uses this to understand the real-world impact of combined vulnerabilities.
 */

// Attack chain rules: if finding A + finding B exist, the combined impact is C
const CHAIN_RULES = [
  { requires: ['ssrf', 'cloud_metadata'], impact: 'critical', chain: 'SSRF → Cloud Metadata → AWS Key Theft', description: 'SSRF can reach cloud metadata endpoint, potentially leaking IAM credentials for full account takeover' },
  { requires: ['sqli', 'auth_bypass'], impact: 'critical', chain: 'SQLi → Auth Bypass → Admin Access', description: 'SQL injection can bypass authentication, granting admin-level access' },
  { requires: ['xss', 'csrf_missing'], impact: 'high', chain: 'XSS + No CSRF → Account Takeover', description: 'XSS can forge requests on behalf of victims without CSRF protection' },
  { requires: ['ssrf', 'internal_service'], impact: 'high', chain: 'SSRF → Internal Service Access', description: 'SSRF can reach internal services not exposed to the internet' },
  { requires: ['lfi', 'secret_exposed'], impact: 'critical', chain: 'LFI → Secret File Read → Credential Theft', description: 'Local file inclusion can read configuration files containing secrets' },
  { requires: ['cmdi', 'privilege_escalation'], impact: 'critical', chain: 'CMDi → Shell → Privilege Escalation', description: 'Command injection provides shell access, which can be escalated to root' },
  { requires: ['idor', 'pii_exposed'], impact: 'high', chain: 'IDOR → Mass PII Extraction', description: 'IDOR allows iterating over user records to extract personal data at scale' },
  { requires: ['jwt_weak', 'admin_endpoint'], impact: 'critical', chain: 'JWT Forge → Admin API Access', description: 'Weak JWT secret allows forging admin tokens to access privileged endpoints' },
  { requires: ['open_redirect', 'oauth'], impact: 'high', chain: 'Open Redirect → OAuth Token Theft', description: 'Open redirect in OAuth flow can steal authorization codes/tokens' },
  { requires: ['ssti', 'rce'], impact: 'critical', chain: 'SSTI → Remote Code Execution', description: 'Template injection leads to arbitrary code execution on the server' },
  { requires: ['cors_misconfig', 'session_cookie'], impact: 'high', chain: 'CORS → Cross-Origin Data Theft', description: 'CORS misconfiguration allows attacker site to steal authenticated data' },
  { requires: ['host_header', 'password_reset'], impact: 'high', chain: 'Host Header → Password Reset Poisoning', description: 'Host header injection in password reset emails redirects reset links to attacker' },
];

/**
 * Normalize finding type from title/description.
 */
function classifyFinding(finding) {
  const text = `${finding.title || ''} ${finding.detail || ''} ${finding.probe || ''}`.toLowerCase();
  const types = [];

  if (text.includes('sql') || text.includes('sqli')) types.push('sqli');
  if (text.includes('xss') || text.includes('cross-site scripting')) types.push('xss');
  if (text.includes('ssrf')) types.push('ssrf');
  if (text.includes('lfi') || text.includes('path traversal') || text.includes('local file')) types.push('lfi');
  if (text.includes('cmdi') || text.includes('command injection') || text.includes('rce')) types.push('cmdi', 'rce');
  if (text.includes('ssti') || text.includes('template injection')) types.push('ssti', 'rce');
  if (text.includes('idor') || text.includes('insecure direct')) types.push('idor');
  if (text.includes('csrf') || text.includes('missing') && text.includes('token')) types.push('csrf_missing');
  if (text.includes('cors')) types.push('cors_misconfig');
  if (text.includes('jwt') || text.includes('weak secret')) types.push('jwt_weak');
  if (text.includes('open redirect')) types.push('open_redirect');
  if (text.includes('host header')) types.push('host_header');
  if (text.includes('secret') || text.includes('api key') || text.includes('credential')) types.push('secret_exposed');
  if (text.includes('pii') || text.includes('personal') || text.includes('credit card')) types.push('pii_exposed');
  if (text.includes('metadata') || text.includes('169.254')) types.push('cloud_metadata');
  if (text.includes('oauth') || text.includes('authorization')) types.push('oauth');
  if (text.includes('session') || text.includes('cookie')) types.push('session_cookie');
  if (text.includes('admin')) types.push('admin_endpoint');
  if (text.includes('password reset')) types.push('password_reset');
  if (text.includes('internal') || text.includes('localhost')) types.push('internal_service');
  if (text.includes('auth bypass') || text.includes('authentication bypass')) types.push('auth_bypass');
  if (text.includes('privilege') || text.includes('escalat')) types.push('privilege_escalation');

  return types;
}

/**
 * Correlate findings to identify attack chains.
 * @param {Array} findings - Array of { title, detail, severity, probe, ... }
 * @returns {{ chains: Array, riskEscalations: Array, summary: string }}
 */
export function correlateFindings(findings) {
  // Classify all findings
  const allTypes = new Set();
  for (const f of findings) {
    classifyFinding(f).forEach(t => allTypes.add(t));
  }

  // Check chain rules
  const chains = [];
  for (const rule of CHAIN_RULES) {
    const matched = rule.requires.every(r => allTypes.has(r));
    if (matched) {
      chains.push({
        chain: rule.chain,
        impact: rule.impact,
        description: rule.description,
        requiredFindings: rule.requires
      });
    }
  }

  // Risk escalations — findings that are worse in combination
  const escalations = [];
  if (allTypes.has('sqli') && allTypes.has('secret_exposed')) {
    escalations.push('SQLi + exposed secrets = database credential theft likely');
  }
  if (allTypes.has('ssrf') && (allTypes.has('cloud_metadata') || allTypes.has('internal_service'))) {
    escalations.push('SSRF with internal access = lateral movement possible');
  }
  if (allTypes.has('xss') && allTypes.has('session_cookie')) {
    escalations.push('XSS + session cookies = session hijacking');
  }

  const summary = chains.length > 0
    ? `🔴 ${chains.length} attack chain(s) identified!\n` + chains.map(c => `  [${c.impact.toUpperCase()}] ${c.chain}`).join('\n')
    : '✓ No critical attack chains identified from current findings.';

  return { chains, riskEscalations: escalations, summary, findingCount: findings.length, typesDetected: [...allTypes] };
}

export default { correlateFindings };
