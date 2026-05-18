import chalk from 'chalk';

export async function interpretToolOutput(agent, toolName, command, rawOutput) {
  const findings = [];

  if (!rawOutput || rawOutput.trim() === '') {
    return { findings };
  }

  const truncatedOutput = rawOutput.slice(0, 4000);

  const prompt = `
You are a senior penetration tester analyzing tool output.

Tool: ${toolName}
Command: ${command}

Raw Output:
${truncatedOutput}

Extract ALL security findings from this output.
For each finding respond ONLY with valid JSON array:
[
  {
    "severity": "critical|high|medium|low|info",
    "title": "Short finding title",
    "detail": "What was found and why it matters",
    "fix": "Specific remediation step",
    "cvss": 0.0,
    "cwe": "CWE-XXX or null",
    "evidence": "The exact line from output that proves this"
  }
]

If no findings, return: []
Return ONLY the JSON array. No other text.

Examples of what to look for:
- Open ports that shouldn't be public
- Missing security headers (CSP, HSTS, X-Frame-Options, etc.)
- Expired/weak SSL certificates
- Default credentials that worked
- Exposed sensitive files (.env, .git, config.php, etc.)
- Version numbers (check for known CVEs)
- Error messages revealing stack traces
- Directory listings enabled
- Authentication bypasses
- Database connections without authentication
- API keys/tokens in source code
- Sensitive data in HTTP responses
`;

  try {
    const response = await agent.provider.sendMessage(
      [{ role: 'user', content: prompt }],
      []
    );

    const content = response.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { findings: parsed };
    }

    return { findings: [] };
  } catch (e) {
    console.log(chalk.dim(`    Interpreter error: ${e.message}`));

    const basicFindings = extractBasicFindings(rawOutput, command);
    return { findings: basicFindings };
  }
}

function extractBasicFindings(output, command) {
  const findings = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.toLowerCase().includes('password') && line.toLowerCase().includes('default')) {
      findings.push({
        severity: 'critical',
        title: 'Default Credentials Found',
        detail: line.slice(0, 200),
        fix: 'Change default credentials immediately',
        evidence: line.slice(0, 100)
      });
    }

    if (line.includes('root:') || line.includes('admin:')) {
      if (!line.includes('denied') && !line.includes('failed')) {
        findings.push({
          severity: 'high',
          title: 'Potential Credential Discovery',
          detail: line.slice(0, 200),
          fix: 'Review and secure credentials',
          evidence: line.slice(0, 100)
        });
      }
    }
  }

  return findings;
}

export function interpretNmapOutput(output) {
  const findings = [];

  const portMatches = output.match(/(\d+)\/(tcp|udp)\s+open\s+(.+)/g) || [];
  const dangerousPorts = {
    '21': 'FTP - often misconfigured or anonymous',
    '23': 'Telnet - unencrypted remote access',
    '3306': 'MySQL - should not be exposed',
    '5432': 'PostgreSQL - should not be exposed',
    '6379': 'Redis - often no authentication',
    '27017': 'MongoDB - often no authentication',
    '9200': 'Elasticsearch - often no authentication',
    '2375': 'Docker - unauthenticated remote access'
  };

  for (const match of portMatches) {
    const m = match.match(/(\d+)\/(tcp|udp)\s+open\s+(.+)/);
    if (m) {
      const port = m[1];
      if (dangerousPorts[port]) {
        findings.push({
          severity: 'high',
          title: `Dangerous Port Exposed: ${port}/${m[2]}`,
          detail: dangerousPorts[port],
          fix: `Restrict access to port ${port} or disable the service if not needed`
        });
      }
    }
  }

  return findings;
}

export function interpretSSLOutput(output) {
  const findings = [];

  if (output.includes('expired') || output.includes('EXPIRED')) {
    findings.push({
      severity: 'critical',
      title: 'SSL Certificate Expired',
      detail: 'The SSL certificate has expired',
      fix: 'Renew the SSL certificate immediately'
    });
  }

  if (output.includes('self signed') || output.includes('self-signed')) {
    findings.push({
      severity: 'medium',
      title: 'Self-Signed SSL Certificate',
      detail: 'Using a self-signed certificate',
      fix: 'Replace with a trusted CA certificate'
    });
  }

  const versionMatch = output.match(/TLS\s*(\d\.?\d?)/i);
  if (versionMatch) {
    const version = versionMatch[1];
    if (parseFloat(version) < 1.2) {
      findings.push({
        severity: 'high',
        title: 'Outdated TLS Version',
        detail: `Using TLS ${version} which has known vulnerabilities`,
        fix: 'Upgrade to TLS 1.2 or higher'
      });
    }
  }

  return findings;
}

export function interpretHTTPHeaders(headers, url) {
  const findings = [];

  const requiredHeaders = {
    'strict-transport-security': 'high',
    'content-security-policy': 'high',
    'x-frame-options': 'medium',
    'x-content-type-options': 'medium',
    'referrer-policy': 'low',
    'permissions-policy': 'low'
  };

  for (const [header, severity] of Object.entries(requiredHeaders)) {
    if (!headers[header]) {
      findings.push({
        severity,
        title: `Missing Security Header: ${header}`,
        detail: `The ${header} header is not set on ${url}`,
        fix: `Add ${header} header to the HTTP response`
      });
    }
  }

  return findings;
}

export default { interpretToolOutput, interpretNmapOutput, interpretSSLOutput, interpretHTTPHeaders };