import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TIPS = [
  'Run /plan before complex tasks for better results',
  'Use /add to include files in context before asking questions',
  'Type / to see all available commands',
  'Use /mode to switch between code, ask, review modes',
  'Run /memory to manage Red\'s knowledge about you',
  'Use /clear to start fresh without losing conversation history',
  'Press Ctrl+R to search through command history',
  'Use /tokens to check your API usage during sessions'
];

const VERSION_FEATURES = [
  '✦ Interactive slash command menu',
  '✦ Security & Red Teaming engine',
  '✦ Auto-agent with plan mode',
  '✦ Multi-provider AI support'
];

function getRandomItems(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export function renderWelcome(config = {}) {
  const maxWidth = process.stdout.columns || 80;
  const panelWidth = Math.min(35, Math.floor(maxWidth / 2) - 2);

  const asciiArt = [
    '       ██████╗ ███████╗██████╗     ',
    '       ██╔══██╗██╔════╝██╔══██╗    ',
    '       ██████╔╝█████╗  ██║  ██║    ',
    '       ██╔══██╗██╔══╝  ██║  ██║    ',
    '       ██║  ██║███████╗██████╔╝    ',
    '       ╚═╝  ╚═╝╚══════╝╚═════╝     '
  ];

  const modelInfo = config.model || 'claude-sonnet-4';
  const providerInfo = config.provider || 'Anthropic';
  const modeInfo = config.mode || 'code';
  const toolCount = config.toolCount || 18;
  const cwd = process.cwd().replace(homedir(), '~');

  // Left panel - ASCII art and info (as array)
  let leftPanel = [
    ...asciiArt.map(line => chalk.red.bold(line)),
    '',
    chalk.dim(`  ${modelInfo} · ${providerInfo}`),
    chalk.dim(`  Mode: ${modeInfo} · Tools: ${toolCount}`),
    chalk.dim(`  ${cwd}`)
  ];

  // Right panel - Tips
  const tips = getRandomItems(TIPS, 3);
  let rightPanel = [
    chalk.bold('  Tips for getting started'),
    chalk.dim('  ' + '─'.repeat(panelWidth - 4)),
    ...tips.map(tip => chalk.dim('  ') + tip),
    '',
    chalk.bold('  What\'s new in v0.4.0'),
    chalk.dim('  ' + '─'.repeat(panelWidth - 4)),
    ...VERSION_FEATURES.map(f => chalk.red('  ') + f),
    '',
    chalk.dim('  /release-notes for more')
  ];

  // Build output line by line
  let output = '\n';

  // Top border
  output += chalk.dim('╭' + '─'.repeat(panelWidth) + '╮  ╭' + '─'.repeat(panelWidth) + '╮\n');

  const maxLines = Math.max(leftPanel.length, rightPanel.length);

  for (let i = 0; i < maxLines; i++) {
    const leftContent = leftPanel[i] || '';
    const rightContent = rightPanel[i] || '';

    const leftPadded = leftContent.padEnd(panelWidth);
    const rightPadded = rightContent.padEnd(panelWidth);

    output += chalk.dim('│') + leftPadded + chalk.dim('│  ');
    output += chalk.dim('│') + rightPadded + chalk.dim('│\n');
  }

  // Bottom border
  output += chalk.dim('╰' + '─'.repeat(panelWidth) + '╯  ╰' + '─'.repeat(panelWidth) + '╯\n');

  return output;
}

export function showWelcome(config = {}) {
  // Use ANSI escape for cleaner cross-platform clear
  // This is more reliable than console.clear() in various terminals
  process.stdout.write('\x1B[2J\x1B[0f');
  console.log(renderWelcome(config));
  console.log('');
}

export default { renderWelcome, showWelcome };