import Fuse from 'fuse.js';

export const COMMAND_CATEGORIES = {
  MODES: 'Modes',
  SECURITY: 'Security',
  PLANNING: 'Planning & Agents',
  CONTEXT: 'Context',
  CONVERSATION: 'Conversation',
  CONFIG: 'Config',
  MEMORY: 'Memory & Learning',
  INFO: 'Info & Utils'
};

export const COMMANDS = [
  // 🎭 Modes
  {
    name: '/mode',
    aliases: [],
    description: 'Switch AI agent mode — recon, scan, exploit, report, osint, audit',
    longDescription: 'Switch the AI operating mode. Changes system prompt, available tools, and behavior.\n\nUsage:\n  /mode            — show available modes\n  /mode recon      — switch to recon mode (full toolkit)\n  /mode scan       — switch to scan mode\n  /mode exploit    — switch to exploit mode\n  /mode report     — switch to report mode\n  /mode osint      — switch to OSINT mode (passive only)\n  /mode audit      — switch to audit mode (code review)',
    category: COMMAND_CATEGORIES.MODES,
    icon: '🔄',
    args: [{ name: 'mode', required: false, description: 'recon, scan, exploit, report, osint, audit' }]
  },
  {
    name: '/recon',
    aliases: [],
    description: 'Switch to recon mode — or run recon on a target: /recon <target>',
    longDescription: 'Switch to recon mode (full toolkit). With a target, also runs reconnaissance immediately.\n\nUsage:\n  /recon           — switch to recon mode\n  /recon <target>  — switch to recon mode + run recon on target',
    category: COMMAND_CATEGORIES.MODES,
    icon: '🔍',
    args: [{ name: 'target', required: false, description: 'Target to recon' }]
  },
  {
    name: '/scan',
    aliases: [],
    description: 'Switch to scan mode — or scan a target: /scan <target>',
    longDescription: 'Switch to vulnerability scanning mode. With a target, also runs a vuln scan immediately.\n\nUsage:\n  /scan            — switch to scan mode\n  /scan <target>   — switch to scan mode + run vuln scan on target',
    category: COMMAND_CATEGORIES.MODES,
    icon: '🛡️',
    args: [{ name: 'target', required: false, description: 'Target to scan' }]
  },
  {
    name: '/exploit',
    aliases: ['/exp'],
    description: 'Switch to exploit mode — or run exploit: /exploit <type> <target>',
    longDescription: 'Switch to exploitation mode. With type + target, also runs the exploit immediately.\n\nUsage:\n  /exploit                — switch to exploit mode + show available types\n  /exploit xss <url>      — switch to exploit mode + run XSS test\n  /exploit sqli <url>     — switch to exploit mode + run SQLi test',
    category: COMMAND_CATEGORIES.MODES,
    icon: '💥',
    args: [{ name: 'type', required: false, description: 'Exploit type (xss, sqli, lfi, ssrf, cmdi)' }, { name: 'target', required: false, description: 'Target URL or endpoint' }]
  },
  {
    name: '/osint',
    aliases: [],
    description: 'Switch to OSINT mode — or run OSINT on a target: /osint <target>',
    longDescription: 'Switch to passive OSINT mode (web search, DNS, public data only). With a target, also runs passive recon immediately.\n\nUsage:\n  /osint            — switch to OSINT mode\n  /osint <target>   — switch to OSINT mode + run passive recon on target',
    category: COMMAND_CATEGORIES.MODES,
    icon: '🌐',
    args: [{ name: 'target', required: false, description: 'Target to research' }]
  },
  {
    name: '/audit',
    aliases: [],
    description: 'Switch to audit mode — or audit code: /audit <path>',
    longDescription: 'Switch to security code audit mode (read-only source analysis). With a path, also audits the code immediately.\n\nUsage:\n  /audit            — switch to audit mode\n  /audit <path>     — switch to audit mode + audit code at path',
    category: COMMAND_CATEGORIES.MODES,
    icon: '👁️',
    args: [{ name: 'path', required: false, description: 'Path to audit' }]
  },
  {
    name: '/report',
    aliases: [],
    description: 'Switch to report mode — or generate report now: /report [format]',
    longDescription: 'Switch to report mode. Generates pentest reports with evidence. With a format, also generates the report immediately.\n\nUsage:\n  /report           — switch to report mode + generate report\n  /report md        — generate markdown report\n  /report json      — generate JSON report',
    category: COMMAND_CATEGORIES.MODES,
    icon: '📋',
    args: []
  },
  {
    name: '/security',
    aliases: ['/sec', '/redteam', '/hack'],
    description: 'Enter Red security mode with full pentesting and vulnerability scanning',
    longDescription: 'Activates Red CLI\'s full security engine with access to all penetration testing, vulnerability scanning, and VPAT tools.\n\nUsage:\n  /security                  — enter security REPL\n  /security scan <target>    — quick vulnerability scan\n  /security pentest <url>    — full pentest\n  /security vpat <url>       — VPAT/accessibility audit\n  /security secrets ./      — find leaked secrets\n\n⚠️  Requires authorization for external targets',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🔴',
    args: [{ name: 'command', required: false, description: 'Security command' }, { name: 'target', required: false, description: 'Target URL or path' }]
  },
  {
    name: '/scope',
    aliases: [],
    description: 'Manage authorized red-team targets before running remote scans',
    longDescription: 'Manage authorized security scope for remote testing.\n\nUsage:\n  /scope list\n  /scope add <target> [note]\n  /scope remove <target>\n  /scope clear\n\nRemote scan, recon, pentest, and VPAT actions require the target to be in scope first.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🎯',
    args: [{ name: 'command', required: false, description: 'list, add, remove, or clear' }, { name: 'target', required: false, description: 'Domain, IP, wildcard, or CIDR' }]
  },
  // 🔴 Security
  {
    name: '/pentest',
    aliases: ['/pt'],
    description: 'Start a full penetration test against a target (requires authorization)',
    longDescription: 'Run a complete penetration test following PTES methodology. Includes reconnaissance, vulnerability scanning, exploitation, and reporting.\n\n⚠️  Requires explicit written authorization for external targets.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🔴',
    args: [{ name: 'target', required: true, description: 'Target URL or domain' }]
  },
  {
    name: '/vpat',
    aliases: [],
    description: 'VPAT/accessibility audit — WCAG 2.1, Section 508, ADA compliance',
    longDescription: 'Run VPAT (Voluntary Product Accessibility Template) accessibility audit. Tests against WCAG 2.1, Section 508, and ADA requirements.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '♿',
    args: [{ name: 'url', required: true, description: 'URL to test' }]
  },
  {
    name: '/secrets',
    aliases: [],
    description: 'Scan for leaked secrets, API keys, credentials in code and git history',
    longDescription: 'Scan codebase for leaked secrets, API keys, passwords, tokens, and other sensitive credentials. Also checks git history.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🔑',
    args: [{ name: 'path', required: false, description: 'Path to scan (default: .)' }]
  },
  {
    name: '/bugs',
    aliases: [],
    description: 'AI-powered bug finder — logic bugs, security bugs, reliability issues',
    longDescription: 'Scan code for potential bugs including logic errors, security vulnerabilities, race conditions, and reliability issues.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🐛',
    args: [{ name: 'path', required: false, description: 'Path to scan (default: .)' }]
  },
  {
    name: '/cve',
    aliases: [],
    description: 'Look up CVE details and check if your dependencies are affected',
    longDescription: 'Look up CVE details by ID or check if project dependencies have known vulnerabilities.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🛡️',
    args: [{ name: 'cve-id', required: false, description: 'CVE ID (e.g., CVE-2021-44228)' }]
  },
  {
    name: '/doctor',
    aliases: [],
    description: 'Check Red CLI setup, tool availability, and diagnose issues',
    longDescription: 'Run diagnostics on Red CLI setup. Checks API keys, tools, configuration, and identifies issues. Use --fix to auto-fix problems.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '🩺',
    args: [{ name: 'fix', required: false, description: '--fix to auto-fix issues' }]
  },
  {
    name: '/install-tools',
    aliases: [],
    description: 'Install missing security tools for your platform',
    longDescription: 'Install missing security tools based on your platform. On Windows, recommends WSL or package managers. On Linux/macOS, attempts installation.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '📦',
    args: []
  },
  {
    name: '/tool-status',
    aliases: ['/tools'],
    description: 'Show which security tools are installed and which are missing',
    longDescription: 'Display installation status for all security tools. Shows which are installed, which are missing, and how to install them.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '🔧',
    args: []
  },
  {
    name: '/collect-evidence',
    aliases: ['/evidence'],
    description: 'Generate a report from the current evidence session',
    longDescription: 'Generate a markdown report and summary from all collected evidence in the current session. Saves to ~/.red/evidence/<session-id>/REPORT.md.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '📋',
    args: []
  },
  {
    name: '/sessions',
    aliases: [],
    description: 'List all evidence collection sessions',
    longDescription: 'Show all past evidence collection sessions with their status, target, and findings count.',
    category: COMMAND_CATEGORIES.SECURITY,
    icon: '📁',
    args: []
  },

  // 📋 Planning & Agents
  {
    name: '/plan',
    aliases: [],
    description: 'Generate a step-by-step plan and confirm before executing',
    longDescription: 'Generate a detailed step-by-step plan for the task. Shows the plan first, then asks for confirmation before executing each step.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '📋',
    args: [{ name: 'task', required: true, description: 'Task to plan' }]
  },
  {
    name: '/autonomous',
    aliases: ['/auto'],
    description: 'Run autonomously in a loop until the task is complete',
    longDescription: 'Run in autonomous mode. Agent will continuously work on the task, making decisions and executing tools until completion or max iterations.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '🤖',
    args: [{ name: 'task', required: true, description: 'Task to complete' }]
  },
  {
    name: '/background',
    aliases: ['/bg'],
    description: 'Continue this session in the background and free the terminal',
    longDescription: 'Detach current session to background, freeing the terminal. Session continues running and can be resumed later.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '⏳',
    args: []
  },
  {
    name: '/agents',
    aliases: [],
    description: 'Manage and spawn parallel sub-agents for concurrent tasks',
    longDescription: 'Spawn parallel sub-agents for handling multiple tasks concurrently. Each agent runs independently with its own context.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '👥',
    args: [{ name: 'tasks', required: true, description: 'Comma-separated tasks' }]
  },
  {
    name: '/parallel',
    aliases: [],
    description: 'Run multiple tasks in parallel with separate agent contexts',
    longDescription: 'Execute multiple tasks in parallel. Each task gets its own agent context and results are collected when all complete.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '⚡',
    args: [{ name: 'tasks', required: true, description: 'Tasks to run' }]
  },
  {
    name: '/queue',
    aliases: [],
    description: 'Manage the task queue — add, list, run queued tasks',
    longDescription: 'Manage a queue of tasks to run sequentially. Useful for batch operations.\n\nUsage:\n  /queue add <task>   — Add task to queue\n  /queue list         — Show queued tasks\n  /queue run          — Execute all tasks\n  /queue clear        — Clear queue',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '📥',
    args: [{ name: 'command', required: false, description: 'add, list, run, or clear' }, { name: 'task', required: false, description: 'Task (for add)' }]
  },
  {
    name: '/goal',
    aliases: [],
    description: 'Set a completion condition — Red keeps working until goal is met',
    longDescription: 'Define a goal condition. Red will continue working until the condition is met or max iterations reached.',
    category: COMMAND_CATEGORIES.PLANNING,
    icon: '🎯',
    args: [{ name: 'goal', required: true, description: 'Goal description' }]
  },

  // 📁 Context
  {
    name: '/add',
    aliases: [],
    description: 'Add file or glob to context: /add src/**/*.js',
    longDescription: 'Add files to the current context for the AI to consider. Supports glob patterns.',
    category: COMMAND_CATEGORIES.CONTEXT,
    icon: '➕',
    args: [{ name: 'path', required: true, description: 'File path or glob pattern' }]
  },
  {
    name: '/drop',
    aliases: [],
    description: 'Remove a file from current context',
    longDescription: 'Remove a file from the current context.',
    category: COMMAND_CATEGORIES.CONTEXT,
    icon: '➖',
    args: [{ name: 'path', required: true, description: 'File to remove' }]
  },
  {
    name: '/context',
    aliases: ['/ctx'],
    description: "Show what's in context — files, token usage bar, summary",
    longDescription: 'Display current context including files, token usage, and summary.',
    category: COMMAND_CATEGORIES.CONTEXT,
    icon: '📂',
    args: []
  },
  {
    name: '/compact',
    aliases: [],
    description: 'Summarize conversation to save tokens — keeps key info',
    longDescription: 'Compress the conversation history by summarizing and keeping only key information. Saves tokens while preserving important context.',
    category: COMMAND_CATEGORIES.CONTEXT,
    icon: '🗜️',
    args: []
  },
  {
    name: '/add-dir',
    aliases: [],
    description: 'Add a new working directory to the session',
    longDescription: 'Add an additional working directory to the session. Useful for multi-project work.',
    category: COMMAND_CATEGORIES.CONTEXT,
    icon: '📁',
    args: [{ name: 'path', required: true, description: 'Directory path' }]
  },

  // 💬 Conversation
  {
    name: '/clear',
    aliases: [],
    description: 'Start a new session with empty context (previous stays resumable)',
    longDescription: 'Clear the current conversation. Previous sessions are saved and can be resumed.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '🧹',
    args: []
  },
  {
    name: '/resume',
    aliases: [],
    description: 'Resume a previous session by ID or pick from list',
    longDescription: 'Resume a previous session. Shows a list of recent sessions to choose from.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '▶️',
    args: [{ name: 'session-id', required: false, description: 'Session ID to resume' }]
  },
  {
    name: '/history',
    aliases: ['/hist'],
    description: 'Show last 10 messages in conversation history',
    longDescription: 'Display the last 10 messages in the current conversation.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '📜',
    args: [{ name: 'count', required: false, description: 'Number of messages (default: 10)' }]
  },
  {
    name: '/undo',
    aliases: [],
    description: 'Remove the last user + assistant message pair',
    longDescription: 'Remove the last user message and its corresponding assistant response.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '↩️',
    args: []
  },
  {
    name: '/retry',
    aliases: [],
    description: 'Re-send the last user message — useful if response was bad',
    longDescription: 'Re-execute the last user message. Useful if the previous response was unsatisfactory.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '🔄',
    args: []
  },
  {
    name: '/aside',
    aliases: ['/btw'],
    description: 'Ask a quick side question without interrupting the main conversation',
    longDescription: 'Ask a side question that doesn\'t affect the main task. Results are shown but main conversation continues.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '💭',
    args: [{ name: 'question', required: true, description: 'Side question' }]
  },
  {
    name: '/branch',
    aliases: [],
    description: 'Create a branch of the current conversation at this point',
    longDescription: 'Create an alternative branch of the conversation. Allows exploring different directions without losing current state.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '🌿',
    args: [{ name: 'name', required: false, description: 'Branch name' }]
  },
  {
    name: '/save',
    aliases: [],
    description: 'Save conversation history as markdown: /save [filename.md]',
    longDescription: 'Save the current conversation as a Markdown file. If no filename is provided, saves to ~/.red/sessions.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '💾',
    args: [{ name: 'filename', required: false, description: 'Output filename (optional)' }]
  },
  {
    name: '/load',
    aliases: [],
    description: 'Load and resume a saved conversation from file',
    longDescription: 'Load and resume a previously saved conversation from a Markdown file.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '📂',
    args: [{ name: 'filename', required: true, description: 'File to load' }]
  },
  {
    name: '/copy',
    aliases: [],
    description: 'Copy the last assistant response to clipboard',
    longDescription: 'Copy the last assistant response to the system clipboard.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '📋',
    args: []
  },
  {
    name: '/diff',
    aliases: [],
    description: 'Show all file changes made in this session as a unified diff',
    longDescription: 'Display all file modifications made during this session as a unified diff.',
    category: COMMAND_CATEGORIES.CONVERSATION,
    icon: '📊',
    args: []
  },

  // ⚙️ Config
  {
    name: '/model',
    aliases: [],
    description: 'Switch AI provider and model: /model anthropic/claude-opus-4-7',
    longDescription: 'Switch the AI provider and model. Shows available models when used without arguments.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '🧠',
    args: [{ name: 'model', required: false, description: 'Model (e.g., anthropic/claude-sonnet-4-6)' }]
  },
  {
    name: '/update-config',
    aliases: [],
    description: 'Configure Red CLI settings and behaviors',
    longDescription: 'Open the configuration file in your default editor for comprehensive settings.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '⚙️',
    args: []
  },
  {
    name: '/color',
    aliases: [],
    description: 'Set the prompt bar color for this session',
    longDescription: 'Change the prompt bar color. Options: red, cyan, green, yellow, magenta, blue.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '🎨',
    args: [{ name: 'color', required: true, description: 'Color name' }]
  },
  {
    name: '/theme',
    aliases: [],
    description: 'Switch UI theme: dark, light, minimal, hacker',
    longDescription: 'Switch the terminal UI theme.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '🖌️',
    args: [{ name: 'theme', required: true, description: 'Theme: dark, light, minimal, hacker' }]
  },
  {
    name: '/scroll-speed',
    aliases: [],
    description: 'Tune mouse wheel scroll speed with live preview',
    longDescription: 'Adjust the scroll speed for terminal output.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '🖱️',
    args: [{ name: 'speed', required: false, description: 'Speed: slow, normal, fast' }]
  },
  {
    name: '/prompt',
    aliases: [],
    description: 'Open system prompt in $EDITOR for live editing',
    longDescription: 'Open the system prompt in your editor for custom modification.',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '📝',
    args: []
  },
  {
    name: '/multiline',
    aliases: ['/ml'],
    description: 'Toggle multi-line input mode — Enter adds newlines, Esc to submit',
    longDescription: 'Toggle between single-line and multi-line input modes.\n\nIn multi-line mode:\n  Enter    — insert newline\n  Esc      — submit message\n  Ctrl+Enter — submit message\n\nIn single-line mode:\n  Enter    — submit message\n  Paste    — auto-detected and normalized',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '📝',
    args: []
  },
  {
    name: '/set',
    aliases: [],
    description: 'Toggle settings — autoFallback, stream, memory, etc.',
    longDescription: 'Toggle or view settings.\n\nUsage:\n  /set                 — list all settings\n  /set autoFallback    — toggle auto-fallback on rate limit\n  /set stream          — toggle streaming output\n  /set memory          — toggle memory system',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '⚙️',
    args: [{ name: 'setting', required: false, description: 'autoFallback, stream, memory' }]
  },
  {
    name: '/agent',
    aliases: [],
    description: 'List available subagents or invoke one directly',
    longDescription: 'Manage and invoke subagents.\n\nUsage:\n  /agent           — list all available agents\n  /agent recon     — invoke recon subagent with next message\n  /agent @recon <task> — direct invocation\n\nAvailable subagents:\n  @recon    — Reconnaissance and enumeration\n  @exploit  — Exploit development and testing\n  @audit    — Code and security audit\n  @report   — Finding correlation and report generation\n  @pentest  — Penetration testing execution',
    category: COMMAND_CATEGORIES.CONFIG,
    icon: '🤖',
    args: [{ name: 'agent', required: false, description: 'agent name or @agent <task>' }]
  },

  // 🤖 Memory & Learning
  {
    name: '/memory',
    aliases: ['/mem'],
    description: "View and manage Red's memory about you and your projects",
    longDescription: "Manage Red's memory system. View, add, or remove memories about you and your projects.\n\nUsage:\n  /memory              — list all memories\n  /memory set <key> <value>  — add memory\n  /memory forget <key> — remove memory\n  /memory clear       — clear project memory",
    category: COMMAND_CATEGORIES.MEMORY,
    icon: '🧠',
    args: [{ name: 'command', required: false, description: 'set, forget, clear, project' }, { name: 'key', required: false }, { name: 'value', required: false }]
  },
  {
    name: '/advisor',
    aliases: [],
    description: 'Configure Advisor Tool to consult a stronger model at key moments',
    longDescription: 'Configure when to consult a stronger model for difficult decisions.',
    category: COMMAND_CATEGORIES.MEMORY,
    icon: '🎓',
    args: [{ name: 'mode', required: false, description: 'auto, ask, or off' }]
  },

  // 📊 Info & Utils
  {
    name: '/tokens',
    aliases: [],
    description: 'Show token usage and estimated cost for this session',
    longDescription: 'Display token usage and estimated API cost for the current session.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '💰',
    args: []
  },
  {
    name: '/usage',
    aliases: [],
    description: 'Show weekly/monthly API usage and cost breakdown',
    longDescription: 'Display historical API usage and cost statistics.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '📈',
    args: [{ name: 'period', required: false, description: 'week or month' }]
  },
  {
    name: '/help',
    aliases: ['/?', '/h'],
    description: 'Show all commands, keybindings, and getting started guide',
    longDescription: 'Display help with all available commands and keyboard shortcuts.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '❓',
    args: [{ name: 'command', required: false, description: 'Specific command help' }]
  },
  {
    name: '/release-notes',
    aliases: [],
    description: "Show what's new in this version of Red CLI",
    longDescription: "Display the release notes for the current version.",
    category: COMMAND_CATEGORIES.INFO,
    icon: '📰',
    args: []
  },
  {
    name: '/snapshot',
    aliases: [],
    description: 'Create a git stash checkpoint before making changes',
    longDescription: 'Create a checkpoint of the current state. Can be used for rollback.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '📸',
    args: [{ name: 'note', required: false, description: 'Optional note' }]
  },
  {
    name: '/rollback',
    aliases: [],
    description: 'Roll back to a previous checkpoint',
    longDescription: 'Roll back to a previous checkpoint. Requires checkpoint ID.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '⏪',
    args: [{ name: 'checkpoint-id', required: false, description: 'Checkpoint ID' }]
  },
  {
    name: '/checkpoints',
    aliases: [],
    description: 'List all saved checkpoints with timestamps',
    longDescription: 'List all saved checkpoints with their IDs and timestamps.',
    category: COMMAND_CATEGORIES.INFO,
    icon: '🏁',
    args: []
  },
  {
    name: '/web',
    aliases: [],
    description: 'Quick web search: /web <query>',
    longDescription: 'Perform a quick web search. (Requires web search capability)',
    category: COMMAND_CATEGORIES.INFO,
    icon: '🌐',
    args: [{ name: 'query', required: true, description: 'Search query' }]
  }
];

// Fuzzy search setup
const fuseOptions = {
  keys: [
    { name: 'name', weight: 0.4 },
    { name: 'aliases', weight: 0.2 },
    { name: 'description', weight: 0.3 },
    { name: 'category', weight: 0.1 }
  ],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true
};

const fuse = new Fuse(COMMANDS, fuseOptions);

export class CommandRegistry {
  constructor() {
    this.commands = COMMANDS;
    this.fuse = fuse;
  }

  search(query) {
    if (!query || query.length <= 1) {
      return this.commands;
    }
    const results = this.fuse.search(query);
    return results.map(r => ({ ...r.item, score: r.score, matches: r.matches }));
  }

  getCommand(name) {
    const normalized = name.toLowerCase();
    return this.commands.find(cmd =>
      cmd.name.toLowerCase() === normalized ||
      cmd.aliases.map(a => a.toLowerCase()).includes(normalized)
    );
  }

  getByCategory(category) {
    return this.commands.filter(cmd => cmd.category === category);
  }

  getCategories() {
    return [...new Set(this.commands.map(cmd => cmd.category))];
  }

  getAll() {
    return this.commands;
  }
}

export default new CommandRegistry();
