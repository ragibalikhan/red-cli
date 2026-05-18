import chalk from 'chalk';
import { SecurityMemory } from './memory.js';

export class SecuritySession {
  constructor() {
    this.currentTarget = null;
    this.currentFindings = [];
    this.commandHistory = [];
    this.securityMemory = new SecurityMemory();
    this.mode = 'menu'; // menu, scan, pentest, etc.
  }

  setTarget(target, findings = []) {
    this.currentTarget = target;
    this.currentFindings = findings;
    this.commandHistory.push({
      timestamp: new Date().toISOString(),
      command: 'scan',
      target,
      findingsCount: findings.length,
      severity: this.summarize(findings)
    });
  }

  summarize(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) {
      const sev = (f.severity || 'info').toLowerCase();
      if (counts[sev] !== undefined) counts[sev]++;
    }
    return counts;
  }

  getContext() {
    const recentScans = this.securityMemory.getRecent(5);
    return {
      currentTarget: this.currentTarget,
      currentFindings: this.currentFindings,
      currentSeverity: this.summarize(this.currentFindings),
      recentScans,
      commandHistory: this.commandHistory.slice(-10),
      technologies: this.securityMemory.getTechnologies(),
      targets: this.securityMemory.getAllTargets(),
      totalScans: this.securityMemory.scans.scans.length
    };
  }

  displayMenu() {
    const scanCount = this.securityMemory.scans.scans.length;
    const techCount = this.securityMemory.getTechnologies().length;

    return chalk.red(`
╭─ 🔴 Security Command Center ──────────────────────────╮
│                                                             │
│  ${chalk.cyan('━━━ SCANNING ━━━')}
│  ${chalk.cyan('1)')} ${chalk.white('Scan Target')}      ${chalk.dim('- Quick vulnerability scan')}
│  ${chalk.cyan('2)')} ${chalk.white('Pentest')}          ${chalk.dim('- Full penetration test')}
│  ${chalk.cyan('3)')} ${chalk.white('Recon')}            ${chalk.dim('- Intelligence gathering')}
│                                                             │
│  ${chalk.cyan('━━━ SPECIALIZED ━━━')}
│  ${chalk.cyan('4)')} ${chalk.white('Secrets')}         ${chalk.dim('- Find exposed secrets')}
│  ${chalk.cyan('5)')} ${chalk.white('CVEs')}            ${chalk.dim('- Look up vulnerabilities')}
│  ${chalk.cyan('6)')} ${chalk.white('VPAT')}             ${chalk.dim('- Accessibility audit')}
│                                                             │
│  ${chalk.cyan('━━━ ANALYSIS & CONTINUE ━━━')}
│  ${chalk.cyan('7)')} ${chalk.white('History')}         ${chalk.dim('- View previous scans')}
│  ${chalk.cyan('8)')} ${chalk.white('Findings')}         ${chalk.dim('- Analyze stored findings')}
│  ${chalk.cyan('9)')} ${chalk.white('AI Analyze')}       ${chalk.dim('- AI-powered analysis')}
│  ${chalk.cyan('10)')} ${chalk.white('Continue')}        ${chalk.dim('- Use findings for pentest')}
│  ${chalk.cyan('11)')} ${chalk.white('Report')}          ${chalk.dim('- Generate security report')}
│                                                             │
│  ${chalk.cyan('━━━ TOOLS ━━━')}
│  ${chalk.cyan('12)')} ${chalk.white('Tools')}          ${chalk.dim('- Show available tools')}
│  ${chalk.cyan('13)')} ${chalk.white('Targets')}         ${chalk.dim('- List all scanned targets')}
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  📊 Session: ${this.currentTarget ? chalk.yellow(this.currentTarget.padEnd(30)) : chalk.dim('No target selected')}
│  📁 Memory: ${chalk.cyan(scanCount)} scans | ${chalk.cyan(techCount)} technologies
╰─────────────────────────────────────────────────────────────╯

${chalk.dim('Select option (1-13) or enter a target URL/IP: ')}
`);
  }

  displayHistory() {
    const scans = this.securityMemory.getRecent(10);
    if (scans.length === 0) {
      console.log(chalk.yellow('\n  No scans in memory. Run a scan first.\n'));
      return;
    }

    console.log(chalk.cyan('\n╭─ 📜 Scan History ────────────────────────────────────╮'));
    console.log(chalk.cyan('│'));
    for (let i = 0; i < scans.length; i++) {
      const scan = scans[i];
      const { critical, high, medium, low } = scan.summary;
      const total = critical + high + medium + low;
      const date = new Date(scan.timestamp).toLocaleString();

      console.log(chalk.cyan(`│  ${chalk.yellow((i + 1).toString().padStart(2))}.`) + chalk.white(scan.target.padEnd(35)));
      console.log(chalk.cyan('│     ') + chalk.dim(date));
      console.log(chalk.cyan('│     ') + `${critical}C ${high}H ${medium}M ${low}L` + chalk.dim(` (${total} issues)`));

      if (scan.technologies?.length) {
        console.log(chalk.cyan('│     ') + chalk.dim(`Tech: ${scan.technologies.join(', ')}`));
      }
      console.log(chalk.cyan('│'));
    }
    console.log(chalk.cyan('╰──────────────────────────────────────────────────────╯\n'));
  }

  displayFindings(target) {
    const scans = this.securityMemory.getByTarget(target || this.currentTarget);
    if (scans.length === 0) {
      console.log(chalk.yellow('\n  No findings found. Run a scan first.\n'));
      return;
    }

    const scan = scans[0];
    const { critical, high, medium, low, info } = scan.summary;

    console.log(chalk.cyan(`\n╭─ 🔍 Findings: ${target || this.currentTarget} ──────────────────────────────╮`));
    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('│  ') + `Scan: ${new Date(scan.timestamp).toLocaleString()}`);
    console.log(chalk.cyan('│  ') + `Issues: ${chalk.red(critical + ' critical, ')}${chalk.yellow(high + ' high, ')}${chalk.blue(medium + ' medium, ')}${chalk.cyan(low + ' low')}`);
    console.log(chalk.cyan('│'));

    if (critical > 0) {
      console.log(chalk.red('│  CRITICAL:'));
      scan.findings.filter(f => f.severity === 'critical').forEach(f => {
        console.log(chalk.cyan('│    • ') + chalk.red(f.title));
        if (f.fix) console.log(chalk.green('│      Fix: ') + chalk.dim(f.fix));
      });
    }

    if (high > 0) {
      console.log(chalk.yellow('│  HIGH:'));
      scan.findings.filter(f => f.severity === 'high').forEach(f => {
        console.log(chalk.cyan('│    • ') + chalk.yellow(f.title));
        if (f.fix) console.log(chalk.green('│      Fix: ') + chalk.dim(f.fix));
      });
    }

    console.log(chalk.cyan('╰──────────────────────────────────────────────────────╯\n'));
  }

  displayTargets() {
    const targets = this.securityMemory.getAllTargets();
    if (targets.length === 0) {
      console.log(chalk.yellow('\n  No targets scanned yet.\n'));
      return;
    }

    console.log(chalk.cyan('\n╭─ 🎯 Scanned Targets ─────────────────────────────────╮'));
    console.log(chalk.cyan('│'));

    for (const target of targets) {
      const scans = this.securityMemory.getByTarget(target);
      const latest = scans[0];
      const { critical, high, medium, low } = latest?.summary || {};
      console.log(chalk.cyan('│  ') + chalk.yellow('• ') + chalk.white(target));
      console.log(chalk.cyan('│    ') + chalk.dim(`${scans.length} scan(s) | ${critical || 0}C ${high || 0}H ${medium || 0}M ${low || 0}L`));
      console.log(chalk.cyan('│'));
    }

    console.log(chalk.cyan('╰──────────────────────────────────────────────────────╯\n'));
  }

  getOptionHandler(option) {
    const handlers = {
      '1': { cmd: 'scan', prompt: 'Enter target URL/IP to scan:' },
      '2': { cmd: 'pentest', prompt: 'Enter target URL for pentest:' },
      '3': { cmd: 'recon', prompt: 'Enter target for recon:' },
      '4': { cmd: 'secrets', prompt: 'Enter path to scan for secrets:' },
      '5': { cmd: 'cves', prompt: 'Enter component (e.g., nginx 1.24.0):' },
      '6': { cmd: 'vpat', prompt: 'Enter URL for accessibility test:' },
      '7': { cmd: 'history', action: () => this.displayHistory() },
      '8': { cmd: 'findings', prompt: 'Enter target (or press Enter for current):' },
      '9': { cmd: 'ai-analyze', action: () => 'AI_ANALYZE' },
      '10': { cmd: 'continue', prompt: 'Enter target to continue from:' },
      '11': { cmd: 'report', action: () => 'GENERATE_REPORT' },
      '12': { cmd: 'tools', action: () => 'SHOW_TOOLS' },
      '13': { cmd: 'targets', action: () => this.displayTargets() }
    };
    return handlers[option] || null;
  }
}

export default SecuritySession;