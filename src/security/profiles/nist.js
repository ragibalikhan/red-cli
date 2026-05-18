import chalk from 'chalk';

export const NIST_PROFILE = {
  name: 'NIST Cybersecurity Framework',
  description: 'National Institute of Standards and Technology CSF testing',
  version: '2.0',
  functions: [
    {
      id: 'IDENTIFY',
      name: 'Identify',
      description: 'Develop organizational understanding to manage cybersecurity risk',
      categories: [
        { id: 'ID.AM', name: 'Asset Management', checks: ['Inventory', 'Data flow', 'External systems'] },
        { id: 'ID.BE', name: 'Business Environment', checks: ['Mission', 'Role', 'Dependencies'] },
        { id: 'ID.GV', name: 'Governance', checks: ['Policies', 'Legal', 'Risk management'] },
        { id: 'ID.RA', name: 'Risk Assessment', checks: ['Asset vulnerabilities', 'Threat analysis', 'Risk prioritization'] },
        { id: 'ID.RM', name: 'Risk Management Strategy', checks: ['Risk tolerance', 'Mitigation strategies'] },
        { id: 'ID.SC', name: 'Supply Chain Risk Management', checks: ['Supplier relationships', 'Third-party risks'] }
      ]
    },
    {
      id: 'PROTECT',
      name: 'Protect',
      description: 'Develop and implement appropriate safeguards to ensure delivery of services',
      categories: [
        { id: 'PR.AT', name: 'Awareness and Training', checks: ['Security awareness', 'Role-based training'] },
        { id: 'PR.DS', name: 'Data Security', checks: ['Data at rest', 'Data in transit', 'Data masking'] },
        { id: 'PR.IP', name: 'Information Protection', checks: ['Security baselines', 'Configuration management'] },
        { id: 'PR.MA', name: 'Maintenance', checks: ['Maintenance tools', 'Remote maintenance'] },
        { id: 'PR.PT', name: 'Protective Technology', checks: ['边界防护', 'Monitoring', 'Logging'] }
      ]
    },
    {
      id: 'DETECT',
      name: 'Detect',
      description: 'Develop and implement appropriate activities to identify cybersecurity events',
      categories: [
        { id: 'DE.AE', name: 'Anomalies and Events', checks: ['Baseline monitoring', 'Event correlation'] },
        { id: 'DE.CM', name: 'Continuous Monitoring', checks: ['Network monitoring', 'Physical monitoring'] },
        { id: 'DE.DP', name: 'Detection Processes', checks: ['Testing', 'Optimization', 'Communication'] }
      ]
    },
    {
      id: 'RESPOND',
      name: 'Respond',
      description: 'Develop and implement appropriate activities to respond to detected events',
      categories: [
        { id: 'RS.RP', name: 'Response Planning', checks: ['Incident response plan', 'Execution'] },
        { id: 'RS.CO', name: 'Communications', checks: ['Internal communication', 'External communication'] },
        { id: 'RS.AN', name: 'Analysis', checks: ['Impact analysis', 'Forensics'] },
        { id: 'RS.MI', name: 'Mitigation', checks: ['Containment', 'Eradication', 'Recovery'] },
        { id: 'RS.IM', name: 'Improvements', checks: ['Lessons learned', 'Process improvement'] }
      ]
    },
    {
      id: 'RECOVER',
      name: 'Recover',
      description: 'Develop and implement appropriate activities to maintain plans for resilience',
      categories: [
        { id: 'RC.RP', name: 'Recovery Planning', checks: ['Recovery plan', 'Execution'] },
        { id: 'RC.IM', name: 'Improvements', checks: ['Recovery improvements', 'Lessons learned'] },
        { id: 'RC.CO', name: 'Communications', checks: ['Restoration communications', 'Public relations'] }
      ]
    }
  ],

  getCategories(functionId) {
    for (const fn of this.functions) {
      if (fn.id === functionId) {
        return fn.categories;
      }
    }
    return null;
  },

  getAllChecks() {
    const checks = [];
    for (const fn of this.functions) {
      for (const cat of fn.categories) {
        checks.push({ ...cat, function: fn.id });
      }
    }
    return checks;
  },

  display() {
    console.log(chalk.red(`
╭─ 📋 NIST Cybersecurity Framework 2.0 Profile ──────────────────╮
│
│  NIST CSF provides a taxonomy of cybersecurity outcomes and
│  a methodology to assess and manage cybersecurity risk.
│
│  Functions:`));

    for (const fn of this.functions) {
      const categories = fn.categories.length;
      console.log(chalk.red(`│    → ${fn.id}: ${fn.name} (${categories} categories)`));
    }

    console.log(chalk.red(`
╰─────────────────────────────────────────────────────────────────╯
    `));
  }
};

export default NIST_PROFILE;