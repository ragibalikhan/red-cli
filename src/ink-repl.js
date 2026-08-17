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
import { SessionManager } from './session-manager.js';
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
}

export async function startInkRepl(cfg) {
  const config = cfg;

  // Workspace trust check — ask before allowing write/execute in untrusted folders
  const { isTrusted, trustFolder } = await import('./workspace-trust.js');
  if (!isTrusted()) {
    const { confirm } = await import('@inquirer/prompts');
    const cwd = process.cwd();
    console.log('');
    try {
      const trusted = await confirm({
        message: chalk.yellow(`Trust this folder?\n  ${chalk.white(cwd)}\n  This allows Red CLI to run commands and modify files here.`),
        default: true
      });
      if (trusted) {
        trustFolder(cwd);
        console.log(chalk.green('  ✓ Folder trusted\n'));
      } else {
        console.log(chalk.dim('  Running in read-only mode (no bash, no file writes)\n'));
        config.noTools = false; // Still allow read tools
        config._readOnlyMode = true;
      }
    } catch {
      // Ctrl+C during prompt
      process.exit(0);
    }
  }

  // Tell agent we're rendering UI ourselves - suppress its ora spinner
  config.silent = true;

  const analytics = createAnalytics();
  analytics.startSession(config.model, config.provider);

  const agent = new Agent(config, analytics);

  // Confirmation callback for risky commands — uses console prompt since Ink can't do inline input during agent execution
  agent.setConfirmCallback(async (query) => {
    // Auto-approve — risk display handled by Ink tool cards
    return true;
  });

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
  async function handleCommand(cmd, onOutput) {
    const out = onOutput || ((text, role) => console.log(text));
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
      // Reset fallback chain when user manually switches
      agent.resetFallback();
      out(`✓ Switched to ${newModel} (${newProvider})`);
      return;
    }

    switch (command) {
      case '/exit':
      case '/quit':
        if (agent.messages.length > 0) {
          session.saveSession();
        }
        analytics.endSession();
        out('Goodbye!', 'assistant');
        process.exit(0);
        break;

      case '/clear':
        if (agent.messages.length > 0) {
          session.saveSession();
        }
        agent.clearHistory();
        out('Conversation cleared', 'assistant');
        break;

      case '/help':
        out('Type / to open the command menu, or use:\n  /model   - switch model\n  /mode    - switch security mode\n  /scan, /pentest, /recon, /scope, /cve - security tools\n  /save, /load, /resume - sessions\n  /usage, /tokens, /doctor - diagnostics\n  /clear, /undo, /retry - conversation\n  /exit    - exit');
        break;

      case '/model': {
        // Plain '/model' is handled by the Ink UI (shows ModelSelector component)
        out('(Use the live menu — type /model)');
        break;
      }

      case '/mode': {
        const validModes = ['recon', 'scan', 'exploit', 'report', 'osint', 'audit'];
        if (validModes.includes(args)) {
          agent.setMode(args);
        } else {
          out(`Valid modes: ${validModes.join(', ')}`, 'warning');
        }
        break;
      }

      case '/history': {
        const recent = agent.messages.slice(-10);
        const lines = recent.map(m => {
          const content = typeof m.content === 'string' ? m.content.slice(0, 80) : '[structured]';
          return `[${m.role}] ${content}`;
        }).join('\n');
        out(lines);
        break;
      }

      case '/set': {
        const setting = args.trim().toLowerCase();
        if (!setting) {
          // List all settings
          out(`Current settings:
  autoFallback: ${config.autoFallback !== false ? 'ON' : 'OFF'} (auto-switch model on rate limit)
  stream: ${config.streamOutput !== false ? 'ON' : 'OFF'}
  memory: ${config.memory !== false ? 'ON' : 'OFF'}
  mode: ${agent.mode}
  model: ${config.model} (${config.provider})`);
          break;
        }

        if (setting === 'autofallback' || setting === 'fallback') {
          config.autoFallback = config.autoFallback === false ? true : false;
          agent._autoFallback = config.autoFallback;
          saveConfig(config);
          out(`autoFallback: ${config.autoFallback ? 'ON ✓' : 'OFF'}`);
          break;
        }

        if (setting === 'stream') {
          config.streamOutput = config.streamOutput === false ? true : false;
          saveConfig(config);
          out(`stream: ${config.streamOutput ? 'ON ✓' : 'OFF'}`);
          break;
        }

        if (setting === 'memory') {
          config.memory = config.memory === false ? true : false;
          saveConfig(config);
          out(`memory: ${config.memory ? 'ON ✓' : 'OFF'}`);
          break;
        }

        out(`Unknown setting: ${setting}. Available: autoFallback, stream, memory`);
        break;
      }

      case '/agent': {
        const { getAgent, getSubagentNames, getAgentsByMode } = await import('./agents/registry.js');
        const agentArg = args.trim();

        if (!agentArg) {
          // List all agents
          const subagents = getSubagentNames();
          const lines = subagents.map(name => {
            const a = getAgent(name);
            return `  ${a.icon || '🤖'} @${name} — ${a.description}`;
          });
          out(`Available subagents:\n${lines.join('\n')}\n\nUsage: @<agent> <task> to invoke directly`);
          break;
        }

        // Handle @agent <task> syntax
        if (agentArg.startsWith('@')) {
          const match = agentArg.match(/^@(\w+)\s+(.+)$/s);
          if (match) {
            out(`Invoking @${match[1]} — pass as message: @${match[1]} ${match[2].slice(0, 50)}...`);
          } else {
            out('Usage: /agent @<agent> <task>');
          }
          break;
        }

        out(`Unknown agent: ${agentArg}. Use /agent to list available agents.`);
        break;
      }

      // ────── Security commands ──────

      case '/scan': {
        agent.setMode('scan');
        if (args) {
          const { createSecurityEngine } = await import('./security/index.js');
          const engine = await createSecurityEngine();
          out(`Running vulnerability scan on: ${args}`, 'assistant');
          try {
            const results = await engine.runVulnScan(args);
            out(`Scan complete: ${results.findings.length} findings`, 'assistant');
            injectSecurityContext(agent, results.findings, args, 'vulnerability-scan');
          } catch (err) {
            out(`Scan error: ${err.message}`, 'error');
          }
        }
        break;
      }

      case '/recon': {
        agent.setMode('recon');
        if (args) {
          const { createSecurityEngine } = await import('./security/index.js');
          const engine = await createSecurityEngine();
          out(`Running reconnaissance on: ${args}`, 'assistant');
          try {
            const results = await engine.runRecon(args, { passive: true });
            out(`Recon complete: ${results.findings.length} findings`, 'assistant');
            injectSecurityContext(agent, results.findings, args, 'reconnaissance');
          } catch (err) {
            out(`Recon error: ${err.message}`, 'error');
          }
        }
        break;
      }

      case '/exploit': {
        agent.setMode('exploit');
        if (!args) {
          out('Usage: /exploit <type> <target>\n\nTypes:\n  xss <url>              - Test XSS with payloads\n  sqli <url>             - Test SQL injection\n  lfi <url>              - Test Local File Inclusion\n  ssti <url>             - Test Server Side Template Injection\n  cmd <url>              - Test Command Injection\n  ssrf <url>             - Test SSRF\n  brute <url>            - Brute force directories\n  ports <host>           - Port scan\n  cors <url>             - Test CORS misconfiguration');
          break;
        }
        const [type, target] = args.split(' ');
        if (!type || !target) {
          out('Usage: /exploit <type> <target>', 'warning');
          break;
        }
        if (/[;&|`$(){}]/.test(target)) {
          out('Invalid target: contains unsafe characters', 'error');
          break;
        }
        out(`Executing ${type} exploit on ${target}...`, 'assistant');
        try {
          const { execSync: exploitExec } = await import('child_process');
          const safeTarget = target.replace(/"/g, '\\"');
          let result = '';
          switch (type.toLowerCase()) {
            case 'xss':
              result = exploitExec(`curl -s -L "${safeTarget}" 2>&1 | grep -oE "<script|onerror|alert" | head -5`, { encoding: 'utf-8', timeout: 10000 });
              break;
            case 'sqli':
              result = exploitExec(`curl -s -L "${safeTarget}" 2>&1 | grep -iE "sql|syntax|mysql|error" | head -5`, { encoding: 'utf-8', timeout: 10000 });
              break;
            case 'ports':
              result = exploitExec(`nmap -sV -p 1-1000 -oG - ${safeTarget} 2>/dev/null | grep "Ports:"`, { encoding: 'utf-8', timeout: 60000 });
              break;
            default:
              out(`Unknown exploit type: ${type}\nUse /exploit without arguments to see available types`, 'warning');
          }
          if (result && result.trim()) {
            out(`Results:\n${result}`, 'assistant');
          } else {
            out('No results found', 'warning');
          }
        } catch (err) {
          out(`Exploit error: ${err.message}`, 'error');
        }
        break;
      }

      case '/osint': {
        agent.setMode('osint');
        if (args) {
          const { createSecurityEngine } = await import('./security/index.js');
          const engine = await createSecurityEngine();
          out(`Running OSINT on: ${args}`, 'assistant');
          try {
            const results = await engine.runRecon(args, { passive: true });
            out(`OSINT complete: ${results.findings.length} findings`, 'assistant');
            injectSecurityContext(agent, results.findings, args, 'osint');
          } catch (err) {
            out(`OSINT error: ${err.message}`, 'error');
          }
        }
        break;
      }

      case '/audit': {
        agent.setMode('audit');
        if (args) {
          out(`Auditing code at: ${args}`, 'assistant');
          agent.messages.push({ role: 'user', content: `Audit the code at ${args} for security vulnerabilities. Look for: SQL injection, XSS, command injection, hardcoded secrets, insecure deserialization, auth flaws.` });
          await agent.runLoop();
        }
        break;
      }

      case '/pentest':
      case '/pt': {
        const target = args.trim();
        if (!target) {
          out('Usage: /pentest <url|ip>', 'warning');
          break;
        }
        out(`Starting autonomous pentest on: ${args}`, 'assistant');
        const { createSecurityEngine } = await import('./security/index.js');
        const { runAutonomousPentest } = await import('./security/pentest.js');
        const engine = await createSecurityEngine();
        try {
          const result = await runAutonomousPentest(agent, engine, target, { maxIterations: 30 });
          out(`Pentest complete! ${result.findings.length} findings.`, 'assistant');
          if (result.reportPath) out(`Report: ${result.reportPath}`, 'assistant');
          injectSecurityContext(agent, result.findings, target, 'autonomous-pentest');
        } catch (err) {
          out(`Pentest error: ${err.message}`, 'error');
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
          if (!target) { out('Usage: /scope add <target>', 'warning'); break; }
          const entry = engine.addScopeTarget(target, scopeParts.slice(2).join(' '));
          out(`Added scope: ${entry.target}`, 'assistant');
        } else if (scopeCmd === 'remove' || scopeCmd === 'rm') {
          if (!target) { out('Usage: /scope remove <target>', 'warning'); break; }
          const removed = engine.removeScopeTarget(target);
          out(removed ? `Removed: ${target}` : `Not found: ${target}`, removed ? 'assistant' : 'error');
        } else if (scopeCmd === 'clear') {
          engine.clearScopeTargets();
          out('Cleared scope', 'assistant');
        } else {
          const entries = engine.listScopeTargets();
          const lines = ['Authorized Scope:'];
          if (entries.length === 0) {
            lines.push('(empty) — Add with: /scope add example.com');
          } else {
            entries.forEach(entry => {
              const note = entry.note ? ` — ${entry.note}` : '';
              lines.push(`  ${entry.target}${note}`);
            });
          }
          out(lines.join('\n'));
        }
        break;
      }

      case '/cve': {
        if (!args.trim()) {
          out('Usage: /cve <CVE-ID>', 'warning');
          break;
        }
        const { lookupCVE } = await import('./security/cve-lookup.js');
        try {
          const result = await lookupCVE(args.trim());
          if (result) {
            out(`${result.id}\n  Severity: ${result.severity || 'unknown'}\n  ${(result.description || '').slice(0, 300)}`);
          } else {
            out('CVE not found', 'warning');
          }
        } catch (err) {
          out(`Error: ${err.message}`, 'error');
        }
        break;
      }

      case '/secrets': {
        const path = args.trim() || '.';
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
          out(`Scanning secrets in: ${path}`, 'assistant');
          try {
            const results = await engine.scanSecrets(path);
            out(`Found ${results.findings.length} potential secrets`, 'assistant');
            injectSecurityContext(agent, results.findings, path, 'secrets-scan');
          } catch (err) {
            out(`Error: ${err.message}`, 'error');
          }
        break;
      }

      case '/doctor': {
        const { runDoctor } = await import('./doctor.js');
        await runDoctor(args === '--fix');
        break;
      }

      case '/report': {
        agent.setMode('report');
        const { generateReport } = await import('./security/report-generator.js');
        // Collect findings from agent's conversation (tool results with security findings)
        const findings = [];
        for (const msg of agent.messages) {
          if (typeof msg.content === 'string') continue;
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.content && typeof block.content === 'string') {
                try {
                  const parsed = JSON.parse(block.content);
                  if (parsed.securityFindings) findings.push(...parsed.securityFindings);
                  if (parsed.findings) findings.push(...parsed.findings);
                  if (parsed.vulnerable) findings.push(parsed);
                } catch {}
              }
            }
          }
        }
        const target = args.trim() || 'target';
        const result = generateReport({ target, findings });
        out(`Report generated: ${result.path}\n  ${result.findingCount} findings documented with CVSS 4.0 scores`, 'assistant');
        break;
      }

      // ────── Session commands ──────

      case '/save': {
        const name = args.trim();
        if (name) {
          session.rename(name);
          out(`Session saved as: ${name}`, 'assistant');
        } else {
          out(`Session auto-saved: ${session.sessionId}\n  ${session.messageCount} messages at ${session.sessionPath}`, 'assistant');
        }
        break;
      }

      case '/load':
      case '/resume': {
        const sessions = SessionManager.list(15).filter(s => s.msgCount > 0);

        if (sessions.length === 0) {
          out('No sessions found. Sessions auto-save as you chat.', 'warning');
          break;
        }

        const arg = args.trim();

        if (!arg) {
          const loaded = SessionManager.load(sessions[0].path);
          if (loaded) {
            agent.messages = loaded.messages;
            session.sessionId = sessions[0].id;
            session.sessionPath = sessions[0].path;
            session.messageCount = loaded.messages.length;
            out(`Resumed: ${loaded.messages.length} msgs (${sessions[0].name || sessions[0].firstPrompt?.slice(0, 40) || sessions[0].id})`, 'assistant');
          }
        } else if (arg === 'list') {
          const lines = ['Sessions:'];
          sessions.forEach((s, i) => {
            const date = new Date(s.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const label = s.name || s.firstPrompt?.slice(0, 40) || s.id;
            lines.push(`  ${i + 1}. ${label} (${date}, ${s.msgCount} msgs)`);
          });
          lines.push('\n  /resume 1  or  /resume <name>');
          out(lines.join('\n'));
        } else if (/^\d+$/.test(arg)) {
          const idx = parseInt(arg) - 1;
          if (idx >= 0 && idx < sessions.length) {
            const loaded = SessionManager.load(sessions[idx].path);
            if (loaded) {
              agent.messages = loaded.messages;
              session.sessionId = sessions[idx].id;
              session.sessionPath = sessions[idx].path;
              session.messageCount = loaded.messages.length;
              out(`Resumed: ${loaded.messages.length} msgs`, 'assistant');
            }
          } else {
            out(`Invalid. Use 1-${sessions.length}`, 'error');
          }
        } else {
          const found = SessionManager.findByName(arg);
          if (found) {
            const loaded = SessionManager.load(found.path);
            if (loaded) {
              agent.messages = loaded.messages;
              session.sessionId = found.id;
              session.sessionPath = found.path;
              session.messageCount = loaded.messages.length;
              out(`Resumed "${arg}": ${loaded.messages.length} msgs`, 'assistant');
            }
          } else {
            out(`Session not found: ${arg}`, 'error');
          }
        }
        break;
      }

      case '/usage': {
        const stats = analytics.getSessionStats();
        out(`Session usage:\n  Tokens in:  ${stats.tokensIn.toLocaleString()}\n  Tokens out: ${stats.tokensOut.toLocaleString()}\n  Tool calls: ${stats.toolCalls}\n  Cost:       $${stats.cost.toFixed(4)}`);
        break;
      }

      case '/tokens': {
        const stats = analytics.getSessionStats();
        out(`${stats.tokensIn + stats.tokensOut} total tokens this session`);
        break;
      }

      // ────── Conversation commands ──────

      case '/undo':
        if (agent.messages.length >= 2) {
          agent.messages = agent.messages.slice(0, -2);
          out('Removed last message pair', 'assistant');
        } else {
          out('Nothing to undo', 'warning');
        }
        break;

      case '/retry': {
        let lastUser = null;
        for (let i = agent.messages.length - 1; i >= 0; i--) {
          if (agent.messages[i].role === 'user') { lastUser = agent.messages[i].content; break; }
        }
        if (lastUser) {
          agent.messages = agent.messages.slice(0, -2);
          await agent.run(typeof lastUser === 'string' ? lastUser : '');
        } else {
          out('No previous message to retry', 'warning');
        }
        break;
      }

      case '/compact': {
        if (typeof agent.handleCompact === 'function') {
          await agent.handleCompact();
          out('Compacted', 'assistant');
        }
        break;
      }

      // ────── Config commands ──────

      case '/provider': {
        const validProviders = ['anthropic', 'bedrock', 'openai', 'gemini', 'nvidia', 'opencode', 'ollama', 'openrouter'];
        if (validProviders.includes(args)) {
          config.provider = args;
          saveConfig(config);
          out(`Provider: ${args}`, 'assistant');
        } else {
          out(`Valid providers: ${validProviders.join(', ')}`, 'warning');
        }
        break;
      }

      case '/setkey': {
        const parts = args.split(/\s+/).filter(Boolean);
        const provider = parts[0];
        if (!provider || parts.length < 2) {
          out('Usage: /setkey <provider> <key> [region for bedrock]', 'warning');
          break;
        }
        config.apiKeys = config.apiKeys || {};
        if (provider === 'bedrock') {
          config.apiKeys.bedrock = parts[1];
          config.awsRegion = parts[2] || 'us-east-1';
          saveConfig(config);
          out(`Saved Bedrock key (region: ${config.awsRegion})`, 'assistant');
        } else {
          config.apiKeys[provider] = parts[1];
          saveConfig(config);
          out(`Saved ${provider} key`, 'assistant');
        }
        break;
      }

      case '/plugins':
        if (pluginManager) pluginManager.listPlugins();
        else out('Plugin system not available', 'warning');
        break;

      case '/permissions': {
        const { loadPermissions, addRule, removeRule, setMode } = await import('./security/permissions.js');
        const perms = loadPermissions();
        const sub = args.split(/\s+/);

        if (sub[0] === 'allow' && sub[1]) {
          addRule('allow', sub.slice(1).join(' '));
          out(`Added to allow: ${sub.slice(1).join(' ')}`, 'assistant');
        } else if (sub[0] === 'deny' && sub[1]) {
          addRule('deny', sub.slice(1).join(' '));
          out(`Added to deny: ${sub.slice(1).join(' ')}`, 'assistant');
        } else if (sub[0] === 'ask' && sub[1]) {
          addRule('ask', sub.slice(1).join(' '));
          out(`Added to ask: ${sub.slice(1).join(' ')}`, 'assistant');
        } else if (sub[0] === 'remove' && sub[1] && sub[2]) {
          removeRule(sub[1], sub.slice(2).join(' '));
          out(`Removed from ${sub[1]}: ${sub.slice(2).join(' ')}`, 'assistant');
        } else if (sub[0] === 'mode' && sub[1]) {
          if (setMode(sub[1])) out(`Mode: ${sub[1]}`, 'assistant');
          else out('Invalid mode. Use: default, auto, recon-only', 'error');
        } else {
          out(`Permissions (mode: ${perms.mode})\n\nAllow (no prompt):\n  ${perms.allow.join(', ')}\n\nAsk (prompt each time):\n  ${perms.ask.join(', ')}\n\nDeny (blocked):\n  ${perms.deny.join(', ')}\n\nCommands:\n  /permissions allow bash(nmap *)\n  /permissions deny bash(rm -rf *)\n  /permissions mode auto\n  /permissions remove allow bash(nmap *)`);
        }
        break;
      }

      default: {
        const matches = commandRegistry.search(command.slice(1)).slice(0, 5);
        if (matches.length > 0) {
          const lines = [`Unknown command: ${command}`, 'Did you mean:'];
          for (const m of matches) {
            lines.push(`  ${m.name} — ${(m.description || '').slice(0, 50)}`);
          }
          out(lines.join('\n'), 'warning');
        } else {
          out(`Unknown command: ${command}`, 'error');
        }
      }
    }
  }

  // Session management — auto-save after every AI response
  const session = new SessionManager();

  // If --continue flag was explicitly passed, load most recent session
  if (config._continueSession === true) {
    const recent = SessionManager.getMostRecent();
    if (recent && recent.msgCount > 0) {
        const loaded = SessionManager.load(recent.path);
        if (loaded && loaded.messages.length > 0) {
          agent.messages = loaded.messages;
          session.sessionId = recent.id;
          session.sessionPath = recent.path;
          session.messageCount = loaded.messages.length;
        }
    }
  } else if (config._resumeSession && config._resumeSession !== true) {
    const target = config._resumeSession;
    const found = SessionManager.findByName(target) || SessionManager.load(target);
    if (found) {
      const loaded = found.messages ? found : SessionManager.load(found.path);
      if (loaded) {
        agent.messages = loaded.messages;
        session.sessionId = found.id || target;
        session.sessionPath = found.path;
        session.messageCount = loaded.messages.length;
      }
    }
  } else {
    session.start(); // New session — no output needed
  }

  // Auto-save: subscribe to agent 'done' event
  agent.on('done', () => {
    // Save the last user message + assistant response
    const msgs = agent.messages.slice(-2);
    for (const msg of msgs) {
      session.saveMessage({ role: msg.role, content: msg.content });
    }
  });

  // Cleanup old sessions on startup (non-blocking)
  SessionManager.cleanup();

  async function runAgent(message) {
    try {
      await agent.run(message);
    } catch (err) {
      // Error handled by agent's done event
    }
  }

  // Start Ink app — pass agent and session directly
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
