import chalk from 'chalk';

export const OWASP_TOP10_PROFILE = {
  name: 'OWASP Top 10 (2021)',
  description: 'Standard OWASP Top 10 vulnerability testing methodology',
  version: '2021',
  categories: [
    {
      id: 'A01',
      name: 'Broken Access Control',
      severity: 'critical',
      checks: [
        { id: 'A01-01', name: 'Horizontal Privilege Escalation', description: 'Test changing user IDs in API requests' },
        { id: 'A01-02', name: 'Vertical Privilege Escalation', description: 'Access admin endpoints with regular user account' },
        { id: 'A01-03', name: 'IDOR', description: 'Test direct object references in URLs and parameters' },
        { id: 'A01-04', name: 'Forced Browsing', description: 'Access restricted pages via direct URL manipulation' },
        { id: 'A01-05', name: 'CORS Misconfiguration', description: 'Test CORS headers and origin validation' }
      ]
    },
    {
      id: 'A02',
      name: 'Cryptographic Failures',
      severity: 'high',
      checks: [
        { id: 'A02-01', name: 'HTTPS Enforcement', description: 'Test HTTP to HTTPS redirect behavior' },
        { id: 'A02-02', name: 'Weak TLS Configuration', description: 'Check SSL/TLS versions and cipher suites' },
        { id: 'A02-03', name: 'Sensitive Data Exposure', description: 'Check API responses for sensitive data' },
        { id: 'A02-04', name: 'Weak Encryption', description: 'Test encryption algorithm strength' }
      ]
    },
    {
      id: 'A03',
      name: 'Injection',
      severity: 'critical',
      checks: [
        { id: 'A03-01', name: 'SQL Injection', description: "Test with ' OR '1'='1 and UNION SELECT payloads" },
        { id: 'A03-02', name: 'NoSQL Injection', description: 'Test with MongoDB operators ($ne, $gt, $where)' },
        { id: 'A03-03', name: 'Command Injection', description: 'Test with ; ls -la, $(whoami), | cat /etc/passwd' },
        { id: 'A03-04', name: 'LDAP Injection', description: 'Test with * in LDAP queries' },
        { id: 'A03-05', name: 'XSS', description: 'Test with <script>alert(1), <img onerror>' },
        { id: 'A03-06', name: 'SSRF', description: 'Test internal resource access (169.254.169.254)' }
      ]
    },
    {
      id: 'A04',
      name: 'Insecure Design',
      severity: 'high',
      checks: [
        { id: 'A04-01', name: 'Rate Limiting', description: 'Send rapid requests to test rate limiting' },
        { id: 'A04-02', name: 'Account Enumeration', description: 'Test invalid usernames for different responses' },
        { id: 'A04-03', name: 'Business Logic', description: 'Test workflow bypass and manipulation' }
      ]
    },
    {
      id: 'A05',
      name: 'Security Misconfiguration',
      severity: 'high',
      checks: [
        { id: 'A05-01', name: 'Default Credentials', description: 'Try admin/admin, root/root, administrator/password' },
        { id: 'A05-02', name: 'Information Disclosure', description: 'Check error messages for sensitive info' },
        { id: 'A05-03', name: 'Security Headers', description: 'Check for CSP, X-Frame-Options, HSTS' },
        { id: 'A05-04', name: 'Debug Mode', description: 'Check for debug endpoints or modes' }
      ]
    },
    {
      id: 'A06',
      name: 'Vulnerable and Outdated Components',
      severity: 'high',
      checks: [
        { id: 'A06-01', name: 'Outdated Dependencies', description: 'Run dependency scanner for known CVEs' },
        { id: 'A06-02', name: 'Unpatched Software', description: 'Check versions against CVE databases' },
        { id: 'A06-03', name: 'Unused Dependencies', description: 'Identify unused packages in dependencies' }
      ]
    },
    {
      id: 'A07',
      name: 'Identification and Authentication Failures',
      severity: 'high',
      checks: [
        { id: 'A07-01', name: 'Weak Password Policy', description: 'Test password complexity requirements' },
        { id: 'A07-02', name: 'Brute Force Protection', description: 'Test login with multiple failed attempts' },
        { id: 'A07-03', name: 'Session Management', description: 'Test session fixation and hijacking' },
        { id: 'A07-04', name: 'MFA Bypass', description: 'Test multi-factor authentication mechanisms' },
        { id: 'A07-05', name: 'Password Reset', description: 'Test token predictability in password reset' }
      ]
    },
    {
      id: 'A08',
      name: 'Software and Data Integrity Failures',
      severity: 'critical',
      checks: [
        { id: 'A08-01', name: 'Deserialization', description: 'Test unsafe deserialization handling' },
        { id: 'A08-02', name: 'CI/CD Injection', description: 'Check for CI/CD pipeline vulnerabilities' },
        { id: 'A08-03', name: 'Subresource Integrity', description: 'Check CDN resource hash validation' }
      ]
    },
    {
      id: 'A09',
      name: 'Security Logging and Monitoring Failures',
      severity: 'medium',
      checks: [
        { id: 'A09-01', name: 'Failed Login Logging', description: 'Verify logs capture failed login attempts' },
        { id: 'A09-02', name: 'Sensitive Data in Logs', description: 'Check for passwords/tokens in log files' },
        { id: 'A09-03', name: 'Monitoring Coverage', description: 'Check for security event monitoring' }
      ]
    },
    {
      id: 'A10',
      name: 'Server-Side Request Forgery (SSRF)',
      severity: 'high',
      checks: [
        { id: 'A10-01', name: 'URL Parameter Testing', description: 'Test for internal resource access via URLs' },
        { id: 'A10-02', name: 'Cloud Metadata', description: 'Try accessing 169.254.169.254 metadata' },
        { id: 'A10-03', name: 'Internal Port Scanning', description: 'Test internal service access' }
      ]
    }
  ],

  getCheck(id) {
    for (const cat of this.categories) {
      const check = cat.checks.find(c => c.id === id);
      if (check) return { ...check, category: cat };
    }
    return null;
  },

  display() {
    console.log(chalk.red(`
╭─ 📋 OWASP Top 10 (2021) Profile ────────────────────────────────╮
│
│  This profile implements the current OWASP Top 10 vulnerability
│  categories for comprehensive security assessments.
│
│  Categories:`));

    for (const cat of this.categories) {
      const icon = cat.severity === 'critical' ? '🔴' : cat.severity === 'high' ? '🟠' : '🟡';
      console.log(chalk.red(`│    ${icon} ${cat.id} ${cat.name}`));
    }

    console.log(chalk.red(`
╰─────────────────────────────────────────────────────────────────╯
    `));
  }
};

export default OWASP_TOP10_PROFILE;