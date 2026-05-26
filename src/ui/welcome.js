import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TIPS = [
  'Type "scan example.com" — intent detection auto-switches mode',
  '/pentest <target> for autonomous penetration testing',
  '/scope add <target> to authorize targets before testing',
  '/exploit xss <url> for quick exploitation tests',
  'Type / to see all commands with fuzzy search'
];

function getRandomTip() {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

function providerStatus(config) {
  const keys = config.apiKeys || {};
  const providers = [
    { name: 'Anthropic', key: keys.anthropic },
    { name: 'Bedrock', key: keys.bedrock },
    { name: 'OpenAI', key: keys.openai },
    { name: 'Gemini', key: keys.gemini },
    { name: 'NVIDIA', key: keys.nvidia },
    { name: 'Ollama', key: true },
  ];
  return providers.map(p => {
    const ok = p.key ? chalk.green('✓') : chalk.dim('○');
    const name = p.key ? chalk.white(p.name) : chalk.dim(p.name);
    return `${ok} ${name}`;
  }).join('  ');
}

export function renderWelcome(config = {}) {
  const w = Math.min(70, (process.stdout.columns || 80) - 4);
  const mode = config.mode || 'recon';
  const model = config.model || 'claude-sonnet-4-6';
  const provider = config.provider || 'anthropic';
  const toolCount = config.toolCount || 25;
  const mcpCount = config.mcpCount || 0;
  const cwd = process.cwd().replace(homedir(), '~');

  const modeColors = { recon: 'cyan', scan: 'yellow', exploit: 'red', report: 'green', osint: 'blue', audit: 'magenta' };
  const modeColor = modeColors[mode] || 'cyan';

  let o = '\n';
  o += chalk.red.bold('  ██████╗ ███████╗██████╗ ') + chalk.dim('  CLI v0.4.2\n');
  o += chalk.red.bold('  ██╔══██╗██╔════╝██╔══██╗') + chalk.dim('  Autonomous Red Team Platform\n');
  o += chalk.red.bold('  ██████╔╝█████╗  ██║  ██║\n');
  o += chalk.red.bold('  ██╔══██╗██╔══╝  ██║  ██║') + chalk.dim(`  ${cwd}\n`);
  o += chalk.red.bold('  ██║  ██║███████╗██████╔╝\n');
  o += chalk.red.bold('  ╚═╝  ╚═╝╚══════╝╚═════╝ \n');
  o += '\n';
  o += chalk.dim('  ' + '─'.repeat(w)) + '\n';
  o += `  ${chalk.bold('Provider')} ${chalk.white(provider)}  ${chalk.bold('Model')} ${chalk.white(model)}\n`;
  o += `  ${chalk.bold('Mode')} ${chalk[modeColor].bold(mode)}  ${chalk.bold('Tools')} ${toolCount}${mcpCount > 0 ? `  ${chalk.bold('MCP')} ${mcpCount}` : ''}\n`;
  o += '\n';
  o += `  ${providerStatus(config)}\n`;
  o += '\n';
  o += chalk.dim('  ' + '─'.repeat(w)) + '\n';
  o += chalk.dim(`  💡 ${getRandomTip()}\n`);
  o += '\n';

  return o;
}

export function showWelcome(config = {}) {
  process.stdout.write('\x1B[2J\x1B[0f');
  console.log(renderWelcome(config));
}

export default { renderWelcome, showWelcome };
