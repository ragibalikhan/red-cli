import chalk from 'chalk';
import { PlatformDetector, toolExists, execSafe } from './platform.js';
import { ToolsRegistry } from './tools-registry.js';
import { ReconEngine } from './recon.js';
import { VulnerabilityScanner } from './scanner.js';
import { PentestOrchestrator, runAutonomousPentest } from './pentest.js';
import { VPATEngine } from './vpat.js';
import { ExploitEngine, XSS_PAYLOADS, SQLI_PAYLOADS, CMD_PAYLOADS, LFI_PAYLOADS, SSRF_PAYLOADS } from './exploit.js';
import { SecurityReportGenerator } from './report.js';
import { OWASP_TOP10_PROFILE } from './profiles/owasp-top10.js';
import { SANS_TOP25_PROFILE } from './profiles/sans-top25.js';
import { PCI_DSS_PROFILE } from './profiles/pci-dss.js';
import { NIST_PROFILE } from './profiles/nist.js';
import { SecurityMemory } from './memory.js';
import { CVELookup } from './cve-lookup.js';
import { DecisionEngine } from './decision-engine.js';
import { AttackChainExecutor, ATTACK_CHAINS } from './attack-chains.js';
import { interpretToolOutput } from './interpreter.js';
import { parseExploitOutput, formatExploitResult } from './exploit-parser.js';
import * as ToolManager from './tool-manager.js';
import { SecurityScope } from './scope.js';

export class SecurityEngine {
  constructor(config = {}) {
    this.config = config;
    this.platform = new PlatformDetector();
    this.toolsRegistry = new ToolsRegistry();
    this.securityMemory = new SecurityMemory();
    this.scope = new SecurityScope(config.scopePath);
    this.cveLookup = new CVELookup();
    this.recon = null;
    this.scanner = null;
    this.pentest = null;
    this.vpat = null;
    this.exploit = null;
    this.report = null;
    this.sessionData = {
      target: null,
      scope: [],
      findings: [],
      toolsResults: {},
      startTime: null,
      endTime: null
    };
  }

  async initialize() {
    await this.platform.detect();
    await this.toolsRegistry.detectTools(this.platform);
    return this;
  }

  displayBanner() {
    const platform = this.platform.isKali ? 'Kali Linux' :
      `${this.platform.os} ${this.platform.version || ''}`;
    const user = this.platform.isRoot ? 'root ✅' :
      this.platform.hasSudo ? 'sudo ✅' : 'unprivileged';

    console.log(chalk.red.bold(`
╭─ 🔴 Red Security Engine ──────────────────────────────────────╮
│                                                                 │
│  Platform: ${platform}  •  User: ${user}             │
│                                                                 │
│  Tools Available:                                               │
${this.renderToolsStatus()}                                                            │
│  Missing tools: ${this.toolsRegistry.getMissing().slice(0, 3).join(', ') || 'none'}                                │
│  Run red security install-tools to install missing tools      │
│                                                                 │
│  ⚠️  For educational and authorized testing only               │
╰─────────────────────────────────────────────────────────────────╯
    `));
  }

  renderToolsStatus() {
    const status = this.toolsRegistry.getStatus();
    let output = '';

    const categories = ['recon', 'scanning', 'exploitation', 'network', 'code_analysis'];
    for (const cat of categories) {
      const tools = status[cat] || {};
      const available = Object.values(tools).filter(t => t.available).length;
      const total = Object.keys(tools).length;
      output += `│   ${cat.charAt(0).toUpperCase() + cat.slice(1).padEnd(11)}: ${available}/${total} tools  │\n`;
    }

    return output;
  }

  async runRecon(target, options = {}) {
    this.scope.assertAllowed(target, options.active ? 'active reconnaissance' : 'reconnaissance');
    this.sessionData.target = target;
    this.sessionData.startTime = new Date();

    this.recon = new ReconEngine(this.toolsRegistry, this.platform);
    const results = await this.recon.run(target, options);

    this.sessionData.findings.push(...results.findings);
    this.sessionData.toolsResults.recon = results;

    return results;
  }

  async runVulnScan(target, options = {}) {
    this.scope.assertAllowed(target, 'vulnerability scan');
    this.scanner = new VulnerabilityScanner(this.toolsRegistry, this.platform);
    const results = await this.scanner.scan(target, options);

    // Save findings to memory
    if (results.findings && results.findings.length > 0) {
      const metadata = {
        technologies: this.extractTechnologies(results.findings),
        openPorts: this.extractOpenPorts(results.findings),
        httpStatus: this.extractHTTPStatus(results.findings),
        scanType: 'network'
      };
      this.securityMemory.addScan(target, results.findings, metadata);
    }

    this.sessionData.findings.push(...results.findings);
    this.sessionData.toolsResults.vuln = results;

    return results;
  }

  // Extract technologies from findings
  extractTechnologies(findings) {
    const techFinding = findings.find(f => f.type === 'tech' || f.title?.includes('Technologies'));
    if (techFinding) {
      const match = techFinding.title?.match(/Technologies: (.+)/) ||
        techFinding.detail?.match(/([A-Za-z0-9._-]+)/g);
      if (match) {
        return typeof match === 'string' ? [match] : match.slice(1);
      }
    }
    return [];
  }

  // Extract open ports from findings
  extractOpenPorts(findings) {
    const portFinding = findings.find(f => f.type === 'port' || f.title?.includes('Open Ports'));
    if (portFinding?.detail) {
      return portFinding.detail.split('\n').filter(p => p.trim());
    }
    return [];
  }

  // Extract HTTP status from findings
  extractHTTPStatus(findings) {
    const httpFinding = findings.find(f => f.title?.includes('HTTP Status'));
    if (httpFinding?.detail) {
      const match = httpFinding.detail.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  }

  // NEW: CVE lookup method
  async lookupCVEs(component, version = '') {
    return await this.cveLookup.lookup(component, version);
  }

  // NEW: Get scan history
  getScanHistory(limit = 10) {
    return this.securityMemory.getRecent(limit);
  }

  // NEW: Get findings for a target from memory
  getFindingsFromMemory(target) {
    const scans = this.securityMemory.getByTarget(target);
    return scans;
  }

  // NEW: List all scanned targets
  listScannedTargets() {
    return this.securityMemory.getAllTargets();
  }

  // NEW: Get technologies from memory
  getKnownTechnologies() {
    return this.securityMemory.getTechnologies();
  }

  // NEW: Display CVE results
  displayCVEResults(results) {
    this.cveLookup.displayResults(results);
  }

  // NEW: Clear security memory
  clearMemory() {
    this.securityMemory.clear();
  }

  // NEW: List memory
  listMemory() {
    this.securityMemory.list();
  }

  addScopeTarget(target, note = '') {
    return this.scope.add(target, { note });
  }

  removeScopeTarget(target) {
    return this.scope.remove(target);
  }

  listScopeTargets() {
    return this.scope.list();
  }

  clearScopeTargets() {
    this.scope.clear();
  }

  assertTargetInScope(target, action = 'security action') {
    return this.scope.assertAllowed(target, action);
  }

  // NEW: AI-powered analysis of findings
  generateAnalysisPrompt() {
    const context = this.securityMemory.toContext();
    const findings = this.sessionData.findings;

    if (!context.recentScans?.length && findings.length === 0) {
      return null;
    }

    let prompt = chalk.cyan('\n╭─ 🤖 AI Security Analysis ──────────────────────────────╮\n');
    prompt += chalk.cyan('│\n');

    // Current scan findings
    if (findings.length > 0) {
      const bySev = { critical: 0, high: 0, medium: 0, low: 0 };
      findings.forEach(f => {
        const sev = (f.severity || 'info').toLowerCase();
        if (bySev[sev] !== undefined) bySev[sev]++;
      });

      prompt += chalk.cyan('│  Current Scan Analysis:\n');
      prompt += chalk.cyan('│    ') + chalk.red(`${bySev.critical} critical, `) + chalk.yellow(`${bySev.high} high, `) + chalk.blue(`${bySev.medium} medium, `) + chalk.cyan(`${bySev.low} low\n`);
      prompt += chalk.cyan('│\n');

      // Critical findings
      const critical = findings.filter(f => f.severity === 'critical');
      if (critical.length > 0) {
        prompt += chalk.red('│  ⚠️  Critical Issues:\n');
        critical.forEach(f => {
          prompt += chalk.cyan('│    • ') + chalk.red(f.title) + '\n';
          if (f.detail) prompt += chalk.dim('│      ') + f.detail.substring(0, 60) + '\n';
        });
        prompt += chalk.cyan('│\n');
      }
    }

    // Memory context
    if (context.recentScans?.length > 0) {
      prompt += chalk.cyan('│  Historical Context:\n');
      context.recentScans.slice(0, 3).forEach(s => {
        const { critical, high, medium, low } = s.summary;
        prompt += chalk.cyan('│    • ') + chalk.yellow(s.target) + chalk.dim(` (${critical}C/${high}H/${medium}M/${low}L)\n`);
      });
      prompt += chalk.cyan('│\n');
    }

    // Technologies
    if (context.technologies?.length > 0) {
      prompt += chalk.cyan('│  Discovered Technologies:\n');
      prompt += chalk.cyan('│    ') + context.technologies.join(', ') + '\n';
      prompt += chalk.cyan('│\n');
    }

    prompt += chalk.cyan('│  AI Recommendations:\n');
    prompt += chalk.cyan('│    1. Review HIGH/CRITICAL findings first\n');
    prompt += chalk.cyan('│    2. Use /security continue <target> to extend testing\n');
    prompt += chalk.cyan('│    3. Check CVEs: /security cves <component>\n');
    prompt += chalk.cyan('│    4. Run pentest: /security pentest <target>\n');
    prompt += chalk.cyan('│\n');
    prompt += chalk.cyan('╰──────────────────────────────────────────────────────╯\n');

    return prompt;
  }

  // NEW: Continue from previous scan for deeper testing
  async continueFromScan(target, options = {}) {
    this.scope.assertAllowed(target, 'continued security testing');
    const scans = this.securityMemory.getByTarget(target);

    if (scans.length === 0) {
      console.log(chalk.yellow(`\n  No previous scans for "${target}". Run a scan first.`));
      return null;
    }

    const latestScan = scans[0];
    const { critical, high, medium } = latestScan.summary;

    console.log(chalk.cyan(`\n╭─ 🔄 Continuing from Previous Scan ─────────────────────╮`));
    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('│  Target: ') + chalk.yellow(target));
    console.log(chalk.cyan('│  Previous: ') + `${critical}C ${high}H ${medium}M`);
    console.log(chalk.cyan('│  Technologies: ') + (latestScan.technologies?.join(', ') || 'Unknown'));
    console.log(chalk.cyan('│'));

    // Run targeted deep scan based on previous findings
    const deepFindings = [];

    // If missing security headers, check for more
    if (latestScan.findings?.some(f => f.title?.includes('Security Header'))) {
      console.log(chalk.cyan('│  ▶ Running extended security headers check...'));
      const headersResult = await this.runVulnScan(target, { verbose: false });
      deepFindings.push(...headersResult.findings);
    }

    // If technologies found, check for CVEs
    if (latestScan.technologies?.length > 0) {
      console.log(chalk.cyan('│  ▶ Checking CVEs for discovered technologies...'));
      for (const tech of latestScan.technologies) {
        const cveResult = await this.cveLookup.lookup(tech);
        if (cveResult.results?.length > 0) {
          deepFindings.push({
            type: 'cve',
            severity: 'high',
            title: `CVE in ${tech}`,
            detail: `Found ${cveResult.results.length} CVEs`
          });
        }
      }
    }

    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('╰──────────────────────────────────────────────────────╯\n'));

    // Save new findings
    if (deepFindings.length > 0) {
      this.securityMemory.addScan(target, deepFindings, {
        scanType: 'continue',
        technologies: latestScan.technologies
      });
    }

    return { previousScan: latestScan, newFindings: deepFindings };
  }

  // NEW: Get session context for AI
  getSessionContext() {
    return this.securityMemory.toContext();
  }

  async runPentest(target, profile = 'web') {
    this.scope.assertAllowed(target, 'penetration test');
    this.sessionData.target = target;
    this.sessionData.startTime = new Date();

    this.pentest = new PentestOrchestrator(
      this.recon,
      this.scanner,
      this.toolsRegistry,
      this.platform
    );

    const results = await this.pentest.run(target, profile);
    this.sessionData.findings.push(...results.findings);
    this.sessionData.toolsResults.pentest = results;

    return results;
  }

  async runAutonomousPentest(agent, options = {}) {
    const target = this.sessionData.target || options.target;
    if (!target) {
      throw new Error('No target specified. Set target first or pass in options.');
    }
    this.scope.assertAllowed(target, 'autonomous penetration test');

    this.sessionData.startTime = new Date();

    const maxIterations = options.maxIterations || 30;

    console.log(chalk.red.bold(`\n  🔴 AUTONOMOUS PENTEST: ${target}\n`));
    console.log(chalk.dim(`  Max iterations: ${maxIterations}\n`));

    const decisionEngine = new DecisionEngine(agent, this);
    decisionEngine.setTarget(target);
    decisionEngine.setMaxIterations(maxIterations);

    const attackChainExecutor = new AttackChainExecutor();

    let iteration = 0;
    let allFindings = [];

    console.log(chalk.yellow('\n  ═══ INITIAL RECON & SCAN ═══\n'));

    await this.runRecon(target, { passive: true });
    const scanResults = await this.runVulnScan(target, { verbose: false });
    allFindings.push(...scanResults.findings);

    console.log(chalk.yellow('\n  ═══ AUTONOMOUS EXPLOITATION ═══\n'));

    while (iteration < maxIterations) {
      iteration++;

      const stats = decisionEngine.getStats();
      const critical = allFindings.filter(f => f.severity === 'critical').length;
      const high = allFindings.filter(f => f.severity === 'high').length;

      if (critical > 0 || high > 0) {
        process.stdout.write(chalk.red(`  [${critical} CRITICAL, ${high} HIGH]\n`));
      }

      let chainExecuted = false;
      const chainResults = await attackChainExecutor.checkAndExecute(allFindings, target);
      for (const result of chainResults || []) {
        if (result.chainExecuted) {
          console.log(chalk.green(`  ✅ Chain: ${result.chainExecuted}`));
          chainExecuted = true;
        } else if (result.title) {
          allFindings.push(result);
        }
      }

      if (!chainExecuted) {
        const nextAction = await decisionEngine.decide('iteration', '', allFindings);

        if (!nextAction || nextAction.done) {
          console.log(chalk.green('\n  ✅ Assessment complete'));
          break;
        }

        console.log(chalk.cyan(`  🤖 ${nextAction.reason}`));
        const result = execSafe(nextAction.command);

        if (result) {
          try {
            const interp = await interpretToolOutput(agent, nextAction.tool, nextAction.command, result);
            allFindings.push(...interp.findings);
          } catch {}
        }
      }

      console.log(chalk.dim(`  [${iteration}/${maxIterations}] ${allFindings.length} findings`));
    }

    this.sessionData.findings = allFindings;
    this.sessionData.target = target;
    this.sessionData.endTime = new Date();

    const reportPath = this.generateReport('md');

    console.log(chalk.red(`
╭─ 📊 SUMMARY ───────────────────────────────────────────╮
│  Target: ${target}
│  Iterations: ${iteration}
│  Findings: ${allFindings.length}
│  Critical: ${allFindings.filter(f => f.severity === 'critical').length}
│  Report: ${reportPath}
╰──────────────────────────────────────────────────────╯
    `));

    return { target, iterations: iteration, findings: allFindings, reportPath };
  }

  async runVPAT(url, options = {}) {
    this.scope.assertAllowed(url, 'VPAT accessibility test');
    this.vpat = new VPATEngine(this.toolsRegistry);
    const results = await this.vpat.run(url, options);

    this.sessionData.findings.push(...results.findings);
    this.sessionData.toolsResults.vpat = results;

    return results;
  }

  async runSecretScan(path, options = {}) {
    this.scanner = new VulnerabilityScanner(this.toolsRegistry, this.platform);
    const findings = await this.scanner.scanSecrets(path, options);

    const results = { target: path, findings };
    this.sessionData.findings.push(...findings);
    this.sessionData.toolsResults.secrets = results;

    return results;
  }

  async runBugScan(path, options = {}) {
    this.scanner = new VulnerabilityScanner(this.toolsRegistry, this.platform);
    const findings = await this.scanner.scanBugs(path, options);

    const results = { target: path, findings };
    this.sessionData.findings.push(...findings);
    this.sessionData.toolsResults.bugs = results;

    return results;
  }

  generateReport(format = 'md') {
    this.sessionData.endTime = new Date();
    this.sessionData.duration = Math.round((this.sessionData.endTime - this.sessionData.startTime) / 1000) + 's';
    this.report = new SecurityReportGenerator('./reports');
    return this.report.generate(this.sessionData, format);
  }

  generateHTMLReport() {
    this.sessionData.endTime = new Date();
    this.report = new SecurityReportGenerator('./reports');
    return this.report.generateHTML(this.sessionData);
  }

  getProfile(name) {
    const profiles = {
      'owasp-top10': OWASP_TOP10_PROFILE,
      'sans-top25': SANS_TOP25_PROFILE,
      'pci-dss': PCI_DSS_PROFILE,
      'nist': NIST_PROFILE
    };
    return profiles[name.toLowerCase()] || null;
  }

  listProfiles() {
    console.log(chalk.red(`
╭─ 📋 Available Security Profiles ─────────────────────────────────╮
│                                                                 │
│  owasp-top10  - OWASP Top 10 (2021) vulnerability testing     │
│  sans-top25   - SANS Top 25 software errors                   │
│  pci-dss     - PCI DSS compliance assessment                   │
│  nist        - NIST Cybersecurity Framework                   │
│                                                                 │
│  Usage: red security scan <target> --profile <name>           │
╰─────────────────────────────────────────────────────────────────╯
    `));
  }

  getFindings() {
    return this.sessionData.findings;
  }

  getSeverityCounts() {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const finding of this.sessionData.findings) {
      const sev = (finding.severity || 'info').toLowerCase();
      if (counts[sev] !== undefined) counts[sev]++;
    }
    return counts;
  }

  addToScope(target) {
    this.sessionData.scope.push(target);
  }

  getScope() {
    return this.sessionData.scope;
  }
}

export async function createSecurityEngine(config = {}) {
  const engine = new SecurityEngine(config);
  await engine.initialize();
  return engine;
}

// Export new components
export { parseExploitOutput, formatExploitResult };
export { XSS_PAYLOADS, SQLI_PAYLOADS, CMD_PAYLOADS, LFI_PAYLOADS, SSRF_PAYLOADS };
export { toolExists, autoInstall, ensureTools, runWithAutoInstall, getToolStatus, getMissingTools } from './tool-manager.js';

export default SecurityEngine;
