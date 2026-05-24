import { MODE_CONFIGS } from './config.js';

const MODE_PATTERNS = {
  recon: [
    'recon', 'enumerate', 'enumeration', 'discover', 'mapping', 'fingerprint',
    'port scan', 'portscan', 'subdomain', 'dns', 'whois', 'osint', 'banner grab',
    'technolog', 'what web', 'whatweb', 'attack surface', 'asset discovery',
    'find services', 'find ports', 'open ports', 'service discovery', 'network scan',
    'sweep', 'ping scan', 'host discovery', 'check host', 'list hosts',
    'dns lookup', 'dns resolve', 'mx record', 'ns record'
  ],
  scan: [
    'vulnerability scan', 'vuln scan', 'vulnerability assessment',
    'cve', 'nmap', 'nuclei', 'nikto', 'scan for vuln', 'find vulnerabilit',
    'check for issue', 'security scan', 'run scan', 'vulnerability check',
    'cve search', 'cve lookup', 'cve check', 'nessus', 'openvas',
    'scan target', 'scan this', 'run a scan', 'perform scan',
    'qualys', 'acunetix', 'burp scan', 'zap scan',
    'ssl scan', 'tls scan', 'certificate check', 'cipher check',
    'http header', 'security header', 'misconfig', 'vulnerable'
  ],
  exploit: [
    'exploit', 'payload', 'xss', 'sqli', 'sql injection', 'lfi', 'ssrf',
    'buffer overflow', 'rce', 'remote code execution', 'pwn', 'shell',
    'meterpreter', 'reverse shell', 'bind shell', 'get access',
    'privilege escalation', 'privesc', 'lateral movement', 'pivot',
    'crack', 'hash', 'password spray', 'brute force', 'bruteforce',
    'csrf', 'ssti', 'command injection', 'cmdi', 'file upload',
    'deserialization', 'idor', 'broken access', 'auth bypass',
    'bypass authentication', 'takeover', 'subdomain takeover',
    'race condition', 'timing attack', 'side channel'
  ],
  report: [
    'report', 'generate report', 'documentation', 'findings summary',
    'executive summary', 'write up', 'pentest report', 'security report',
    'remediation', 'recommendation', 'final report', 'deliverable',
    'prove', 'evidence', 'proof of concept', 'poc',
    'write report', 'create report', 'export findings',
    'risk rating', 'cvss score', 'severity summary'
  ],
  osint: [
    'osint', 'passive', 'gather info', 'information gathering',
    'search', 'lookup', 'shodan', 'censys', 'theHarvester', 'maltego',
    'social media', 'email find', 'email harvest', 'phone lookup',
    'breach', 'leaked credential', 'data leak', 'have i been pwned',
    'github recon', 'git recon', 'job posting', 'employee',
    'google dork', 'google hacking', 'dork', 'public source',
    'certificate transparency', 'crt.sh', 'wayback machine'
  ],
  audit: [
    'audit', 'code review', 'review code', 'static analysis',
    'source code review', 'code audit', 'security review',
    'lint', 'semgrep', 'eslint security', 'code analysis',
    'inspect code', 'check code', 'find bug', 'find flaw',
    'hardcoded secret', 'api key', 'credential in code',
    'dependency check', 'supply chain', 'sast',
    'taint analysis', 'data flow', 'control flow'
  ]
};

function normalizeInput(input) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function detectMode(input) {
  if (!input || typeof input !== 'string') return null;

  const normalized = normalizeInput(input);
  const scores = {};

  for (const [mode, patterns] of Object.entries(MODE_PATTERNS)) {
    scores[mode] = 0;
    for (const pattern of patterns) {
      let count = 0;
      let idx = 0;
      while ((idx = normalized.indexOf(pattern, idx)) !== -1) {
        count++;
        idx += pattern.length;
      }
      if (count > 0) {
        // Exact word boundary bonus
        scores[mode] += count * 2;
      }
    }

    // Bonus for exact prefix matches (e.g. "scan example.com")
    for (const pattern of patterns) {
      if (normalized.startsWith(pattern + ' ') || normalized === pattern) {
        scores[mode] += 3;
        break;
      }
    }
  }

  // Find best mode
  let bestMode = null;
  let bestScore = 0;

  for (const [mode, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode;
    }
  }

  // Return null if score is too low (no clear intent)
  return bestScore >= 4 ? bestMode : null;
}
