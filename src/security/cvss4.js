/**
 * CVSS 4.0 Auto-Scoring Engine
 * Calculates CVSS 4.0 base scores for security findings.
 * Reference: https://www.first.org/cvss/v4.0/specification-document
 */

// CVSS 4.0 metric values and weights (simplified base score calculation)
const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };  // Attack Vector
const AC = { L: 0.77, H: 0.44 };                      // Attack Complexity
const AT = { N: 0.0, P: 0.1 };                        // Attack Requirements
const PR = { N: 0.85, L: 0.62, H: 0.27 };             // Privileges Required
const UI = { N: 0.85, P: 0.62, A: 0.27 };             // User Interaction
const VC = { H: 0.56, L: 0.22, N: 0.0 };              // Confidentiality Impact (Vulnerable)
const VI = { H: 0.56, L: 0.22, N: 0.0 };              // Integrity Impact (Vulnerable)
const VA = { H: 0.56, L: 0.22, N: 0.0 };              // Availability Impact (Vulnerable)

// Vulnerability type to CVSS 4.0 vector mapping
const VULN_VECTORS = {
  'sqli': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'xss': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'P', VC: 'L', VI: 'L', VA: 'N' },
  'stored_xss': { AV: 'N', AC: 'L', AT: 'N', PR: 'L', UI: 'P', VC: 'L', VI: 'L', VA: 'N' },
  'cmdi': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'ssrf': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'L', VA: 'N' },
  'lfi': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'N', VA: 'N' },
  'rfi': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'xxe': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'N', VA: 'L' },
  'ssti': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'idor': { AV: 'N', AC: 'L', AT: 'N', PR: 'L', UI: 'N', VC: 'H', VI: 'L', VA: 'N' },
  'csrf': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'P', VC: 'N', VI: 'L', VA: 'N' },
  'open_redirect': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'P', VC: 'N', VI: 'L', VA: 'N' },
  'cors_misconfig': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'P', VC: 'H', VI: 'N', VA: 'N' },
  'jwt_none': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'N' },
  'jwt_confusion': { AV: 'N', AC: 'H', AT: 'P', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'N' },
  'jwt_weak_secret': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'N' },
  'missing_header': { AV: 'N', AC: 'H', AT: 'P', PR: 'N', UI: 'P', VC: 'N', VI: 'L', VA: 'N' },
  'secret_exposed': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'pii_exposed': { AV: 'N', AC: 'L', AT: 'N', PR: 'L', UI: 'N', VC: 'H', VI: 'N', VA: 'N' },
  'log4shell': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'H' },
  'path_traversal': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'N', VA: 'N' },
  'nosqli': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'H', VI: 'H', VA: 'N' },
  'race_condition': { AV: 'N', AC: 'H', AT: 'P', PR: 'L', UI: 'N', VC: 'L', VI: 'H', VA: 'N' },
  'default': { AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N', VC: 'L', VI: 'L', VA: 'N' },
};

/**
 * Calculate CVSS 4.0 base score from a vector.
 */
function calculateScore(vector) {
  const impact = 1 - (1 - VC[vector.VC]) * (1 - VI[vector.VI]) * (1 - VA[vector.VA]);
  const exploitability = AV[vector.AV] * AC[vector.AC] * (1 - AT[vector.AT]) * PR[vector.PR] * UI[vector.UI];

  if (impact <= 0) return 0.0;

  const raw = 0.6 * impact + 0.4 * exploitability;
  return Math.min(10.0, Math.round(raw * 10 * 10) / 10);
}

/**
 * Get severity label from score.
 */
function getSeverity(score) {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'info';
}

/**
 * Build CVSS 4.0 vector string.
 */
function vectorString(vector) {
  return `CVSS:4.0/AV:${vector.AV}/AC:${vector.AC}/AT:${vector.AT}/PR:${vector.PR}/UI:${vector.UI}/VC:${vector.VC}/VI:${vector.VI}/VA:${vector.VA}`;
}

/**
 * Score a finding by vulnerability type.
 * @param {string} vulnType - e.g. 'sqli', 'xss', 'ssrf'
 * @param {object} [overrides] - optional metric overrides { AV, AC, PR, ... }
 * @returns {{ score: number, severity: string, vector: string, metrics: object }}
 */
export function scoreFinding(vulnType, overrides = {}) {
  const base = VULN_VECTORS[vulnType] || VULN_VECTORS.default;
  const vector = { ...base, ...overrides };
  const score = calculateScore(vector);
  return {
    score,
    severity: getSeverity(score),
    vector: vectorString(vector),
    metrics: vector
  };
}

/**
 * Auto-detect vuln type from finding title/description and score it.
 */
export function autoScore(finding) {
  const text = `${finding.title || ''} ${finding.detail || ''}`.toLowerCase();

  let type = 'default';
  if (text.includes('sql injection') || text.includes('sqli')) type = 'sqli';
  else if (text.includes('stored xss')) type = 'stored_xss';
  else if (text.includes('xss') || text.includes('cross-site scripting')) type = 'xss';
  else if (text.includes('command injection') || text.includes('cmdi') || text.includes('rce')) type = 'cmdi';
  else if (text.includes('ssrf')) type = 'ssrf';
  else if (text.includes('local file') || text.includes('lfi') || text.includes('path traversal')) type = 'lfi';
  else if (text.includes('xxe')) type = 'xxe';
  else if (text.includes('ssti') || text.includes('template injection')) type = 'ssti';
  else if (text.includes('idor') || text.includes('insecure direct')) type = 'idor';
  else if (text.includes('csrf')) type = 'csrf';
  else if (text.includes('open redirect')) type = 'open_redirect';
  else if (text.includes('cors')) type = 'cors_misconfig';
  else if (text.includes('jwt') && text.includes('none')) type = 'jwt_none';
  else if (text.includes('jwt') && text.includes('confusion')) type = 'jwt_confusion';
  else if (text.includes('jwt') && text.includes('weak')) type = 'jwt_weak_secret';
  else if (text.includes('secret') || text.includes('api key') || text.includes('token')) type = 'secret_exposed';
  else if (text.includes('pii') || text.includes('credit card') || text.includes('ssn')) type = 'pii_exposed';
  else if (text.includes('log4') || text.includes('jndi')) type = 'log4shell';
  else if (text.includes('nosql')) type = 'nosqli';
  else if (text.includes('race condition')) type = 'race_condition';
  else if (text.includes('missing') && text.includes('header')) type = 'missing_header';

  return { ...scoreFinding(type), vulnType: type };
}

export default { scoreFinding, autoScore };
