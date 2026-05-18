import chalk from 'chalk';
import highlight from 'cli-highlight';

const BOX_WIDTH = 80;

const THEMES = {
  dark: {
    user: 'cyan',
    assistant: 'white',
    tool: 'yellow',
    error: 'red',
    success: 'green',
    dim: 'gray',
    box: 'dim'
  },
  light: {
    user: 'blue',
    assistant: 'black',
    tool: 'yellow',
    error: 'red',
    success: 'green',
    dim: 'gray',
    box: 'gray'
  },
  minimal: {
    user: 'white',
    assistant: 'white',
    tool: 'white',
    error: 'white',
    success: 'white',
    dim: 'white',
    box: 'white'
  }
};

function getTheme() {
  if (process.env.NO_COLOR) return THEMES.minimal;
  const themeName = process.env.RED_THEME || 'dark';
  return THEMES[themeName] || THEMES.dark;
}

const theme = getTheme();

function box(content, title = '') {
  const lines = content.split('\n');
  const width = Math.min(BOX_WIDTH, process.stdout.columns || 80);

  let result = '';
  const boxCh = theme.box === 'white' ? '-' : '─';

  if (title) {
    const pad = width - title.length - 4;
    result += `${theme.box === 'white' ? '+' : '┌'}${theme.box === 'white' ? '-'.repeat(pad) : boxCh.repeat(pad)} ${title} ${theme.box === 'white' ? '+' : '┐'}\n`;
  } else {
    result += `${theme.box === 'white' ? '+' : '┌'}${theme.box === 'white' ? '-'.repeat(width - 2) : boxCh.repeat(width - 2)}${theme.box === 'white' ? '+' : '┐'}\n`;
  }

  for (const line of lines) {
    const padding = width - line.length - 2;
    const padChar = theme.box === 'white' ? ' ' : ' ';
    result += `${theme.box === 'white' ? '|' : '│'}${padChar}${line}${padChar.repeat(Math.max(0, padding))}${theme.box === 'white' ? '|' : '│'}\n`;
  }

  result += `${theme.box === 'white' ? '+' : '└'}${theme.box === 'white' ? '-'.repeat(width - 2) : boxCh.repeat(width - 2)}${theme.box === 'white' ? '+' : '┘'}`;

  return result;
}

function highlightCode(code) {
  try {
    return highlight(code, { language: 'auto', theme: ' Terminal' });
  } catch {
    return code;
  }
}

export function renderUserPrompt() {
  return chalk[theme.user].bold('red> ');
}

export function renderClaudeResponse(text) {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    result += text.slice(lastIndex, match.index);
    result += highlightCode(match[2]);
    lastIndex = match.index + match[0].length;
  }

  result += text.slice(lastIndex);

  return chalk[theme.assistant](result);
}

export function renderToolCall(toolName, input) {
  const inputStr = JSON.stringify(input, null, 2).slice(0, 200);
  return box(`${chalk[theme.tool].bold('⚙️  ' + toolName)}\n${chalk[theme.dim](inputStr)}`, `Tool Call`);
}

export function renderToolResult(result) {
  if (result.error) {
    return box(chalk[theme.error].bold('Error: ' + result.error), 'Tool Result');
  }

  if (result.cancelled) {
    return box(chalk.yellow('Command cancelled by user'), 'Tool Result');
  }

  let content = '';
  if (result.output !== undefined) {
    content = result.truncated
      ? chalk[theme.tool](`[Output truncated. ${result.originalLength} chars]\n\n`) + result.output
      : result.output;
  } else if (result.content !== undefined) {
    content = result.content;
  } else if (result.items !== undefined) {
    content = result.items;
  } else if (result.results !== undefined) {
    content = result.results;
  } else if (result.success !== undefined) {
    content = result.preview || JSON.stringify(result, null, 2);
  } else {
    content = JSON.stringify(result, null, 2);
  }

  return box(chalk[theme.dim](content), 'Output');
}

export function renderError(message) {
  return chalk[theme.error].bold('Error: ') + chalk[theme.error](message);
}

export function renderSuccess(message) {
  return chalk[theme.success](message);
}

export function renderHelp(registry = null) {
  // If registry is provided, use it to show categorized commands
  if (registry && registry.getAll) {
    const commands = registry.getAll();
    const categories = [...new Set(commands.map(c => c.category))];

    let helpText = chalk.bold('\n🎯 Available Commands\n');
    helpText += chalk.dim('─'.repeat(60)) + '\n';

    for (const cat of categories) {
      helpText += chalk.bold(`\n${cat}:\n`);
      const catCommands = commands.filter(c => c.category === cat);
      for (const cmd of catCommands.slice(0, 5)) {
        const aliases = cmd.aliases.length > 0 ? ` ${chalk.dim(cmd.aliases.join(', '))}` : '';
        helpText += `  ${cmd.icon} ${chalk.cyan(cmd.name)}${aliases} ${chalk.dim('- ' + cmd.description.substring(0, 40))}\n`;
      }
      if (catCommands.length > 5) {
        helpText += chalk.dim(`  ... and ${catCommands.length - 5} more (type / to see all)\n`);
      }
    }

    helpText += chalk.dim('\n─'.repeat(60)) + '\n';
    helpText += chalk.dim('  Type /command to run. Use Tab for autocomplete.\n');

    return helpText;
  }

  // Default help (no registry)
  return `
${chalk.bold('Available Commands:')}

${chalk[theme.user]('/exit')} or ${chalk[theme.user]('/quit')}   Exit the CLI
${chalk[theme.user]('/clear')}              Clear conversation history
${chalk[theme.user]('/history')}            Show last 10 messages
${chalk[theme.user]('/undo')}               Remove last message pair
${chalk[theme.user]('/retry')}              Re-send last user message
${chalk[theme.user]('/model <name>')}       Switch model (no args to list)
${chalk[theme.user]('/mode <name>')}        Switch mode (code/review/ask/devops/docs/commit)
${chalk[theme.user]('/provider <name>')}    Switch provider (anthropic/openai/gemini/ollama)
${chalk[theme.user]('/add <file>')}         Add file to context
${chalk[theme.user]('/drop <file>')}        Remove file from context
${chalk[theme.user]('/context')}            Show project context
${chalk[theme.user]('/')}                   Show all commands (interactive menu)

${chalk.bold('Plan & Auto Mode:')}
${chalk[theme.user]('/plan <task>')}         Create and execute a plan
${chalk[theme.user]('/run <task>')}         Run directly without planning
${chalk[theme.user]('/auto <task>')}         Run in autonomous mode

${chalk.bold('Queue & Tasks:')}
${chalk[theme.user]('/queue add <task>')}    Add task to queue
${chalk[theme.user]('/queue run')}          Run all queued tasks
${chalk[theme.user]('/queue list')}         Show queued tasks
${chalk[theme.user]('/queue clear')}         Clear queue

${chalk.bold('Checkpoint & Rollback:')}
${chalk[theme.user]('/checkpoint')}          Create a checkpoint
${chalk[theme.user]('/checkpoints')}         List all checkpoints
${chalk[theme.user]('/rollback')}            Rollback to last checkpoint

${chalk.bold('Memory:')}
${chalk[theme.user]('/memory')}              Show all memories
${chalk[theme.user]('/memory set <k> <v>')}  Set project memory
${chalk[theme.user]('/memory forget <key>')} Delete a memory

${chalk.bold('Diagnostics:')}
${chalk[theme.user]('/doctor')}              Run Red Doctor diagnostics
${chalk[theme.user]('/usage')}               Show usage statistics
${chalk[theme.user]('/tokens')}              Show current session tokens

${chalk.bold('Other:')}
${chalk[theme.user]('/copy')}               Copy last response to clipboard
${chalk[theme.user]('/save <file>')}         Save conversation as markdown
${chalk[theme.user]('/load <file>')}         Load conversation from markdown
${chalk[theme.user]('/setkey <p> <key>')}    Save API key
${chalk[theme.user]('/help')}               Show this help

${chalk.bold('Modes:')}
  code    - Default. Full tool access
  review  - Read-only, no writes
  ask     - No tools, pure Q&A
  devops  - Shell, git, docker focused
  docs    - Documentation focused
  commit  - One-shot commit message

${chalk.bold('Tips:')}
- Auto-trigger planning for tasks with 20+ words or keywords: add, build, create, refactor
- Use /run to skip planning, /auto for autonomous execution
- Type / alone to see interactive command menu
- Set theme with: RED_THEME=dark|light|minimal
`;
}

export function renderHistory(messages) {
  const recent = messages.slice(-10);
  let output = chalk.bold('\nRecent Messages:\n');

  for (const msg of recent) {
    const role = msg.role === 'user' ? chalk[theme.user]('[User]') : chalk[theme.tool]('[Assistant]');
    const content = typeof msg.content === 'string'
      ? msg.content.slice(0, 100) + (msg.content.length > 100 ? '...' : '')
      : '[structured]';
    output += `${role} ${content}\n`;
  }

  return output;
}

export function clearScreen() {
  // Use ANSI escape sequence that works better across terminals
  process.stdout.write('\x1B[2J\x1B[0f');
}

export function renderStartupBanner(version = '0.2.0', provider, model, mode, toolCount, mcpCount = 0) {
  return `
${chalk.cyan.bold('██████╗ ███████╗██████╗ ')}${chalk.white.bold('██╗      ')}${chalk.cyan.bold('█████╗ ██████╗ ██████╗ ')}${chalk.white.bold('███████╗')}
${chalk.cyan.bold('██╔══██╗██╔════╝██╔══██╗')}${chalk.white.bold('██║     ')}${chalk.cyan.bold('██╔═══██╗██╔══██╗██╔══██╗')}${chalk.white.bold('██╔════╝')}
${chalk.cyan.bold('██████╔╝█████╗  ██║  ██║')}${chalk.white.bold('██║     ')}${chalk.cyan.bold('██║   ██║██████╔╝██║  ██║')}${chalk.white.bold('█████╗  ')}
${chalk.cyan.bold('██╔══██╗██╔══╝  ██║  ██║')}${chalk.white.bold('██║     ')}${chalk.cyan.bold('██║   ██║██╔══██╗██║  ██║')}${chalk.white.bold('██╔══╝  ')}
${chalk.cyan.bold('██║  ██║███████╗██████╔╝')}${chalk.white.bold('███████╗')}${chalk.cyan.bold('╚██████╔╝██████╔╝██████╔╝')}${chalk.white.bold('███████╗')}
${chalk.cyan.bold('╚═╝  ╚═╝╚══════╝╚═════╝ ')}${chalk.white.bold('╚══════╝')}${chalk.cyan.bold(' ╚═════╝ ╚═════╝ ╚═════╝ ')}${chalk.white.bold('╚══════╝')}

${chalk.white.bold('v' + version)}
${chalk.dim('Provider:')} ${provider}  ${chalk.dim('Model:')} ${model}
${chalk.dim('Mode:')} ${mode}  ${chalk.dim('Tools:')} ${toolCount}  ${mcpCount > 0 ? `${chalk.dim('MCP:')} ${mcpCount} servers` : ''}
Type ${chalk.cyan('/help')} for commands
`;
}