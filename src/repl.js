import readline from 'readline';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { Agent } from './agent.js';
import { loadConfig, saveConfig, getDefaultSystemPrompt, PROVIDERS, MODES, normalizeProviderModel } from './config.js';
import { getModeColor, getModeTools, getModeConfig } from './modes.js';
import { PROVIDER_MODELS } from './providers/index.js';
import { Planner } from './planner.js';
import { AutoAgent } from './autoagent.js';
import { createQueue } from './queue.js';
import { CheckpointManager } from './checkpoint.js';
import { ProjectContext } from './context.js';
import { createMemory } from './memory.js';
import { runDoctor } from './doctor.js';
import { createAnalytics } from './analytics.js';
import { createDiffReview } from './diff-review.js';
import { renderUserPrompt, renderHelp, renderHistory, renderError, renderSuccess, clearScreen } from './renderer.js';
import { SlashMenu } from './ui/slash-menu.js';
import { SessionSelector } from './ui/session-selector.js';
import { showWelcome } from './ui/welcome.js';
import { CommandRegistry } from './commands/registry.js';

const HISTORY_PATH = join(homedir(), '.red', 'history');
const SESSIONS_PATH = join(homedir(), '.red', 'sessions');
const MAX_HISTORY = 100;

const DEBUG = process.env.DEBUG === 'true';

function debugLog(...args) {
  if (DEBUG) console.error('[DEBUG]', ...args);
}

let rl;
let agent;
let config;
let contextFiles = [];
let projectContext;
let memory;
let analytics;
let diffReview;
let taskQueue;
let planner;
let autoAgent;
let checkpointMgr;
let slashMenu;
let commandRegistry;
let inputBuffer = '';
let inputHandlerAttached = false;

// Helper function to add security findings to AI context
function injectSecurityContext(agent, findings, target, scanType) {
  if (!findings || findings.length === 0) return;

  const critical = findings.filter(f => f.severity === 'critical');
  const high = findings.filter(f => f.severity === 'high');
  const medium = findings.filter(f => f.severity === 'medium');

  const contextSummary = `
SECURITY SCAN RESULTS for ${target}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scan Type: ${scanType}
Total Findings: ${findings.length}
  Critical: ${critical.length}
  High: ${high.length}
  Medium: ${medium.length}

Key Findings:
${findings.filter(f => f.severity === 'critical' || f.severity === 'high').slice(0, 5).map(f =>
  `• [${f.severity.toUpperCase()}] ${f.title}${f.detail ? '\n  ' + f.detail.slice(0, 200) : ''}`
).join('\n')}

Open Ports: ${findings.filter(f => f.title?.includes('Open Ports'))[0]?.detail?.split('\n').slice(0, 5).join(', ') || 'N/A'}
Tech Stack: ${findings.filter(f => f.title?.includes('Technologies'))[0]?.detail || 'N/A'}

This context is from a recent security scan. Use these findings to:
1. Discuss vulnerabilities and their severity
2. Prioritize remediation
3. Chain attacks based on discovered services
4. Suggest specific exploitation steps
5. Generate follow-up scans or tests
`;

  // Add as user message to give AI context
  agent.messages.push({
    role: 'user',
    content: contextSummary
  });

  console.log(chalk.dim(`  📎 Added ${findings.length} findings to AI context`));
}

function ensureSessionsDir() {
  if (!existsSync(SESSIONS_PATH)) mkdirSync(SESSIONS_PATH, { recursive: true });
}

function getDefaultSessionPath() {
  ensureSessionsDir();
  return join(SESSIONS_PATH, `session-${Date.now()}.md`);
}

function saveSessionFile(filePath) {
  try {
    ensureSessionsDir();
    const md = generateMarkdown();
    writeFileSync(filePath, md, 'utf-8');
    return filePath;
  } catch (err) {
    debugLog('failed to save session file:', err.message);
    return null;
  }
}

function ensureHistoryDir() {
  const dir = dirname(HISTORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadHistory() {
  try {
    if (existsSync(HISTORY_PATH)) return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {}
  return [];
}

function saveHistoryItem(line) {
  try {
    ensureHistoryDir();
    const history = [...loadHistory(), line].slice(-MAX_HISTORY);
    writeFileSync(HISTORY_PATH, JSON.stringify(history));
  } catch {}
}

function promptUserConfirmation(query) {
  // In non-interactive mode, auto-confirm to avoid hanging
  if (process.stdin.isTTY !== true) {
    return new Promise((resolve) => {
      console.log(query + 'y');
      resolve(true);
    });
  }
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer.toLowerCase().startsWith('y')));
  });
}

export async function startRepl(cfg) {
  config = cfg;

  // Initialize analytics before agent (agent needs it)
  analytics = createAnalytics();
  analytics.startSession(config.model, config.provider);

  agent = new Agent(config, analytics);
  agent.setConfirmCallback(promptUserConfirmation);

  projectContext = new ProjectContext();
  memory = createMemory();
  diffReview = createDiffReview({ mode: cfg.diffReview || 'auto' });
  taskQueue = createQueue(config);
  planner = new Planner(agent);
  autoAgent = new AutoAgent(agent, { maxIterations: cfg.maxIterations || 50 });
  checkpointMgr = new CheckpointManager();

  // Initialize slash menu and registry
  slashMenu = new SlashMenu();
  commandRegistry = new CommandRegistry();

  // Show welcome screen (skip clearScreen in TTY mode to avoid PowerShell issues)
  const isInteractive = process.stdin.isTTY === true;
  debugLog('isInteractive:', isInteractive, 'isTTY:', process.stdin.isTTY, 'platform:', process.platform);
  if (!isInteractive) {
    clearScreen();
  }
  showWelcome({
    model: config.model,
    provider: config.provider,
    mode: agent.mode,
    toolCount: getModeTools(agent.tools, agent.mode).length
  });

  // Setup input handling for slash menu
  setupInputHandler();

  // Create readline interface - handle TTY vs non-TTY properly
  // Detect if we're in interactive terminal mode
  // isInteractive is defined at line 100

  process.on('beforeExit', (code) => {
    debugLog('beforeExit', code, 'activeHandles:', process._getActiveHandles().map(h => h.constructor.name));
    debugLog('activeRequests:', process._getActiveRequests().map(r => r.constructor.name));
  });
  process.on('exit', (code) => debugLog('process.exit', code));
  process.on('uncaughtException', (err) => debugLog('uncaughtException', err));
  process.on('unhandledRejection', (reason) => debugLog('unhandledRejection', reason));
  process.stdin.on('end', () => debugLog('stdin.end'));

  debugLog('Creating readline, isInteractive:', isInteractive);
  readline.emitKeypressEvents(process.stdin);
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isInteractive,  // Use true in interactive mode
    historySize: 100
  });
  // Export rl to global for AutoAgent to use for confirmations
  global.__red_rl = rl;
  rl.on('close', () => debugLog('rl.close event emitted'));

  rl.on('SIGINT', () => {
    if (isProcessing) {
      debugLog('SIGINT while processing: aborting current request');
      agent.abort();
      resetSigintState();
      return;
    }

    pendingSigint += 1;
    debugLog('SIGINT received, count:', pendingSigint);

    if (pendingSigint === 1) {
      process.stdout.write('\n(press Ctrl+C again to exit)\n');
      sigintTimer = setTimeout(resetSigintState, 3000);
      rl.prompt();
      return;
    }

    debugLog('SIGINT received twice: exiting');
    process.exit(0);
  });

  debugLog('stdin.isRaw:', process.stdin.isRaw, 'stdin.isTTY:', process.stdin.isTTY);

  if (isInteractive) {
    process.stdin.resume();
    if (typeof process.stdin.setRawMode === 'function') {
      try {
        process.stdin.setRawMode(true);
      } catch (err) {
        debugLog('failed to set raw mode:', err.message);
      }
    }
    rl.setPrompt('red> ');
    rl.prompt();
  }

  // Use event-based handling like Claude Code
  let isProcessing = false;
  let inputQueue = [];  // Queue for handling rapid inputs
  let pendingSigint = 0;
  let sigintTimer = null;

  function resetSigintState() {
    pendingSigint = 0;
    if (sigintTimer) {
      clearTimeout(sigintTimer);
      sigintTimer = null;
    }
  }

  // We handle the prompt manually

  rl.on('line', async (input) => {
    debugLog('rl.on(line) triggered! input:', JSON.stringify(input));
    // Queue input if we're processing
    if (isProcessing) {
      debugLog('Currently processing, queueing');
      inputQueue.push(input);
      return;
    }
    debugLog('Starting to process');
    isProcessing = true;

    // Main event loop - process inputs until queue is empty
    do {
      const currentInput = inputQueue.length > 0 ? inputQueue.shift() : input;
      input = null;  // Clear to prevent reprocessing

      const trimmed = currentInput.trim();
      if (!trimmed) {
        if (isInteractive) {
          rl.prompt();
        } else {
          process.stdout.write('\nred> ');
        }
        continue;
      }

      if (trimmed.startsWith('/')) {
        try {
          await handleCommand(trimmed);
        } catch (err) {
          console.log(renderError(err.message));
        }
        if (!isInteractive) process.stdout.write('\nred> ');
      } else {
        saveHistoryItem(trimmed);

        // Skip auto-plan for simplicity
        if (false && planner.shouldAutoPlan(trimmed) && config.planMode !== 'never') {
          console.log(chalk.dim('Planning...\n'));
          const plan = await planner.planTask(trimmed);
          console.log(planner.displayPlan(plan));

          const confirm = await promptUserConfirmation('Execute plan? [y/n]: ');
          if (confirm) {
            await planner.executePlan(plan);
          }
        } else {
          try {
            await agent.run(trimmed);
            printTokenBar();
          } catch (err) {
            console.error(renderError(err.message));
          }
        }
        if (!isInteractive) process.stdout.write('\nred> ');
      }
    } while (inputQueue.length > 0);

    isProcessing = false;
    debugLog('finished processing, isProcessing:', isProcessing,
      'activeHandles:', process._getActiveHandles().map(h => h.constructor.name),
      'listeners(line):', rl.listenerCount('line'),
      'listeners(close):', rl.listenerCount('close'),
      'stdin(data):', process.stdin.listenerCount('data'),
      'stdin(readable):', process.stdin.listenerCount('readable'),
      'stdin.paused:', process.stdin.isPaused(),
      'stdin.isTTY:', process.stdin.isTTY,
      'rl.closed:', rl.closed);
    if (isInteractive && !rl.closed) {
      process.stdin.resume();
      rl.resume();
      rl.prompt();
    }
  });

  rl.on('close', () => {
    // Clear global reference when REPL closes
    global.__red_rl = null;
    if (typeof process.stdin.setRawMode === 'function' && process.stdin.isRaw) {
      try {
        process.stdin.setRawMode(false);
      } catch (err) {
        debugLog('failed to restore raw mode:', err.message);
      }
    }
    debugLog('rl.close() called, isProcessing:', isProcessing);
    // If we're still processing input, wait - the line handler will call this again when done
    if (isProcessing) {
      debugLog('Still processing, ignoring close');
      return;
    }
    debugLog('Session ending');
    analytics.endSession();
    if (isInteractive) {
      console.log(chalk.dim('\n  Session ended. Goodbye!'));
    }
  });

  // Initial prompt
  process.stdout.write('\nred> ');
}

function setupInputHandler() {
  // Slash menu is triggered by typing "/" as a command
  // No need for keypress interception - user types "/" and hits enter
  // This is simpler and avoids the UI duplication issues
}

function printBanner() {
  const contextPrompt = projectContext.toPrompt();
  const modeColor = getModeColor(agent.mode);
  const colorFn = chalk[modeColor] || chalk.cyan;

  console.log(chalk.cyan.bold('╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white('           Red CLI - AI Coding Assistant       ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.dim(`  Provider: ${config.provider || 'anthropic'}`));
  console.log(chalk.dim(`  Model:    ${config.model}`));
  console.log(colorFn(`  Mode:     ${agent.mode} ${getModeConfig(agent.mode).description.split('.')[0]}`));
  console.log(chalk.dim(contextPrompt));
  console.log(chalk.dim(`  Tools:    ${getModeTools(agent.tools, agent.mode).length}`));
  console.log('');
  console.log(chalk.dim('  Type /help for commands'));
  console.log('');
}

function printTokenBar() {
  const stats = analytics.getSessionStats();
  const maxTokens = config.maxTokens || 8096;
  const percent = Math.min(100, Math.round((stats.tokensIn + stats.tokensOut) / maxTokens * 100));
  const filled = '█'.repeat(Math.floor(percent / 5));
  const empty = '░'.repeat(20 - Math.floor(percent / 5));

  console.log(chalk.dim(`\n  tokens ${filled}${empty} ${(stats.tokensIn + stats.tokensOut) / 1000}k • ~$${stats.cost.toFixed(2)} • ${stats.toolCalls} tools\n`));
}

async function handleCommand(cmd) {
  const parts = cmd.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case '/exit':
    case '/quit':
      if (agent.messages.length > 0) {
        const savedPath = saveSessionFile(getDefaultSessionPath());
        if (savedPath) console.log(renderSuccess(`Saved session before exit: ${savedPath}`));
      }
      analytics.endSession();
      console.log(renderSuccess('Goodbye!'));
      process.exit(0);

    case '/clear':
      if (agent.messages.length > 0) {
        const savedPath = saveSessionFile(getDefaultSessionPath());
        if (savedPath) console.log(renderSuccess(`Saved session before clearing: ${savedPath}`));
      }
      agent.clearHistory();
      contextFiles = [];
      console.log(renderSuccess('Conversation cleared'));
      break;

    case '/history':
      console.log(renderHistory(agent.getHistory()));
      break;

    case '/undo':
      if (agent.messages.length >= 2) {
        agent.messages = agent.messages.slice(0, -2);
        console.log(renderSuccess('Removed last message pair'));
      } else {
        console.log(renderError('No more messages to undo'));
      }
      break;

    case '/retry':
      const lastUserMsg = agent.messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) {
        agent.messages = agent.messages.slice(0, -1);
        await agent.run(lastUserMsg.content);
      } else {
        console.log(renderError('No previous message to retry'));
      }
      break;

    case '/model':
      if (args) {
        // Direct model specified - skip UI
        agent.switchModel(args);
        config.model = args;
        normalizeProviderModel(config);
        if ([PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI].includes(config.provider)) {
          config.baseUrl = null;
        }
        saveConfig(config);
        console.log(renderSuccess(`Model switched to ${config.model}`));
      } else {
        // No arguments - show interactive UI
        const { selectModel } = await import('./ui/model-selector.js');
        const currentEffort = config.effort || 'high';
        const result = await selectModel(agent.model, currentEffort);

        if (result) {
          const providerChanged = config.provider !== result.provider;

          // Update config
          config.model = result.model;
          config.provider = result.provider || config.provider;
          config.effort = result.effort;
          normalizeProviderModel(config);
          if ([PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI].includes(config.provider)) {
            config.baseUrl = null;
          }
          saveConfig(config);

          if (providerChanged) {
            // Provider changed - recreate agent
            agent = new Agent(config, analytics);
            agent.setConfirmCallback(promptUserConfirmation);
          } else {
            // Same provider - just switch model
            agent.switchModel(result.model);
          }

          console.log(chalk.green('\n  ✓ Model switched to ' + result.model.split('/').pop()));
          console.log(chalk.green('  ✓ Provider: ' + config.provider));
          console.log(chalk.green('  ✓ Effort: ' + result.effort));
          console.log(chalk.dim('  Applies to this session and saved to ~/.red/config.json'));
        } else {
          console.log(chalk.dim('\n  Model selection cancelled. Keeping: ' + agent.model));
        }
      }
      break;

    case '/mode':
      if (args && MODES[args.toUpperCase()]) {
        agent.setMode(args.toLowerCase());
      } else {
        console.log(chalk.bold('Available modes:\n'));
        for (const mode of Object.keys(MODES)) {
          console.log(chalk.cyan(`  /mode ${mode}`), chalk.dim(`- ${getModeConfig(mode).description.split('.')[0]}`));
        }
      }
      break;

    case '/provider':
      if (args && PROVIDERS[args.toUpperCase()]) {
        const oldProvider = config.provider;
        config.provider = args.toLowerCase();
        saveConfig(config);
        agent = new Agent(config, analytics);
        agent.setConfirmCallback(promptUserConfirmation);
        console.log(renderSuccess(`Switched to provider: ${args}`));
      } else {
        console.log(chalk.bold(`Current: ${config.provider}\n`));
        console.log(chalk.dim('Available:'), Object.keys(PROVIDERS).join(', '));
      }
      break;

    case '/add':
      if (!args) { console.log(renderError('Usage: /add <file or glob>')); break; }
      try {
        const content = readFileSync(args, 'utf-8');
        contextFiles.push({ path: args, content });
        const tokens = Math.ceil(content.length / 4);
        console.log(renderSuccess(`Added ${args} (~${tokens} tokens)`));
      } catch (err) {
        console.log(renderError(err.message));
      }
      break;

    case '/drop':
      if (!args) { console.log(renderError('Usage: /drop <file>')); break; }
      contextFiles = contextFiles.filter(f => f.path !== args);
      console.log(renderSuccess(`Removed ${args} from context`));
      break;

    case '/context':
      const toolCount = getModeTools(agent.tools, agent.mode).length;
      console.log(projectContext.toPrompt());
      console.log(chalk.dim(`  Tools: ${toolCount}`));
      break;

    case '/plan':
      if (!args) { console.log(renderError('Usage: /plan <task>')); break; }
      console.log(chalk.dim('Planning...\n'));
      const plan = await planner.planTask(args);
      console.log(planner.displayPlan(plan));
      const confirmed = await promptUserConfirmation('Execute plan? [y/n]: ');
      if (confirmed) {
        await planner.executePlan(plan);
      }
      break;

    case '/run':
      if (!args) { console.log(renderError('Usage: /run <task>')); break; }
      console.log(chalk.cyan('Running in direct mode (no planning)...\n'));
      await agent.run(args);
      break;

    case '/auto':
      if (!args) { console.log(renderError('Usage: /auto <task>')); break; }
      console.log(chalk.cyan('Starting auto-agent mode...\n'));
      autoAgent = new AutoAgent(agent, { maxIterations: config.maxIterations || 50 });
      await autoAgent.run(args);
      break;

    case '/queue':
      const queueParts = args.split(' ');
      const queueCmd = queueParts[0];
      const queueArg = queueParts.slice(1).join(' ');

      if (queueCmd === 'add' && queueArg) {
        taskQueue.add(queueArg, { auto: false });
      } else if (queueCmd === 'run') {
        await taskQueue.run(config);
      } else if (queueCmd === 'list') {
        taskQueue.list();
      } else if (queueCmd === 'clear') {
        taskQueue.clear();
      } else {
        console.log(chalk.bold('Queue commands:'));
        console.log(chalk.dim('  /queue add <task>   - Add task to queue'));
        console.log(chalk.dim('  /queue run          - Run all tasks'));
        console.log(chalk.dim('  /queue list         - Show queue'));
        console.log(chalk.dim('  /queue clear        - Clear queue'));
      }
      break;

    case '/checkpoint':
      const cp = await checkpointMgr.create(args || 'Manual checkpoint');
      console.log(renderSuccess(`Checkpoint created: ${cp.id}`));
      break;

    case '/checkpoints':
      checkpointMgr.list();
      break;

    case '/rollback':
      if (args) {
        await checkpointMgr.rollback(args);
      } else {
        checkpointMgr.rollbackLatest();
      }
      break;

    case '/memory':
      const memParts = args.split(' ');
      if (memParts[0] === 'forget' && memParts[1]) {
        memory.forget(memParts[1]);
      } else if (memParts[0] === 'clear') {
        memory.clearGlobal();
      } else if (memParts[0] === 'project') {
        console.log(chalk.bold('Project Memory:'));
        console.log(memory.getProjectMemory());
      } else if (memParts[0] === 'set' && memParts[1] && memParts[2]) {
        memory.setProjectMemory(memParts[1], memParts.slice(2).join(' '));
      } else {
        memory.list();
      }
      break;

    case '/scope': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      const scopeParts = args.split(/\s+/).filter(Boolean);
      const scopeCmd = scopeParts[0] || 'list';
      const target = scopeParts[1];

      if (scopeCmd === 'add') {
        if (!target) {
          console.log(renderError('Usage: /scope add <target> [note]'));
          break;
        }
        const entry = engine.addScopeTarget(target, scopeParts.slice(2).join(' '));
        console.log(renderSuccess(`Added authorized scope: ${entry.target}`));
      } else if (scopeCmd === 'remove' || scopeCmd === 'rm') {
        if (!target) {
          console.log(renderError('Usage: /scope remove <target>'));
          break;
        }
        const removed = engine.removeScopeTarget(target);
        console.log(removed ? renderSuccess(`Removed authorized scope: ${target}`) : renderError(`Scope target not found: ${target}`));
      } else if (scopeCmd === 'clear') {
        engine.clearScopeTargets();
        console.log(renderSuccess('Cleared authorized security scope'));
      } else {
        const entries = engine.listScopeTargets();
        console.log(chalk.bold('\nAuthorized Security Scope'));
        if (entries.length === 0) {
          console.log(chalk.dim('  (empty)'));
          console.log(chalk.dim('  Add one with: /scope add example.com'));
        } else {
          entries.forEach(entry => {
            const note = entry.note ? chalk.dim(` - ${entry.note}`) : '';
            console.log(`  ${chalk.yellow(entry.target)}${note}`);
          });
        }
      }
      break;
    }

    // /pentest <target>
    case '/pentest':
    case '/pt': {
      const target = args.trim();
      if (!target) {
        console.log(chalk.yellow('Usage: /pentest <url|ip>'));
        console.log(chalk.dim('Example: /pentest https://pentest-ground.com:4280/'));
        break;
      }
      console.log(chalk.red(`\n⚠️  Starting autonomous pentest on: ${target}`));
      console.log(chalk.dim('This will run recon, scan, and attempt exploitation automatically.\n'));

      const { createSecurityEngine } = await import('./security/index.js');
      const { runAutonomousPentest } = await import('./security/pentest.js');
      const engine = await createSecurityEngine();

      try {
        const result = await runAutonomousPentest(agent, engine, target, { maxIterations: 30 });
        console.log(chalk.green(`\n✅ Pentest complete! Found ${result.findings.length} findings.`));
        console.log(chalk.green(`  Report: ${result.reportPath}`));
        // Inject findings into AI context for follow-up questions
        injectSecurityContext(agent, result.findings, target, 'autonomous-pentest');
      } catch (err) {
        console.log(chalk.red(`Pentest error: ${err.message}`));
      }
      break;
    }

    case '/doctor':
      await runDoctor(args === '--fix');
      break;

    // /cve <CVE-ID>
    case '/cve': {
      const cveId = args.trim();
      if (!cveId) {
        console.log(chalk.yellow('Usage: /cve CVE-2021-44228'));
        break;
      }
      console.log(chalk.cyan(`\n🔍 Looking up CVE: ${cveId}`));
      const { execSync } = await import('child_process');
      try {
        const result = execSync(
          `curl -s "https://cve.circl.lu/api/cve/${cveId}" 2>&1`,
          { encoding: 'utf-8', timeout: 15000 }
        );
        const cve = JSON.parse(result);
        if (cve && cve.id) {
          const desc = cve.summary || 'No description';
          const cvss = cve['cvss'] || cve.cvss3 || 'N/A';
          console.log(chalk.bold(`\n  ${cve.id}`));
          console.log(chalk.dim(`  CVSS: ${cvss}`));
          console.log(`  ${desc.slice(0, 300)}`);
          if (cve.references) {
            console.log(chalk.dim(`  References: ${cve.references.slice(0, 2).join(', ')}`));
          }
        } else {
          console.log(chalk.yellow('  CVE not found'));
        }
      } catch (e) {
        console.log(chalk.yellow(`  Could not fetch CVE: ${e.message}`));
      }
      break;
    }

    // /report [format]
    case '/report': {
      const fmt = args.trim() || 'md';
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();

      // Check memory first, then session
      const memoryFindings = engine.listScannedTargets().length > 0;

      // Get latest findings from memory
      const recentScans = engine.getScanHistory(1);
      if (recentScans.length > 0) {
        engine.sessionData.findings = recentScans[0].findings;
        engine.sessionData.target = recentScans[0].target;
      }

      if (engine.sessionData.findings?.length || recentScans.length > 0) {
        const reportPath = engine.generateReport(fmt);
        console.log(chalk.green(`\n✅ Report saved to: ${reportPath}`));
      } else {
        console.log(chalk.yellow('\n  No findings. Run a scan first.\n'));
      }
      break;
    }

    // /cves <component> [version]
    case '/cves': {
      const parts = args.trim().split(' ');
      const component = parts[0];
      const version = parts[1] || '';
      if (!component) {
        console.log(chalk.cyan('  Usage: /cves <component> [version]'));
        console.log(chalk.dim('  Example: /cves nginx'));
        console.log(chalk.dim('  Example: /cves wordpress 5.9'));
        break;
      }
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      console.log(chalk.cyan(`\n🔍 Looking up CVEs for: ${component} ${version}`));
      const results = await engine.lookupCVEs(component, version);
      engine.displayCVEResults(results);
      break;
    }

    // /targets - List scanned targets
    case '/targets': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      const targets = engine.listScannedTargets();
      console.log(chalk.cyan('\n📋 Scanned Targets:'));
      if (targets.length === 0) {
        console.log(chalk.dim('  No targets scanned yet.'));
      } else {
        targets.forEach(t => console.log(`  ${chalk.yellow(t)}`));
      }
      console.log();
      break;
    }

    // /tech - List discovered technologies
    case '/tech': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      const tech = engine.getKnownTechnologies();
      console.log(chalk.cyan('\n🛠️  Known Technologies:'));
      if (tech.length === 0) {
        console.log(chalk.dim('  No technologies discovered yet. Run a scan first.'));
      } else {
        tech.forEach(t => console.log(`  ${chalk.green('•')} ${t}`));
      }
      console.log();
      break;
    }

    // /continue <target> - Continue from previous scan
    case '/continue': {
      const target = args.trim();
      if (!target) {
        const { createSecurityEngine } = await import('./security/index.js');
        const engine = await createSecurityEngine();
        const recent = engine.getScanHistory(3);
        console.log(chalk.cyan('\n📋 Recent targets:'));
        recent.forEach((s, i) => console.log(`  ${chalk.yellow((i+1) + '.')} ${s.target}`));
        console.log(chalk.dim('\nUsage: /continue <target>'));
        break;
      }
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      console.log(chalk.cyan(`\n🔄 Continuing from previous scan: ${target}`));
      const result = await engine.continueFromScan(target);
      if (result) {
        console.log(chalk.green(`\n✅ Extended scan complete: ${result.newFindings?.length || 0} new findings`));
        injectSecurityContext(agent, result.newFindings || [], target, 'continue-scan');
      }
      break;
    }

    // /history - Show scan history
    case '/history': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      engine.listMemory();
      break;
    }

    // /install-tools
    case '/install-tools': {
      const { installTools } = await import('./security/platform.js');
      const { execSync } = await import('child_process');
      const { PlatformDetector } = await import('./security/platform.js');
      const platform = new PlatformDetector();
      await platform.detect();

      console.log(chalk.cyan('\n📦 Installing security tools...'));

      if (platform.isWindows) {
        console.log(chalk.yellow('  On Windows, install tools via:'));
        console.log(chalk.dim('   - WSL2 (recommended): wsl --install'));
        console.log(chalk.dim('   - Chocolatey: choco install nmap'));
        console.log(chalk.dim('   - Manual: download from tool websites'));
      } else if (platform.isKali || platform.isLinux) {
        const tools = ['nmap', 'nikto', 'sqlmap', 'dirb', 'gobuster', 'curl', 'openssl'];
        try {
          execSync(`sudo apt-get update && sudo apt-get install -y ${tools.join(' ')}`, { stdio: 'inherit' });
          console.log(chalk.green('\n✅ Security tools installed'));
        } catch (e) {
          console.log(chalk.yellow('⚠️ Some tools may have failed. Install individually if needed.'));
        }
      } else {
        console.log(chalk.yellow('  Detected macOS - using brew:'));
        execSync(`brew install nmap nikto sqlmap`, { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Tools installed via brew'));
      }
      break;
    }

    // /web <query>
    case '/web': {
      const query = args.trim();
      if (!query) {
        console.log(chalk.yellow('Usage: /web <search query>'));
        break;
      }
      console.log(chalk.cyan(`\n🌐 Searching: ${query}`));

      const { execSync } = await import('child_process');

      try {
        const ddg = execSync(
          `curl -sL "https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}" 2>&1 | grep -o '<a class="result__a"[^>]*>[^<]*</a>' | head -5 | sed 's/<[^>]*>//g'`,
          { encoding: 'utf-8', timeout: 15000 }
        );
        const results = ddg.split('\n').filter(Boolean);
        if (results.length > 0) {
          console.log(chalk.cyan('\n  Search Results:'));
          results.forEach((r, i) => {
            if (r.trim()) console.log(chalk.dim(`  ${i + 1}. ${r.trim().slice(0, 80)}`));
          });
        } else {
          console.log(chalk.yellow('  No results found'));
        }
      } catch (e) {
        console.log(chalk.yellow('  Search failed. Check internet connection.'));
      }
      break;
    }

    // /parallel task1 | task2 | task3
    case '/parallel': {
      const tasks = args.split('|').map(t => t.trim()).filter(Boolean);
      if (tasks.length < 2) {
        console.log(chalk.yellow('Usage: /parallel task1 | task2 | task3'));
        break;
      }
      console.log(chalk.cyan(`\n⚡ Running ${tasks.length} tasks in parallel...\n`));

      const results = await Promise.all(tasks.map(async (task, i) => {
        const subAgent = new Agent(config, analytics);
        console.log(chalk.dim(`  [Agent ${i + 1}] Starting: ${task}`));
        try {
          await subAgent.run(task);
          console.log(chalk.green(`  [Agent ${i + 1}] Complete`));
          return { task, success: true };
        } catch (e) {
          console.log(chalk.red(`  [Agent ${i + 1}] Failed: ${e.message}`));
          return { task, error: e.message, success: false };
        }
      }));

      console.log(chalk.cyan('\n  Parallel tasks complete:'));
      results.forEach((r, i) => {
        const icon = r.success ? '✅' : '❌';
        console.log(`  ${icon} Agent ${i + 1}: ${r.task}`);
      });
      break;
    }

    // /goal <completion condition>
    case '/goal': {
      const goal = args.trim();
      if (!goal) {
        console.log(chalk.yellow('Usage: /goal <what done looks like>'));
        console.log(chalk.dim('Example: /goal find at least one critical vulnerability'));
        break;
      }
      console.log(chalk.green(`\n  ✅ Goal set: "${goal}"`));
      console.log(chalk.dim('  Starting autonomous mode with goal tracking...\n'));
      autoAgent = new AutoAgent(agent, { maxIterations: config.maxIterations || 50, goal });
      await autoAgent.run(goal);
      break;
    }

    // /background
    case '/background':
    case '/bg': {
      console.log(chalk.cyan('\n  Starting background session...'));
      console.log(chalk.dim('  Output will be saved to ~/.red/background.log'));
      const { spawn } = await import('child_process');
      const redDir = join(homedir(), '.red');
      if (!existsSync(redDir)) mkdirSync(redDir, { recursive: true });
      const bg = spawn(process.argv[0], process.argv.slice(1), {
        detached: true,
        stdio: ['ignore', createWriteStream(join(redDir, 'background.log'), { flags: 'a' }), 'ignore']
      });
      bg.unref();
      console.log(chalk.green(`  ✅ Background process started. PID: ${bg.pid}`));
      console.log(chalk.dim('  Use /resume to reconnect later'));
      break;
    }

    // /compact - compact conversation
    case '/compact': {
      console.log(chalk.dim('\n  Compacting conversation...'));
      const conversationText = agent.messages.map(m =>
        `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
      ).join('\n\n');

      try {
        const summaryResponse = await agent.provider.sendMessage(
          [{ role: 'user', content: `Summarize this conversation in 300 words, preserving all key decisions, code written, and next steps:\n\n${conversationText.slice(0, 4000)}` }],
          []
        );

        const summary = summaryResponse.content || 'Summary unavailable';

        agent.messages = [
          { role: 'user', content: `Previous conversation summary:\n${summary}` },
          { role: 'assistant', content: 'Understood. I have the context from our previous conversation.' }
        ];

        console.log(chalk.green(`  ✅ Compacted to summary.`));
      } catch (e) {
        console.log(chalk.yellow(`  Compact failed: ${e.message}`));
      }
      break;
    }

    case '/security':
    case '/sec':
    case '/redteam':
    case '/hack': {
      // Security mode - delegate to the security engine
      const { createSecurityEngine } = await import('./security/index.js');
      const { SecuritySession } = await import('./security/session.js');
      const engine = await createSecurityEngine();
      const session = new SecuritySession();

      const secParts = args.split(' ');
      const secCmd = secParts[0];
      const secTarget = secParts.slice(1).join(' ');

      if (!secCmd) {
        // Show interactive menu
        console.log(session.displayMenu());
        break;
      }

      if (secCmd === 'scope') {
        const scopeAction = secParts[1] || 'list';
        const scopeTarget = secParts[2];
        if (scopeAction === 'add') {
          if (!scopeTarget) {
            console.log(renderError('Usage: /security scope add <target> [note]'));
            break;
          }
          const entry = engine.addScopeTarget(scopeTarget, secParts.slice(3).join(' '));
          console.log(renderSuccess(`Added authorized scope: ${entry.target}`));
        } else if (scopeAction === 'remove' || scopeAction === 'rm') {
          if (!scopeTarget) {
            console.log(renderError('Usage: /security scope remove <target>'));
            break;
          }
          const removed = engine.removeScopeTarget(scopeTarget);
          console.log(removed ? renderSuccess(`Removed authorized scope: ${scopeTarget}`) : renderError(`Scope target not found: ${scopeTarget}`));
        } else if (scopeAction === 'clear') {
          engine.clearScopeTargets();
          console.log(renderSuccess('Cleared authorized security scope'));
        } else {
          const entries = engine.listScopeTargets();
          console.log(chalk.bold('\nAuthorized Security Scope'));
          if (entries.length === 0) {
            console.log(chalk.dim('  (empty)'));
            console.log(chalk.dim('  Add one with: /security scope add example.com'));
          } else {
            entries.forEach(entry => {
              const note = entry.note ? chalk.dim(` - ${entry.note}`) : '';
              console.log(`  ${chalk.yellow(entry.target)}${note}`);
            });
          }
        }
        break;
      }

      // Handle numbered menu options (1-13)
      const validOptions = ['1','2','3','4','5','6','7','8','9','10','11','12','13'];
      if (validOptions.includes(secCmd)) {
        const handler = session.getOptionHandler(secCmd);
        if (handler?.action) {
          if (handler.cmd === 'history') session.displayHistory();
          else if (handler.cmd === 'targets') session.displayTargets();
          else if (handler.cmd === 'tools') engine.displayBanner();
          else if (handler.cmd === 'report') {
            if (engine.sessionData.findings?.length) {
              const reportPath = engine.generateReport('md');
              console.log(chalk.green(`\n✅ Report saved to: ${reportPath}`));
            } else console.log(chalk.yellow('\n  No findings. Run a scan first.\n'));
          }
        } else {
          console.log(chalk.dim(`\n${handler?.prompt || 'Enter target:'}`));
        }
        break;
      }

      // Handle URL/IP as direct target (e.g., /security http://target.com)
      const isURL = secCmd.startsWith('http://') || secCmd.startsWith('https://');
      const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(secCmd);
      if (isURL || isIP) {
        console.log(chalk.red(`\n🔍 Running vulnerability scan on: ${secCmd}`));
        const results = await engine.runVulnScan(secCmd);
        console.log(chalk.green(`\n✅ Scan complete: ${results.findings.length} findings`));
        engine.sessionData.findings = results.findings;
        engine.sessionData.target = secCmd;
        injectSecurityContext(agent, results.findings, secCmd, 'vulnerability-scan');
        break;
      }

      if (secCmd === 'scan' && secTarget) {
        console.log(chalk.red(`\n🔍 Running vulnerability scan on: ${secTarget}`));
        const results = await engine.runVulnScan(secTarget);
        console.log(chalk.green(`\n✅ Scan complete: ${results.findings.length} findings`));
        engine.sessionData.findings = results.findings;
        engine.sessionData.target = secTarget;
        injectSecurityContext(agent, results.findings, secTarget, 'vulnerability-scan');
      } else if (secCmd === 'pentest' && secTarget) {
        console.log(chalk.red(`\n⚠️  Running autonomous penetration test on: ${secTarget}`));
        try {
          const result = await engine.runAutonomousPentest(agent, { target: secTarget, maxIterations: 30 });
          console.log(chalk.green(`\n✅ Pentest complete: ${result.findings.length} findings`));
          console.log(chalk.green(`  Report: ${result.reportPath}`));
          injectSecurityContext(agent, result.findings, secTarget, 'autonomous-pentest');
        } catch (err) {
          console.log(chalk.yellow(`  Fallback to basic scan: ${err.message}`));
          await engine.runVulnScan(secTarget);
        }
      } else if (secCmd === 'vpat' && secTarget) {
        console.log(chalk.red(`\n♿ Running VPAT accessibility test on: ${secTarget}`));
        const vpatResults = await engine.runVPAT(secTarget);
        console.log(chalk.green('\n✅ VPAT test complete'));
        injectSecurityContext(agent, vpatResults.findings, secTarget, 'accessibility-test');
      } else if (secCmd === 'secrets') {
        console.log(chalk.red(`\n🔍 Scanning for secrets in: ${secTarget || '.'}`));
        const results = await engine.runSecretScan(secTarget || '.', { includeGit: true });
        console.log(chalk.green(`\n✅ Secrets scan complete: ${results.findings?.length || 0} findings`));
        if (results.findings) {
          injectSecurityContext(agent, results.findings, secTarget || '.', 'secrets-scan');
        }
      } else if (secCmd === 'bugs') {
        console.log(chalk.red(`\n🔍 Scanning for bugs in: ${secTarget || '.'}`));
        const results = await engine.runBugScan(secTarget || '.');
        console.log(chalk.green(`\n✅ Bug scan complete: ${results.findings?.length || 0} findings`));
        if (results.findings) {
          injectSecurityContext(agent, results.findings, secTarget || '.', 'bug-scan');
        }
      } else if (secCmd === 'recon' && secTarget) {
        console.log(chalk.red(`\n🔍 Running reconnaissance on: ${secTarget}`));
        const results = await engine.runRecon(secTarget, { passive: true });
        console.log(chalk.green(`\n✅ Recon complete: ${results.findings.length} findings`));
        injectSecurityContext(agent, results.findings, secTarget, 'reconnaissance');
      } else if (secCmd === 'report') {
        if (engine.sessionData.findings?.length) {
          const reportPath = engine.generateReport('md');
          console.log(chalk.green(`\n✅ Report saved to: ${reportPath}`));
        } else {
          console.log(renderError('No findings to report. Run a scan first.'));
        }
      } else {
        console.log(chalk.bold('Security commands (or use standalone commands):'));
        console.log(chalk.dim('  /scan <target>          - Vulnerability scan (or: /security scan)'));
        console.log(chalk.dim('  /pentest <target>      - Autonomous pentest'));
        console.log(chalk.dim('  /recon <target>        - Reconnaissance'));
        console.log(chalk.dim('  /secrets [path]        - Find leaked secrets'));
        console.log(chalk.dim('  /bugs [path]           - Scan for code bugs'));
        console.log(chalk.dim('  /report                - Generate report'));
        console.log(chalk.cyan('\n  Shorthand: /sec <target> scans the target directly'));
      }
      break;
    }

    case '/scan': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      if (!args) {
        console.log(renderError('Usage: /scan <target>'));
        break;
      }
      console.log(chalk.red(`\n🔍 Running vulnerability scan on: ${args}`));
      const results = await engine.runVulnScan(args);
      console.log(chalk.green(`\n✅ Scan complete: ${results.findings.length} findings`));
      injectSecurityContext(agent, results.findings, args, 'vulnerability-scan');
      break;
    }

    case '/recon': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      if (!args) {
        console.log(renderError('Usage: /recon <target>'));
        break;
      }
      console.log(chalk.red(`\n🔍 Running reconnaissance on: ${args}`));
      const results = await engine.runRecon(args, { passive: true });
      console.log(chalk.green(`\n✅ Recon complete: ${results.findings.length} findings`));
      injectSecurityContext(agent, results.findings, args, 'reconnaissance');
      break;
    }

    case '/secrets': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      const target = args || '.';
      console.log(chalk.red(`\n🔍 Scanning for secrets in: ${target}`));
      const results = await engine.runSecretScan(target, { includeGit: true });
      console.log(chalk.green(`\n✅ Secrets scan complete: ${results.findings?.length || 0} findings`));
      if (results.findings) {
        injectSecurityContext(agent, results.findings, target, 'secrets-scan');
      }
      break;
    }

    case '/bugs': {
      const { createSecurityEngine } = await import('./security/index.js');
      const engine = await createSecurityEngine();
      const target = args || '.';
      console.log(chalk.red(`\n🔍 Scanning for bugs in: ${target}`));
      const results = await engine.runBugScan(target);
      console.log(chalk.green(`\n✅ Bug scan complete: ${results.findings?.length || 0} findings`));
      if (results.findings) {
        injectSecurityContext(agent, results.findings, target, 'bug-scan');
      }
      break;
    }

    case '/exploit': {
      // Direct exploitation command - executes tools directly
      const { execSync } = await import('child_process');
      const [type, target] = (args || '').split(' ');

      if (!type || !target) {
        console.log(chalk.cyan(`
╭─ 💀 Exploit Command ──────────────────────────────────────╮
│  Usage: /exploit <type> <target>
│
│  Types:
│    xss <url>              - Test XSS with payloads
│    sqli <url>            - Test SQL injection
│    lfi <url>             - Test Local File Inclusion
│    ssti <url>            - Test Server Side Template Injection
│    cmd <url>             - Test Command Injection
│    ssrf <url>            - Test SSRF
│    brute <url>           - Brute force directories
│    ports <host>          - Port scan
│    cors <url>            - Test CORS misconfiguration
│
│  Examples:
│    /exploit xss https://target.com/search?q=test
│    /exploit sqli https://target.com?id=1
│    /exploit ports 192.168.1.1
╰──────────────────────────────────────────────────────────╯
        `));
        break;
      }

      console.log(chalk.red(`\n💀 Executing ${type} exploit on ${target}...`));

      try {
        let result = '';
        switch (type.toLowerCase()) {
          case 'xss':
            const xssPayloads = [
              '<script>alert(1)</script>',
              '"><img src=x onerror=alert(1)>',
              "'-alert(1)-'",
              '<svg onload=alert(1)>'
            ];
            for (const payload of xssPayloads) {
              const encoded = encodeURIComponent(payload);
              const testUrl = target.includes('?') ? `${target}&xss=${encoded}` : `${target}?xss=${encoded}`;
              console.log(chalk.dim(`  Testing: ${testUrl}`));
              result = execSync(`curl -s -L "${testUrl}" | grep -oE "<script|onerror|alert" | head -5`, { encoding: 'utf-8', timeout: 10000 });
              if (result) break;
            }
            break;

          case 'sqli':
            const sqliPayloads = ["' OR '1'='1", "1' UNION SELECT 1--", "1 AND 1=1"];
            for (const payload of sqliPayloads) {
              const encoded = encodeURIComponent(payload);
              const testUrl = target.includes('?') ? `${target}&sqli=${encoded}` : `${target}?sqli=${encoded}`;
              console.log(chalk.dim(`  Testing: ${testUrl}`));
              result = execSync(`curl -s -L "${testUrl}" | grep -iE "sql|syntax|mysql|error" | head -5`, { encoding: 'utf-8', timeout: 10000 });
              if (result) break;
            }
            break;

          case 'lfi':
            const lfiPayloads = ['../../../etc/passwd', '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts', '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'];
            for (const payload of lfiPayloads) {
              console.log(chalk.dim(`  Testing: ${target}?file=${payload}`));
              result = execSync(`curl -s -L "${target}?file=${payload}" | grep -oE "root:|www-data:|anonymous" | head -3`, { encoding: 'utf-8', timeout: 10000 });
              if (result) break;
            }
            break;

          case 'ports':
            result = execSync(`nmap -sV -p 1-1000 -oG - ${target} 2>/dev/null | grep "Ports:"`, { encoding: 'utf-8', timeout: 60000 });
            break;

          case 'brute':
            result = execSync(`ffuf -u "${target}/FUZZ" -w /usr/share/wordlists/dirb/common.txt -mc 200,204,301,302,307,401 -t 10 -s 2>/dev/null | head -20`, { encoding: 'utf-8', timeout: 60000 });
            break;

          case 'ssrf':
            const ssrfPayloads = ['http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://127.0.0.1:8080'];
            for (const payload of ssrfPayloads) {
              console.log(chalk.dim(`  Testing SSRF: ${payload}`));
              result = execSync(`curl -s -L "${target}?url=${encodeURIComponent(payload)}" | head -20`, { encoding: 'utf-8', timeout: 10000 });
              if (result.includes('ami-id') || result.includes('instance-id') || result.includes('localhost')) break;
            }
            break;

          case 'cmd':
            const cmdPayloads = [';ls', '|ls', '&ls', '&&whoami'];
            for (const payload of cmdPayloads) {
              const encoded = encodeURIComponent(payload);
              console.log(chalk.dim(`  Testing: ${target}?cmd=${encoded}`));
              result = execSync(`curl -s -L "${target}?cmd=${encoded}" | head -20`, { encoding: 'utf-8', timeout: 10000 });
              if (result && !result.includes('not found')) break;
            }
            break;

          case 'cors':
            result = execSync(`curl -s -I -H "Origin: http://evil.com" "${target}" | grep -iE "Access-Control"`, { encoding: 'utf-8', timeout: 10000 });
            break;

          default:
            console.log(chalk.yellow(`  Unknown exploit type: ${type}`));
            console.log(chalk.dim('  Use /exploit without arguments to see available types'));
        }

        if (result && result.trim()) {
          console.log(chalk.green(`\n✅ Exploitation results:\n`) + chalk.white(result));
        } else {
          console.log(chalk.yellow('\n⚠️  No exploitation results found'));
        }
      } catch (err) {
        console.log(chalk.red(`\n❌ Exploit error: ${err.message}`));
      }
      break;
    }

    case '/usage':
      if (args === 'reset') {
        analytics.reset();
      } else {
        analytics.displayUsage(args || 'month');
      }
      break;

    case '/tokens':
      analytics.displaySessionUsage();
      break;

    case '/diff':
      console.log(chalk.dim('Use /context to see project context'));
      console.log(chalk.yellow('Interactive diff review is automatic for file changes'));
      break;

    case '/snapshot':
      const snapshot = await checkpointMgr.create('Session snapshot');
      console.log(renderSuccess(`Snapshot created: ${snapshot.id}`));
      break;

    case '/parallel':
      console.log(chalk.yellow('Parallel tasks coming soon'));
      break;

    case '/copy':
      const lastResponse = agent.messages.filter(m => m.role === 'assistant' && typeof m.content === 'string').pop();
      if (lastResponse) {
        const { execSync } = await import('child_process');
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? `echo "${lastResponse.content}" | clip` : `echo "${lastResponse.content}" | pbcopy`;
        execSync(cmd, { stdio: 'ignore' });
        console.log(renderSuccess('Copied to clipboard'));
      } else {
        console.log(renderError('No response to copy'));
      }
      break;

    case '/pause-input':
      if (!process.stdin.isPaused()) {
        try {
          if (typeof process.stdin.setRawMode === 'function') {
            try { process.stdin.setRawMode(false); } catch (e) { /* ignore */ }
          }
          rl.pause();
          process.stdin.pause();
          console.log(renderSuccess('Input paused. Use /resume-input to continue'));
        } catch (err) {
          console.log(renderError(err.message));
        }
      } else {
        console.log(renderError('Input already paused'));
      }
      break;

    case '/resume-input':
      try {
        if (process.stdin.isPaused && process.stdin.isPaused()) process.stdin.resume();
        if (typeof process.stdin.setRawMode === 'function' && process.stdin.isTTY) {
          try { process.stdin.setRawMode(true); } catch (e) { /* ignore */ }
        }
        try { rl.resume(); } catch (e) { /* ignore */ }
        console.log(renderSuccess('Input resumed'));
      } catch (err) {
        console.log(renderError(err.message));
      }
      break;

    case '/resume': {
      // Interactive session resume with arrow key navigation
      const selector = new SessionSelector(SESSIONS_PATH);
      const selected = await selector.show();

      if (!selected) {
        console.log(chalk.dim('Resume cancelled'));
        break;
      }

      // Load the selected session
      const content = readFileSync(selected.path, 'utf-8');
      if (selected.name.endsWith('.md')) {
        parseAndLoadConversation(content);
        console.log(renderSuccess(`Session loaded: ${selected.name}`));
        console.log(chalk.dim(`  ${selected.messageCount} messages restored`));
      } else {
        try {
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            for (const m of data) agent.messages.push(m);
            console.log(renderSuccess(`Session loaded: ${selected.name}`));
            console.log(chalk.dim(`  ${data.length} messages restored`));
          } else {
            console.log(renderError('Unrecognized session format'));
          }
        } catch (err) {
          console.log(renderError('Failed to parse session file'));
        }
      }
      break;
    }

    case '/save':
      {
        const savePath = args ? (args.includes('/') || args.includes('\\') ? join(process.cwd(), args) : join(SESSIONS_PATH, args)) : getDefaultSessionPath();
        if (!args) {
          console.log(chalk.dim(`Saving current session to ${savePath}`));
        }
        ensureSessionsDir();
        const md = generateMarkdown();
        writeFileSync(savePath, md, 'utf-8');
        console.log(renderSuccess(`Saved to ${savePath}`));
      }
      break;

    case '/load':
      if (!args) { console.log(renderError('Usage: /load <filename>')); break; }
      try {
        const content = readFileSync(args, 'utf-8');
        parseAndLoadConversation(content);
        console.log(renderSuccess(`Loaded ${args}`));
      } catch (err) {
        console.log(renderError(err.message));
      }
      break;

    case '/setkey':
      const [provider, key] = args.split(' ');
      if (key) {
        config.apiKeys = config.apiKeys || {};
        config.apiKeys[provider] = key;
        saveConfig(config);
        agent = new Agent(config, analytics);
        console.log(renderSuccess(`Saved API key for ${provider}`));
      } else {
        console.log(renderError('Usage: /setkey <provider> <key>'));
      }
      break;

    case '/help':
      console.log(renderHelp(commandRegistry));
      break;

    case '/':
      // Show interactive menu
      showSlashMenu();
      break;

    default:
      console.log(renderError(`Unknown command: ${command}`));
  }
}

function generateMarkdown() {
  let md = '# Red CLI Conversation\n\n';
  for (const msg of agent.messages) {
    md += `## ${msg.role === 'user' ? 'User' : 'Assistant'}\n\n`;
    md += typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
    md += '\n\n';
  }
  return md;
}

function parseAndLoadConversation(md) {
  const lines = md.split('\n');
  let currentRole = '';
  let currentContent = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentRole) {
        agent.messages.push({ role: currentRole, content: currentContent.join('\n') });
      }
      currentRole = line.includes('User') ? 'user' : 'assistant';
      currentContent = [];
    } else if (currentRole) {
      currentContent.push(line);
    }
  }
  if (currentRole) {
    agent.messages.push({ role: currentRole, content: currentContent.join('\n') });
  }
}

function showSlashMenu() {
  console.log(chalk.red.bold('\n╭─ 🎯 Available Commands ────────────────────────────────────────╮'));
  console.log(chalk.red('│'));

  const commands = commandRegistry.getAll();
  const categories = [...new Set(commands.map(c => c.category))];

  for (const cat of categories) {
    const catCommands = commands.filter(c => c.category === cat);
    console.log(chalk.bold(`│  ${cat}:`));
    for (const cmd of catCommands) {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      console.log(chalk.cyan(`│    ${cmd.icon} ${cmd.name}${aliases}`));
      console.log(chalk.dim(`│       ${cmd.description.substring(0, 50)}`));
    }
    console.log(chalk.red('│'));
  }

  console.log(chalk.red('╰──────────────────────────────────────────────────────────────╯'));
  console.log(chalk.dim('  Type /command to run. Use Tab for autocomplete.\n'));
}
