// SANS Top 25 Software Errors Profile

export const SANS_TOP25_PROFILE = {
  name: 'SANS Top 25',
  description: 'Most Dangerous Software Errors (SANS Top 25)',
  category: 'general',

  // CWE mappings to SANS Top 25
  cweIds: [
    'CWE-119',   // Buffer Overflows
    'CWE-79',    // Cross-site Scripting (XSS)
    'CWE-20',    // Improper Input Validation
    'CWE-200',   // Information Exposure
    'CWE-89',    // SQL Injection
    'CWE-78',    // OS Command Injection
    'CWE-416',   // Use After Free
    'CWE-352',   // Cross-Site Request Forgery
    'CWE-94',    // Code Injection
    'CWE-287',   // Improper Authentication
    'CWE-22',    // Path Traversal
    'CWE-434',   // Unrestricted File Upload
    'CWE-611',   // XML External Entity (XXE)
    'CWE-502',   // Deserialization of Untrusted Data
    'CWE-255',   // Credentials Management
    'CWE-200',   // Information Exposure Through Error Message
    'CWE-295',   // Improper Certificate Validation
    'CWE-266',   // Incorrect Privilege Assignment
    'CWE-284',   // Access Control
    'CWE-191',   // Integer Underflow
    'CWE-190',   // Integer Overflow
    'CWE-754',   // Improper Check for Unusual Conditions
    'CWE-772',   // Missing Release of Resource
    'CWE-362',   // Race Condition
    'CWE-400',   // Resource Exhaustion
    'CWE-863',   // Incorrect Authorization
    'CWE-918',   // Server-Side Request Forgery (SSRF)
    'CWE-611',   // XXE Injection
    'CWE-308',   // Use of Single-Factor Authentication
    'CWE-640',   // Weak Password Recovery
  ],

  checks: [
    // A1:2017 - Injection
    {
      id: 'SANS-INJ-001',
      cwe: 'CWE-89',
      name: 'SQL Injection',
      description: 'Check for SQL injection vulnerabilities',
      severity: 'critical',
      patterns: [
        'executeQuery',
        'statement.execute',
        'SELECT.*FROM.*WHERE.*+',
        'INSERT INTO.*VALUES.*+',
        'DELETE FROM.*+'
      ]
    },
    {
      id: 'SANS-INJ-002',
      cwe: 'CWE-78',
      name: 'OS Command Injection',
      description: 'Check for OS command injection',
      severity: 'critical',
      patterns: [
        'exec\\(',
        'system\\(',
        'popen\\(',
        'shell_exec',
        'Runtime\\.getRuntime\\(\\).*exec'
      ]
    },
    {
      id: 'SANS-INJ-003',
      cwe: 'CWE-94',
      name: 'Code Injection',
      description: 'Check for code injection vulnerabilities',
      severity: 'critical',
      patterns: [
        'eval\\(',
        'Function\\(',
        'setTimeout.*\\(',
        'setInterval.*\\(',
        'new Function'
      ]
    },

    // A2:2017 - Broken Authentication
    {
      id: 'SANS-AUTH-001',
      cwe: 'CWE-287',
      name: 'Improper Authentication',
      description: 'Check for authentication weaknesses',
      severity: 'high',
      patterns: [
        'if.*password',
        'login.*==.*true',
        'auth.*success',
        '// TODO.*auth'
      ]
    },
    {
      id: 'SANS-AUTH-002',
      cwe: 'CWE-640',
      name: 'Weak Password Recovery',
      description: 'Check for weak password recovery mechanisms',
      severity: 'medium',
      patterns: [
        'password.*email',
        'reset.*token',
        'forgot.*password'
      ]
    },

    // A3:2017 - Sensitive Data Exposure
    {
      id: 'SANS-SENS-001',
      cwe: 'CWE-200',
      name: 'Information Exposure',
      description: 'Check for sensitive data exposure',
      severity: 'high',
      patterns: [
        'password.*=',
        'secret.*=',
        'apiKey.*=',
        'token.*=',
        'private.*key'
      ]
    },
    {
      id: 'SANS-SENS-002',
      cwe: 'CWE-255',
      name: 'Hardcoded Credentials',
      description: 'Check for hardcoded credentials',
      severity: 'critical',
      patterns: [
        'const.*password.*=.*["\']',
        'const.*apiKey.*=.*["\']',
        'define.*PASSWORD',
        'String.*password.*=.*"'
      ]
    },

    // A4:2017 - XML External Entities
    {
      id: 'SANS-XXE-001',
      cwe: 'CWE-611',
      name: 'XML External Entity',
      description: 'Check for XXE vulnerabilities',
      severity: 'high',
      patterns: [
        'DocumentBuilder',
        'SAXParser',
        'TransformerFactory',
        'XMLReader'
      ]
    },

    // A5:2017 - Broken Access Control
    {
      id: 'SANS-AC-001',
      cwe: 'CWE-284',
      name: 'Missing Access Control',
      description: 'Check for missing authorization',
      severity: 'high',
      patterns: [
        '// TODO.*check.*permission',
        '// TODO.*authorization',
        'if.*user.*==.*null'
      ]
    },

    // A6:2017 - Security Misconfiguration
    {
      id: 'SANS-MISC-001',
      cwe: 'CWE-16',
      name: 'Security Misconfiguration',
      description: 'Check for security misconfigurations',
      severity: 'medium',
      patterns: [
        'debug.*=.*true',
        'cors.*=.*\\*',
        'Access-Control-Allow-Origin'
      ]
    },

    // A7:2017 - Cross-Site Scripting (XSS)
    {
      id: 'SANS-XSS-001',
      cwe: 'CWE-79',
      name: 'Cross-Site Scripting',
      description: 'Check for XSS vulnerabilities',
      severity: 'high',
      patterns: [
        'innerHTML.*=',
        'outerHTML.*=',
        'document\\.write',
        '\\.html\\(',
        'dangerouslySetInnerHTML'
      ]
    },

    // A8:2017 - Insecure Deserialization
    {
      id: 'SANS-DES-001',
      cwe: 'CWE-502',
      name: 'Insecure Deserialization',
      description: 'Check for insecure deserialization',
      severity: 'critical',
      patterns: [
        'JSON\\.parse',
        'ObjectMapper',
        'ObjectInputStream',
        'pickle\\.loads',
        'yaml\\.load'
      ]
    },

    // A9:2017 - Using Components with Known Vulnerabilities
    {
      id: 'SANS-COMP-001',
      cwe: 'CWE-1104',
      name: 'Outdated Components',
      description: 'Check for outdated dependencies',
      severity: 'medium',
      patterns: [
        'package\\.json',
        'requirements\\.txt',
        'pom\\.xml',
        'build\\.gradle'
      ]
    },

    // A10:2017 - Insufficient Logging
    {
      id: 'SANS-LOG-001',
      cwe: 'CWE-778',
      name: 'Insufficient Logging',
      description: 'Check for logging gaps',
      severity: 'low',
      patterns: [
        '// TODO.*log',
        'catch.*// empty',
        'catch.*pass'
      ]
    }
  ],

  // Remediation guidance
  remediation: {
    injection: 'Use parameterized queries, prepared statements, or ORM frameworks',
    authentication: 'Implement multi-factor authentication, secure session management',
    sensitiveData: 'Encrypt sensitive data at rest and in transit, use secure key management',
    xss: 'Use output encoding, Content Security Policy, and HTTP-only cookies',
    deserialization: 'Validate and sanitize all deserialized data, use safe serialization formats',
    accessControl: 'Implement role-based access control, validate permissions on every request'
  }
};

export default SANS_TOP25_PROFILE;