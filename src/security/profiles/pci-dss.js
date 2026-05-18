import chalk from 'chalk';

export const PCI_DSS_PROFILE = {
  name: 'PCI DSS Compliance',
  description: 'Payment Card Industry Data Security Standard testing',
  version: '4.0',
  requirements: [
    {
      id: '1.1',
      name: 'Install and Maintain Network Security Controls',
      controls: [
        { id: '1.1.1', name: 'Firewall Configuration', description: 'Review firewall rules and configurations' },
        { id: '1.1.2', name: 'Change Management', description: 'Test change control processes' }
      ]
    },
    {
      id: '2.1',
      name: 'Change All Vendor-Supplied Defaults',
      controls: [
        { id: '2.1.1', name: 'Default Passwords', description: 'Check for default credentials on all systems' },
        { id: '2.1.2', name: 'Default Security', description: 'Test default security configurations' }
      ]
    },
    {
      id: '3.1',
      name: 'Keep Cardholder Data Protection Policies',
      controls: [
        { id: '3.1.1', name: 'Data Retention', description: 'Check data retention policies' },
        { id: '3.1.2', name: 'Data Disposal', description: 'Test data destruction procedures' }
      ]
    },
    {
      id: '4.1',
      name: 'Encrypt Transmission of Cardholder Data',
      controls: [
        { id: '4.1.1', name: 'TLS Encryption', description: 'Verify TLS 1.2+ is used for all transmissions' },
        { id: '4.1.2', name: 'Certificate Validation', description: 'Test certificate validation' }
      ]
    },
    {
      id: '5.1',
      name: 'Protect All Systems from Malware',
      controls: [
        { id: '5.1.1', name: 'Anti-virus', description: 'Verify anti-malware solutions are installed' },
        { id: '5.1.2', name: 'Updates', description: 'Check malware definitions are current' }
      ]
    },
    {
      id: '6.1',
      name: 'Develop and Maintain Secure Systems',
      controls: [
        { id: '6.1.1', name: 'Patching', description: 'Verify security patches are applied' },
        { id: '6.2', name: 'Secure Development', description: 'Test secure coding practices' }
      ]
    },
    {
      id: '7.1',
      name: 'Restrict Access to Cardholder Data',
      controls: [
        { id: '7.1.1', name: 'Least Privilege', description: 'Verify least privilege access model' },
        { id: '7.1.2', name: 'Access Reviews', description: 'Test access control mechanisms' }
      ]
    },
    {
      id: '8.1',
      name: 'Identify and Authenticate Access to System Components',
      controls: [
        { id: '8.1.1', name: 'User Authentication', description: 'Verify user identification procedures' },
        { id: '8.2', name: 'Password Requirements', description: 'Test password policy compliance' },
        { id: '8.3', name: 'MFA', description: 'Verify multi-factor authentication is used' }
      ]
    },
    {
      id: '9.1',
      name: 'Restrict Physical Access to Cardholder Data',
      controls: [
        { id: '9.1', name: 'Physical Security', description: 'Review physical security controls' }
      ]
    },
    {
      id: '10.1',
      name: 'Implement Logging and Monitoring',
      controls: [
        { id: '10.1.1', name: 'Audit Logs', description: 'Verify audit logs are generated' },
        { id: '10.2', name: 'Log Analysis', description: 'Test log monitoring and alerting' }
      ]
    },
    {
      id: '11.1',
      name: 'Test Security of Systems',
      controls: [
        { id: '11.1', name: 'Vulnerability Scanning', description: 'Regular vulnerability assessments' },
        { id: '11.2', name: 'Penetration Testing', description: 'Annual penetration testing' }
      ]
    },
    {
      id: '12.1',
      name: 'Information Security Policy',
      controls: [
        { id: '12.1', name: 'Security Policy', description: 'Document security policies and procedures' }
      ]
    }
  ],

  getControls(requirementId) {
    for (const req of this.requirements) {
      if (req.id.startsWith(requirementId)) {
        return req.controls;
      }
    }
    return null;
  },

  display() {
    console.log(chalk.red(`
╭─ 📋 PCI DSS 4.0 Compliance Profile ───────────────────────────────╮
│
│  Payment Card Industry Data Security Standard testing
│  methodology for compliance assessments.
│
│  Requirements:`));

    for (const req of this.requirements.slice(0, 8)) {
      console.log(chalk.red(`│    ✓ ${req.id} ${req.name.substring(0, 45)}`));
    }

    console.log(chalk.red(`
│    ... and ${this.requirements.length - 8} more requirements
╰─────────────────────────────────────────────────────────────────╯
    `));
  }
};

export default PCI_DSS_PROFILE;