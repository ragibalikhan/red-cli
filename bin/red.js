#!/usr/bin/env node

import { loadConfig, saveConfig, getConfigDir, DEFAULTS } from '../src/config.js';
import { PROVIDERS } from '../src/config.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function parseArgs(args) {
  const flags = {};
  const positional = [];
  const booleanFlags = new Set([
    'active',
    'auto',
    'fix',
    'help',
    'h',
    'html',
    'no-tools',
    'smoke',
    'test-redteam',
    'verbose',
    'version'
  ]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        flags[key] = value;
      } else if (!booleanFlags.has(key) && args[i + 1] && !args[i + 1].startsWith('-')) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      flags[arg.slice(1)] = true;
    } else if (!arg.startsWith('/')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function ensureConfig() {
  const config = loadConfig();

  if (!config || !config.apiKeys) {
    const hasAnthropic = process.env.ANTHROPIC_API_KEY;
    const hasNvidia = process.env.NVIDIA_API_KEY;
    const hasOpenAI = process.env.OPENAI_API_KEY;

    if (!hasAnthropic && !hasNvidia && !hasOpenAI) {
      console.error('Error: No API key found.');
      console.error('\n--- Set up your API key ---');
      console.error('Option 1: Environment variables');
      console.error('  $env:ANTHROPIC_API_KEY = "sk-ant-..."');
      console.error('  $env:NVIDIA_API_KEY = "nvapi-..."');
      console.error('  $env:OPENAI_API_KEY = "sk-..."');

      console.error('\nOption 2: Config file');
      console.error(`  Edit: ${join(getConfigDir(), 'config.json')}`);
      console.error('\nGet keys from:');
      console.error('  Anthropic: https://console.anthropic.com/');
      console.error('  NVIDIA: https://build.nvidia.com/');
      console.error('  OpenAI: https://platform.openai.com/');
      process.exit(1);
    }
  }

  return config;
}

async function handleConfigCommand(subcmd, args) {
  const config = loadConfig();

  switch (subcmd) {
    case 'get':
      const key = args[0];
      if (key) {
        console.log(config[key] ?? 'undefined');
      } else {
        console.log(JSON.stringify(config, null, 2));
      }
      break;

    case 'set':
      const [k, v] = args;
      if (k && v) {
        config[k] = v;
        saveConfig(config);
        console.log(`Set ${k} = ${v}`);
      } else {
        console.error('Usage: red config set <key> <value>');
      }
      break;

    case 'reset':
      saveConfig(DEFAULTS);
      console.log('Config reset to defaults');
      break;

    case 'edit':
      const { exec } = await import('child_process');
      const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vim');
      exec(`${editor} ${join(getConfigDir(), 'config.json')}`);
      break;

    default:
      console.log('Usage: red config [get|set|reset|edit]');
  }
}

async function handleDoctorCommand(fix = false) {
  const { runDoctor } = await import('../src/doctor.js');
  await runDoctor(fix);
}

async function handleQueueCommand(subcmd, args, config) {
  const { createQueue } = await import('../src/queue.js');
  const queue = createQueue(config);

  switch (subcmd) {
    case 'add':
      if (args) {
        queue.add(args);
      } else {
        console.error('Usage: red queue add <task>');
      }
      break;
    case 'list':
      queue.list();
      break;
    case 'run':
      await queue.run(config);
      break;
    case 'clear':
      queue.clear();
      break;
    default:
      console.log('Usage: red queue [add|list|run|clear]');
  }
}

async function handleSecurityCommand(subcmd, args, flags) {
  const { createSecurityEngine } = await import('../src/security/index.js');
  const chalk = await import('chalk');

  const engine = await createSecurityEngine();

  try {
  switch (subcmd) {
    case 'scope': {
      const scopeCmd = args[0] || 'list';
      const target = args[1];

      if (scopeCmd === 'add') {
        if (!target) {
          console.error('Usage: red security scope add <target> [note]');
          return;
        }
        const entry = engine.addScopeTarget(target, args.slice(2).join(' '));
        console.log(chalk.default.green(`\n✓ Added authorized scope: ${entry.target}`));
        if (entry.note) console.log(chalk.default.dim(`  Note: ${entry.note}`));
        return;
      }

      if (scopeCmd === 'remove' || scopeCmd === 'rm') {
        if (!target) {
          console.error('Usage: red security scope remove <target>');
          return;
        }
        const removed = engine.removeScopeTarget(target);
        console.log(removed
          ? chalk.default.green(`\n✓ Removed authorized scope: ${target}`)
          : chalk.default.yellow(`\nScope target not found: ${target}`));
        return;
      }

      if (scopeCmd === 'clear') {
        engine.clearScopeTargets();
        console.log(chalk.default.green('\n✓ Cleared authorized security scope'));
        return;
      }

      const scopedTargets = engine.listScopeTargets();
      console.log(chalk.default.cyan('\nAuthorized Security Scope:'));
      if (scopedTargets.length === 0) {
        console.log(chalk.default.dim('  (empty)'));
        console.log(chalk.default.dim('\nAdd one with: red security scope add example.com'));
      } else {
        scopedTargets.forEach(entry => {
          const note = entry.note ? chalk.default.dim(` - ${entry.note}`) : '';
          console.log(`  ${chalk.default.yellow(entry.target)}${note}`);
        });
      }
      return;
    }

    case 'scan':
      if (!args[0]) {
        console.error('Usage: red security scan <target> [--verbose]');
        return;
      }
      const verbose = flags.verbose || false;
      console.log(chalk.default.red(`\n🔍 Running vulnerability scan on: ${args[0]}${verbose ? ' (verbose)' : ''}`));
      const scanResults = await engine.runVulnScan(args[0], { verbose });
      console.log(chalk.default.green(`\n✅ Scan complete: ${scanResults.findings.length} findings`));
      engine.sessionData.findings = scanResults.findings;
      engine.sessionData.target = args[0];
      break;

    case 'recon':
      if (!args[0]) {
        console.error('Usage: red security recon <target>');
        return;
      }
      console.log(chalk.default.red(`\n🔍 Running reconnaissance on: ${args[0]}`));
      const reconResults = await engine.runRecon(args[0], { passive: true, active: flags.active || false });
      console.log(chalk.default.green(`\n✅ Recon complete: ${reconResults.findings.length} findings`));
      engine.sessionData.findings = reconResults.findings;
      engine.sessionData.target = args[0];
      break;

    case 'secrets':
      if (!args[0]) {
        console.error('Usage: red security secrets <path>');
        return;
      }
      console.log(chalk.default.red(`\n🔍 Scanning for secrets in: ${args[0]}`));
      const secretResults = await engine.runSecretScan(args[0], { includeGit: true });
      const secretCount = secretResults.findings?.length || 0;
      console.log(chalk.default.green(`\n✅ Secrets scan complete: ${secretCount} findings`));
      engine.sessionData.findings = secretResults.findings;
      engine.sessionData.target = args[0];
      break;

    case 'bugs':
      if (!args[0]) {
        console.error('Usage: red security bugs <path>');
        return;
      }
      console.log(chalk.default.red(`\n🔍 Scanning for bugs in: ${args[0]}`));
      const bugResults = await engine.runBugScan(args[0]);
      const bugCount = bugResults.findings?.length || 0;
      console.log(chalk.default.green(`\n✅ Bug scan complete: ${bugCount} findings`));
      engine.sessionData.findings = bugResults.findings;
      engine.sessionData.target = args[0];
      break;

    case 'vpat':
    case 'a11y':
      if (!args[0]) {
        console.error('Usage: red security vpat <url>');
        return;
      }
      console.log(chalk.default.red(`\n♿ Running VPAT accessibility test on: ${args[0]}`));
      const vpatResults = await engine.runVPAT(args[0]);
      console.log(chalk.default.green('\n✅ VPAT test complete'));
      engine.sessionData.findings = vpatResults.findings;
      engine.sessionData.target = args[0];
      break;

    case 'pentest':
      if (!args[0]) {
        console.error('Usage: red security pentest <target> [--auto]');
        return;
      }
      const target = args[0];
      engine.assertTargetInScope(target, 'autonomous penetration test');
      console.log(chalk.default.red(`\n⚠️  Running autonomous penetration test on: ${target}`));

      const { runAutonomousPentest } = await import('../src/security/pentest.js');

      const mockAgent = {
        provider: {
          sendMessage: async (messages, tools) => {
            return { content: '{"done": true, "reason": "CLI mode - using attack chains"}' };
          }
        }
      };

      try {
        const results = await runAutonomousPentest(mockAgent, engine, target, { maxIterations: 30 });
        console.log(chalk.default.green(`\n✅ Pentest complete: ${results.findings.length} findings`));
        console.log(chalk.default.green(`  Report: ${results.reportPath}`));
        engine.sessionData.findings = results.findings;
        engine.sessionData.target = target;
      } catch (err) {
        console.error('Pentest error:', err.message);
        await engine.runRecon(target, { passive: true });
        await engine.runVulnScan(target);
        console.log(chalk.default.green('\n✅ Basic scan complete'));
      }
      break;

    case 'test':
      const { RedTeamTestRunner } = await import('../test/redteam-test-runner.js');
      const runner = new RedTeamTestRunner({ verbose: flags.verbose || false, fix: flags.fix || false, smoke: flags.smoke || false });
      await runner.run(flags.category || 'all');
      break;

    case 'profiles':
      engine.listProfiles();
      break;

    case 'report':
      if (!engine.sessionData.findings?.length) {
        console.error('No findings to report. Run a scan first.');
        return;
      }
      const format = flags.format || 'md';
      const reportPath = engine.generateReport(format);
      console.log(chalk.default.green(`\n✅ Report saved to: ${reportPath}`));
      if (flags.html) {
        const htmlPath = engine.generateHTMLReport();
        console.log(chalk.default.green(`✅ HTML Report: ${htmlPath}`));
      }
      break;

    case 'tools':
      engine.displayBanner();
      break;

    case 'exploits':
      const { ExploitEngine } = await import('../src/security/exploit.js');
      const exploitEng = new ExploitEngine();
      if (args[0]) {
        exploitEng.showExploit(args[0]);
      } else {
        exploitEng.listExploits();
      }
      break;

    case 'install-tools':
      const { installTools } = await import('../src/security/platform.js');
      const { execSync } = await import('child_process');
      const platform = engine.platform;

      if (platform.isWindows) {
        console.log(chalk.default.yellow('\n⚠️  On Windows, security tools are best installed via:'));
        console.log(chalk.default.dim('   - WSL2 (recommended)'));
        console.log(chalk.default.dim('   - Chocolatey: choco install nmap sqlmap'));
        console.log(chalk.default.dim('   - Manual installation'));
      } else if (platform.isKali || platform.isLinux) {
        console.log(chalk.default.cyan('\n📦 Installing security tools...'));
        const tools = engine.toolsRegistry.getMissing();
        if (tools.length > 0) {
          console.log(chalk.default.dim(`   Missing: ${tools.join(', ')}`));
        }
        try {
          execSync('sudo apt-get update && sudo apt-get install -y nmap nikto sqlmap dirb wpscan', { stdio: 'inherit' });
          console.log(chalk.default.green('\n✅ Tools installed'));
        } catch (e) {
          console.log(chalk.default.yellow('⚠️  Install failed. Run with sudo or install manually.'));
        }
      }
      break;

    case 'history':
      engine.listMemory();
      break;

    case 'cves':
    case 'cve':
      const component = args[0];
      const version = args[1] || '';
      if (!component) {
        console.log('Usage: red security cves <component> [version]');
        console.log('Example: red security cves nginx 1.24.0');
        console.log('Example: red security cves express');
        break;
      }
      console.log(chalk.default.cyan(`\n🔍 Looking up CVEs for: ${component} ${version}`));
      const cveResults = await engine.lookupCVEs(component, version);
      engine.displayCVEResults(cveResults);
      break;

    case 'findings':
      const targetFind = args[0];
      if (!targetFind) {
        console.log('Usage: red security findings <target>');
        console.log('Example: red security findings 164.52.197.176');
        break;
      }
      const findingsList = engine.getFindingsFromMemory(targetFind);
      if (findingsList.length === 0) {
        console.log(chalk.default.yellow(`\nNo findings stored for "${targetFind}". Run a scan first.`));
      } else {
        console.log(chalk.default.cyan(`\n📋 Findings for: ${targetFind}`));
        // Initialize scanner if needed
        if (!engine.scanner) {
          const { VulnerabilityScanner } = await import('../src/security/scanner.js');
          engine.scanner = new VulnerabilityScanner(engine.toolsRegistry, engine.platform);
        }
        for (const scan of findingsList) {
          console.log(chalk.default.dim(`  Scan: ${scan.timestamp}`));
          engine.scanner.displayFindings(scan.findings);
        }
      }
      break;

    case 'targets':
      const targets = engine.listScannedTargets();
      console.log(chalk.default.cyan('\n📋 Scanned Targets:'));
      if (targets.length === 0) {
        console.log(chalk.default.dim('  No targets scanned yet.'));
      } else {
        targets.forEach(t => console.log(`  ${chalk.default.yellow(t)}`));
      }
      console.log();
      break;

    case 'tech':
      const tech = engine.getKnownTechnologies();
      console.log(chalk.default.cyan('\n🛠️  Known Technologies:'));
      if (tech.length === 0) {
        console.log(chalk.default.dim('  No technologies discovered yet. Run a scan first.'));
      } else {
        tech.forEach(t => console.log(`  ${chalk.default.green('•')} ${t}`));
      }
      console.log();
      break;

    case 'clear-memory':
      engine.clearMemory();
      break;

    case 'menu':
    case 'interactive':
      const { SecuritySession } = await import('../src/security/session.js');
      const session = new SecuritySession();
      console.log(session.displayMenu());
      break;

    case 'continue':
      const continueTarget = args[0];
      if (!continueTarget) {
        const recent = engine.getScanHistory(3);
        console.log(chalk.default.cyan('\n📋 Recent targets:'));
        recent.forEach((s, i) => console.log(`  ${chalk.default.yellow((i+1) + '.')} ${s.target}`));
        console.log(chalk.default.dim('\nUsage: red security continue <target>'));
        break;
      }
      const continueResult = await engine.continueFromScan(continueTarget);
      if (continueResult) {
        console.log(chalk.default.green(`\n✅ Extended scan complete: ${continueResult.newFindings?.length || 0} new findings`));
      }
      break;

    default:
      console.log(`
🔴 Red CLI - Security Commands

Usage: red security <command> [options]

Commands:
  scope               Manage authorized security scope
  scan <target>        Run vulnerability scan (auto-saves to memory)
  recon <target>      Run reconnaissance (passive by default)
  secrets <path>      Scan for exposed secrets/credentials
  bugs <path>         Scan for code bugs and issues
  vpat <url>          Run accessibility (VPAT) test
  test                Run self-contained Red Team regression tests
  pentest <target>    Run full penetration test
  profiles            List available security profiles
  report              Generate security report
  tools               Show available security tools
  exploits            Show exploit database
  install-tools      Install missing security tools
  history             List scan history from memory
  cves <comp> [ver]   Look up CVEs for a component
  findings <target>  Get findings from memory for a target
  targets             List all scanned targets
  tech                List all discovered technologies
  clear-memory        Clear security scan memory

Options:
  --active            Run active recon (requires authorization)
  --profile <name>   Use specific profile (owasp-top10, pci-dss, etc)
  --format <type>    Report format: md, json (default: md)
  --html             Generate HTML report

Examples:
  red security scope add example.com "written authorization"
  red security scope list
  red security scan target.com
  red security recon target.com --active
  red security secrets ./src
  red security vpat https://example.com
  red security report --html
`);
  }
  } catch (err) {
    console.error(chalk.default.red(`\nError: ${err.message}`));
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { flags, positional } = parseArgs(args);

  if (flags.version) {
    console.log('Red CLI v0.3.0');
    return;
  }

  if (flags.help || flags.h) {
    console.log(`
Red CLI v0.3.0 - Agentic AI Coding Assistant

Usage: red [options] [message]

Options:
  --version              Show version
  --help, -h             Show this help
  --model <name>         Set model
  --mode <name>          Set mode (recon/scan/exploit/report/osint/audit)
  --provider <name>      Set provider
  --no-tools             Disable tools (chat only)
  --auto                 Run in autonomous mode
  --test-redteam         Run Red Team full regression tests
  --max-iter <n>         Max iterations for auto mode (default: 50)

Commands:
  red config get <key>   Get config value
  red config set <key>  Set config value
  red config reset      Reset config to defaults
  red config edit       Open config in editor
  red doctor            Run diagnostics
  red doctor --fix      Auto-fix issues
  red queue add <task>  Add task to queue
  red queue run         Run all queued tasks
  red queue list        Show queued tasks
  red security scan     Run security scan
  red security recon    Run reconnaissance
  red security secrets  Scan for exposed secrets
  red security vpat     Run accessibility test
  red security test     Run self-contained Red Team regression tests

Examples:
  red "list files"
  red --auto "build a todo app"
  red --model openai/gpt-4o --mode review "review this code"
  red doctor
  red queue add "add auth"
  red queue run
  red security scan target.com
  red --test-redteam
`);
    return;
  }

if (flags['test-redteam']) {
    const { RedTeamTestRunner } = await import('../test/redteam-test-runner.js');
    const runner = new RedTeamTestRunner({
      verbose: Boolean(flags.verbose),
      fix: Boolean(flags.fix),
      smoke: Boolean(flags.smoke)
    });
    await runner.run(flags.category || (flags.smoke ? 'smoke' : 'all'));
    return;
  }

  if (positional[0] === 'config') {
    await handleConfigCommand(positional[1], positional.slice(2));
    return;
  }

  if (positional[0] === 'doctor') {
    await handleDoctorCommand(Boolean(flags.fix));
    return;
  }

  if (positional[0] === 'queue') {
    const config = ensureConfig();
    await handleQueueCommand(positional[1], positional.slice(2).join(' '), config);
    return;
  }

  if (positional[0] === 'security') {
    await handleSecurityCommand(positional[1], positional.slice(2), flags);
    return;
  }

  const cliFlags = {};
  if (flags.model) cliFlags.model = flags.model;
  if (flags.mode) cliFlags.mode = flags.mode;
  if (flags.provider) cliFlags.provider = flags.provider;
  if (flags['no-tools']) cliFlags.noTools = true;
  const maxIterations = flags.maxIter || flags['max-iter'];
  if (maxIterations) cliFlags.maxIterations = parseInt(maxIterations, 10);
  if (flags.auto) cliFlags.autoMode = true;

  const baseConfig = ensureConfig();
  const config = { ...baseConfig, ...cliFlags };

  // Create analytics for token tracking
  const { createAnalytics } = await import('../src/analytics.js');
  const analytics = createAnalytics();
  analytics.startSession(config.model, config.provider);

  if (positional.length === 0) {
    // Use new Ink-based REPL by default if running in a real terminal
    // Falls back to legacy REPL for non-TTY (piped input) or if RED_LEGACY_REPL=1
    const useInk = process.stdin.isTTY === true && !process.env.RED_LEGACY_REPL;
    if (useInk) {
      const { startInkRepl } = await import('../src/ink-repl.js');
      await startInkRepl(config);
    } else {
      const { startRepl } = await import('../src/repl.js');
      startRepl(config);
    }
  } else {
    const userMessage = positional.join(' ');

    if (flags.auto) {
      const { Agent } = await import('../src/agent.js');
      const { AutoAgent } = await import('../src/autoagent.js');
      const agent = new Agent(config, analytics);
      const autoAgent = new AutoAgent(agent, { maxIterations: config.maxIterations || 50 });

      const { renderUserPrompt } = await import('../src/renderer.js');
      console.log(renderUserPrompt() + userMessage);
      const chalk = await import('chalk');
      console.log(chalk.default.cyan.bold('\n═══ Auto Mode ═══\n'));

      try {
        await autoAgent.run(userMessage);
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    } else {
      const { Agent } = await import('../src/agent.js');
      const agent = new Agent(config, analytics);

      const { renderUserPrompt } = await import('../src/renderer.js');
      console.log(renderUserPrompt() + userMessage);

      try {
        await agent.run(userMessage, true);
      } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
      }
    }
  }
}

main();
