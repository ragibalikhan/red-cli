/**
 * Ink-based REPL — Phase 1 migration.
 *
 * Uses Ink for the input layer (instant slash menu, mode-colored prompt)
 * while delegating all command handling and agent execution to the existing
 * modules in src/.
 */
import { startInkApp } from './ui/ink-app.js';
import { Agent } from './agent.js';
import { createAnalytics } from './analytics.js';
import { createMemory } from './memory.js';
import { CheckpointManager } from './checkpoint.js';
import { createPluginManager } from './plugin-manager.js';
import { CommandRegistry } from './commands/registry.js';
import { showWelcome } from './ui/welcome.js';
import { saveConfig, normalizeProviderModel, PROVIDERS } from './config.js';
import { getModeTools } from './modes.js';
import chalk from 'chalk';

// Helper: inject security findings into agent context for follow-up Q&A
function injectSecurityContext(agent, findings, target, scanType) {
  if (!findings || findings.length === 0) return;
  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const summary = `
SECURITY SCAN RESULTS for ${target}
Scan: ${scanType} · Total: ${findings.length} (${critical.length} critical, ${high.length} high)

Top findings:
${findings.filter(f => ['critical', 'high'].includes(f.severity)).slice(0, 5).map(f =>
  `• [${(f.severity || '').toUpperCase()}] ${f.title}${f.detail ? ': ' + f.detail.slice(0, 200) : ''}`
).join('\n')}
`;
  agent.messages.push({ role: 'user', content: summary });
  console.log(chalk.dim(`  📎 Added ${findings.length} findings to AI context`));
}

export async function startInkRepl(cfg) {
  const config = cfg;

  // Tell agent we're rendering UI ourselves - suppress its ora spinner
  config.silent = true;

  const analytics = createAnalytics();
  analytics.startSession(config.model, config.provider);

  const agent = new Agent(config, analytics);
  const _memory = createMemory();
  const _checkpoint = new CheckpointManager();
  const commandRegistry = new CommandRegistry();
  const pluginManager = createPluginManager();
  await pluginManager.loadPlugins();

  // Show welcome screen (printed before Ink mounts)
  showWelcome({
    model: config.model,
    provider: config.provider,
    mode: agent.mode,
    toolCount: getModeTools(agent.tools, agent.mode).length,
    mcpCount: 0,
    apiKeys: config.apiKeys
  });

  // Minimal handleCommand — handles common commands; delegates rest as agent prompts
  async function handleCommand(cmd) {
    const parts = cmd.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    // Plugin commands first
    if (pluginManager) {
      const pluginCmd = pluginManager.findCommand(command);
      if (pluginCmd && typeof pluginCmd.run === 'function') {
        await pluginCmd.run(args);
        return;
      }
    }

    // Internal: /model:<provider>:<model> - dispatched by Ink ModelSelector
    if (command.startsWith('/model:')) {
      const parts = cmd.split(':');
      const newProvider = parts[1];
      const newModel = parts.slice(2).join(':');
      config.provider = newProvider;
      config.model = newModel;
      normalizeProviderModel(config);
      if ([PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI, PROVIDERS.BEDROCK].includes(config.provider)) {
        config.baseUrl = null;
      }
      saveConfig(config);
      agent.config = config;
      agent.model = config.model;
      agent.provider = null;
      agent._initPromise = agent.initProvider();
      console.log(chalk.green(`\n  ✓ Switched to ${newModel} (${newProvider})\n`));
      return;
    }

    switch (command) {
      case '/exit':
      case '/quit':
        analytics.endSession();
        console.log(chalk.green('  Goodbye!'));
        process.exit(0);
        break;

      case '/clear':
        agent.clearHistory();
        console.log(chalk.green('  Conversation cleared'));
        break;

      case '/help':
        console.log(chalk.bold('\n  Type / to open the command menu, or use:'));
        console.log(chalk.dim('    /model   - switch model'));
        console.log(chalk.dim('    /mode    - switch security mode'));
        console.log(chalk.dim('    /scan, /pentest, /recon, /scope, /cve - security tools'));
        console.log(chalk.dim('    /save, /load, /resume - sessions'));
        console.log(chalk.dim('    /usage, /tokens, /doctor - diagnostics'));
        console.log(chalk.dim('    /clear, /undo, /retry - conversation'));
        console.log(chalk.dim('    /exit    - exit\n'));
        break;

      case '/model': {
        // Plain '/model' is handled by the Ink UI (shows ModelSelector component)
        console.log(chalk.dim('  (Use the live menu — type /model)'));
        break;
      }

      case '/mode': {
        const validModes = ['recon', 'scan', 'exploit', 'report', 'osint', 'audit'];
        if (validModes.includes(args)) {
          agent.setMode(args);
          console.log(chalk.green(`  ✓ Mode: ${args}`));
        } else {
          console.log(chalk.yellow(`  Valid modes: ${validModes.join(', ')}`));
        }
        break;
      }

      case '/history': {
        const recent = agent.messages.slice(-10);
        for (const m of recent) {
          const content = typeof m.content === 'string' ? m.content.slice(0, 80) : '[structured]';
          console.log(`  ${chalk.cyan('[' + m.role + ']')} ${content}`);
        }
        break;
      }

      // ────── Security commands ──────

      case '/scan': {
        if (!args) {
          console.log(chalk.yellow('  Usage: /scan <target>'));
          break;
        }
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
        console.log(chalk.red(`\n🔍 Running vulnerability scan on: ${args}`));
        try {
          const results = await engine.runVulnScan(args);
          console.log(chalk.green(`\n✅ Scan complete: ${results.findings.length} findings`));
          injectSecurityContext(agent, results.findings, args, 'vulnerability-scan');
        } catch (err) {
          console.log(chalk.red(`  Scan error: ${err.message}`));
        }
        break;
      }

      case '/recon': {
        if (!args) {
          console.log(chalk.yellow('  Usage: /recon <target>'));
          break;
        }
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
        console.log(chalk.red(`\n🔍 Running reconnaissance on: ${args}`));
        try {
          const results = await engine.runRecon(args, { passive: true });
          console.log(chalk.green(`\n✅ Recon complete: ${results.findings.length} findings`));
          injectSecurityContext(agent, results.findings, args, 'reconnaissance');
        } catch (err) {
          console.log(chalk.red(`  Recon error: ${err.message}`));
        }
        break;
      }

      case '/pentest':
      case '/pt': {
        const target = args.trim();
        if (!target) {
          console.log(chalk.yellow('  Usage: /pentest <url|ip>'));
          break;
        }
        console.log(chalk.red(`\n⚠️  Starting autonomous pentest on: ${target}`));
        const { createSecurityEngine } = await import('./security/index.js');
        const { runAutonomousPentest } = await import('./security/pentest.js');
        const engine = await createSecurityEngine();
        try {
          const result = await runAutonomousPentest(agent, engine, target, { maxIterations: 30 });
          console.log(chalk.green(`\n✅ Pentest complete! ${result.findings.length} findings.`));
          if (result.reportPath) console.log(chalk.green(`  Report: ${result.reportPath}`));
          injectSecurityContext(agent, result.findings, target, 'autonomous-pentest');
        } catch (err) {
          console.log(chalk.red(`  Pentest error: ${err.message}`));
        }
        break;
      }

      case '/scope': {
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
        const scopeParts = args.split(/\s+/).filter(Boolean);
        const scopeCmd = scopeParts[0] || 'list';
        const target = scopeParts[1];

        if (scopeCmd === 'add') {
          if (!target) { console.log(chalk.yellow('  Usage: /scope add <target>')); break; }
          const entry = engine.addScopeTarget(target, scopeParts.slice(2).join(' '));
          console.log(chalk.green(`  ✓ Added scope: ${entry.target}`));
        } else if (scopeCmd === 'remove' || scopeCmd === 'rm') {
          if (!target) { console.log(chalk.yellow('  Usage: /scope remove <target>')); break; }
          const removed = engine.removeScopeTarget(target);
          console.log(removed ? chalk.green(`  ✓ Removed: ${target}`) : chalk.red(`  Not found: ${target}`));
        } else if (scopeCmd === 'clear') {
          engine.clearScopeTargets();
          console.log(chalk.green('  ✓ Cleared scope'));
        } else {
          const entries = engine.listScopeTargets();
          console.log(chalk.bold('\n  Authorized Scope:'));
          if (entries.length === 0) {
            console.log(chalk.dim('  (empty) — Add with: /scope add example.com'));
          } else {
            entries.forEach(entry => {
              const note = entry.note ? chalk.dim(` — ${entry.note}`) : '';
              console.log(`    ${chalk.yellow(entry.target)}${note}`);
            });
          }
        }
        break;
      }

      case '/cve': {
        if (!args.trim()) {
          console.log(chalk.yellow('  Usage: /cve <CVE-ID>'));
          break;
        }
        const { lookupCVE } = await import('./security/cve-lookup.js');
        try {
          const result = await lookupCVE(args.trim());
          if (result) {
            console.log(chalk.bold(`\n  ${result.id}`));
            console.log(chalk.dim(`  Severity: ${result.severity || 'unknown'}`));
            console.log(`  ${result.description?.slice(0, 300) || ''}`);
          } else {
            console.log(chalk.yellow('  CVE not found'));
          }
        } catch (err) {
          console.log(chalk.red(`  Error: ${err.message}`));
        }
        break;
      }

      case '/secrets': {
        const path = args.trim() || '.';
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
        console.log(chalk.red(`\n🔍 Scanning secrets in: ${path}`));
        try {
          const results = await engine.scanSecrets(path);
          console.log(chalk.green(`\n✅ Found ${results.findings.length} potential secrets`));
          injectSecurityContext(agent, results.findings, path, 'secrets-scan');
        } catch (err) {
          console.log(chalk.red(`  Error: ${err.message}`));
        }
        break;
      }

      case '/doctor': {
        const { runDoctor } = await import('./doctor.js');
        await runDoctor(args === '--fix');
        break;
      }

      // ────── Session commands ──────

      case '/save': {
        const filePath = args.trim() || `session-${Date.now()}.md`;
        const { writeFileSync } = await import('fs');
        let md = '# Red CLI Session\n\n';
        for (const msg of agent.messages) {
          md += `## ${msg.role === 'user' ? 'User' : 'Assistant'}\n\n`;
          md += (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)) + '\n\n';
        }
        writeFileSync(filePath, md, 'utf-8');
        console.log(chalk.green(`  ✓ Saved to ${filePath}`));
        break;
      }

      case '/usage': {
        const stats = analytics.getSessionStats();
        console.log(chalk.bold('\n  Session usage:'));
        console.log(`    Tokens in:  ${stats.tokensIn.toLocaleString()}`);
        console.log(`    Tokens out: ${stats.tokensOut.toLocaleString()}`);
        console.log(`    Tool calls: ${stats.toolCalls}`);
        console.log(`    Cost:       $${stats.cost.toFixed(4)}`);
        break;
      }

      case '/tokens': {
        const stats = analytics.getSessionStats();
        console.log(chalk.dim(`  ${stats.tokensIn + stats.tokensOut} total tokens this session`));
        break;
      }

      // ────── Conversation commands ──────

      case '/undo':
        if (agent.messages.length >= 2) {
          agent.messages = agent.messages.slice(0, -2);
          console.log(chalk.green('  ✓ Removed last message pair'));
        } else {
          console.log(chalk.yellow('  Nothing to undo'));
        }
        break;

      case '/retry': {
        // Find last user message
        let lastUser = null;
        for (let i = agent.messages.length - 1; i >= 0; i--) {
          if (agent.messages[i].role === 'user') { lastUser = agent.messages[i].content; break; }
        }
        if (lastUser) {
          // Remove last user+assistant pair, then re-run
          agent.messages = agent.messages.slice(0, -2);
          await agent.run(typeof lastUser === 'string' ? lastUser : '');
        } else {
          console.log(chalk.yellow('  No previous message to retry'));
        }
        break;
      }

      case '/compact': {
        if (typeof agent.handleCompact === 'function') {
          await agent.handleCompact();
          console.log(chalk.green('  ✓ Compacted'));
        }
        break;
      }

      // ────── Config commands ──────

      case '/provider': {
        const validProviders = ['anthropic', 'bedrock', 'openai', 'gemini', 'nvidia', 'opencode', 'ollama', 'openrouter'];
        if (validProviders.includes(args)) {
          config.provider = args;
          saveConfig(config);
          console.log(chalk.green(`  ✓ Provider: ${args}`));
        } else {
          console.log(chalk.yellow(`  Valid providers: ${validProviders.join(', ')}`));
        }
        break;
      }

      case '/setkey': {
        const parts = args.split(/\s+/).filter(Boolean);
        const provider = parts[0];
        if (!provider || parts.length < 2) {
          console.log(chalk.yellow('  Usage: /setkey <provider> <key> [region for bedrock]'));
          break;
        }
        config.apiKeys = config.apiKeys || {};
        if (provider === 'bedrock') {
          config.apiKeys.bedrock = parts[1];
          config.awsRegion = parts[2] || 'us-east-1';
          saveConfig(config);
          console.log(chalk.green(`  ✓ Saved Bedrock key (region: ${config.awsRegion})`));
        } else {
          config.apiKeys[provider] = parts[1];
          saveConfig(config);
          console.log(chalk.green(`  ✓ Saved ${provider} key`));
        }
        break;
      }

      case '/plugins':
        if (pluginManager) pluginManager.listPlugins();
        else console.log(chalk.yellow('  Plugin system not available'));
        break;

      default: {
        // Fuzzy match for unknown commands
        const matches = commandRegistry.search(command.slice(1)).slice(0, 5);
        if (matches.length > 0) {
          console.log(chalk.yellow(`  Unknown command: ${command}`));
          console.log(chalk.dim('  Did you mean:'));
          for (const m of matches) {
            console.log(`    ${chalk.cyan(m.name)} ${chalk.dim('— ' + (m.description || '').slice(0, 50))}`);
          }
        } else {
          console.log(chalk.red(`  Unknown command: ${command}`));
        }
      }
    }
  }

  async function runAgent(message) {
    try {
      await agent.run(message);
    } catch (err) {
      console.error(chalk.red(`  ${err.message}`));
    }
  }

  // Start Ink app — pass agent directly so Ink can subscribe to events
  const { waitUntilExit } = startInkApp({
    config,
    agent,
    handleCommand,
    runAgent,
    onExit: () => {
      analytics.endSession();
    }
  });

  await waitUntilExit();
}
