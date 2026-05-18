import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { loadQueue } from './queue.js';

const REQUIRED_NODE_VERSION = 18;

export class Doctor {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.checks = [];
  }

  async run(fix = false) {
    console.log(chalk.cyan.bold('\n╭─ 🩺 Red CLI Doctor ────────────────────────────╮'));
    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('│'));

    await this.checkSystem();
    await this.checkApiKeys();
    await this.checkTools();
    await this.checkConfig();
    await this.checkMemory();
    await this.checkQueue();

    console.log(chalk.cyan('│'));

    if (this.issues.length > 0 || this.warnings.length > 0) {
      console.log(chalk.cyan('│') + chalk.red(`  Issues: ${this.issues.length}`));
      console.log(chalk.cyan('│') + chalk.yellow(`  Warnings: ${this.warnings.length}`));
    } else {
      console.log(chalk.cyan('│') + chalk.green('  All checks passed!'));
    }

    console.log(chalk.cyan('│'));
    if (fix) {
      console.log(chalk.cyan('│') + chalk.dim('  Running fixes...'));
      await this.runFixes();
    } else {
      console.log(chalk.cyan('│') + chalk.dim('  Run red doctor --fix to auto-fix issues'));
    }

    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('╰') + '─'.repeat(54) + '╯\n');
  }

  async checkSystem() {
    console.log(chalk.cyan('│') + chalk.bold('  System'));

    const nodeVersion = process.version;
    const nodeNum = parseInt(nodeVersion.split('.')[0].replace('v', ''), 10);

    if (nodeNum >= REQUIRED_NODE_VERSION) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ Node.js: ') + nodeVersion + chalk.green(' (>=18 required)'));
    } else {
      this.issues.push('Node.js version too old');
      console.log(chalk.cyan('│') + chalk.red('    ❌ Node.js: ') + nodeVersion + chalk.red(' (>=18 required)'));
    }

    const os = process.platform;
    const osName = os === 'win32' ? 'Windows' : os === 'darwin' ? 'macOS' : 'Linux';
    console.log(chalk.cyan('│') + chalk.green('    ✅ OS: ') + osName);

    const shell = process.env.SHELL || process.env.COMSPEC || 'unknown';
    console.log(chalk.cyan('│') + chalk.green('    ✅ Shell: ') + shell.split('/').pop());
  }

  async checkApiKeys() {
    console.log(chalk.cyan('│') + chalk.bold('  API Keys'));

    const config = loadConfig();
    const keys = config?.apiKeys || {};

    if (keys.anthropic) {
      const masked = 'sk-ant-...' + keys.anthropic.slice(-5);
      console.log(chalk.cyan('│') + chalk.green('    ✅ Anthropic: configured (') + masked + ')');
    } else if (process.env.ANTHROPIC_API_KEY) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ Anthropic: (env var)'));
    } else {
      this.warnings.push('Anthropic not configured');
      console.log(chalk.cyan('│') + chalk.red('    ❌ Anthropic: not set'));
    }

    if (keys.openai || process.env.OPENAI_API_KEY) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ OpenAI: configured'));
    } else {
      console.log(chalk.cyan('│') + chalk.dim('    ⚪ OpenAI: not set'));
    }

    if (keys.gemini || process.env.GEMINI_API_KEY) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ Gemini: configured'));
    } else {
      console.log(chalk.cyan('│') + chalk.dim('    ⚪ Gemini: not set'));
    }

    if (keys.nvidia || process.env.NVIDIA_API_KEY) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ NVIDIA: configured'));
    } else {
      console.log(chalk.cyan('│') + chalk.dim('    ⚪ NVIDIA: not set'));
    }
  }

  async checkTools() {
    console.log(chalk.cyan('│') + chalk.bold('  Tools'));

    const tools = [
      { name: 'node', cmd: 'node --version', minVersion: '18' },
      { name: 'git', cmd: 'git --version', minVersion: null },
      { name: 'npm', cmd: 'npm --version', minVersion: null },
      { name: 'eslint', cmd: 'npx eslint --version', minVersion: null, optional: true },
      { name: 'prettier', cmd: 'npx prettier --version', minVersion: null, optional: true },
      { name: 'clipboard', cmd: process.platform === 'win32' ? 'clip /?' : 'which pbcopy', minVersion: null, optional: true }
    ];

    for (const tool of tools) {
      try {
        const output = execSync(tool.cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
        console.log(chalk.cyan('│') + chalk.green(`    ✅ ${tool.name}:`) + chalk.dim(` ${output.split('\n')[0]}`));
      } catch {
        if (tool.optional) {
          console.log(chalk.cyan('│') + chalk.yellow(`    ⚠️  ${tool.name}: not found (optional)`));
          this.warnings.push(`${tool.name} not found (optional)`);
        } else {
          console.log(chalk.cyan('│') + chalk.red(`    ❌ ${tool.name}: not found`));
          this.issues.push(`${tool.name} not found`);
        }
      }
    }
  }

  async checkConfig() {
    console.log(chalk.cyan('│') + chalk.bold('  Config'));

    const configPath = join(homedir(), '.red', 'config.json');
    if (existsSync(configPath)) {
      console.log(chalk.cyan('│') + chalk.green('    ✅ ~/.red/config.json'));
      try {
        const config = loadConfig();
        console.log(chalk.cyan('│') + chalk.green(`    ✅ Provider: ${config?.provider || 'anthropic'}`));
        console.log(chalk.cyan('│') + chalk.green(`    ✅ Model: ${config?.model || 'default'}`));
      } catch {
        this.issues.push('Config file corrupted');
        console.log(chalk.cyan('│') + chalk.red('    ❌ Config parse error'));
      }
    } else {
      this.warnings.push('Config file not found');
      console.log(chalk.cyan('│') + chalk.yellow('    ⚠️  ~/.red/config.json not found'));
    }
  }

  async checkMemory() {
    console.log(chalk.cyan('│') + chalk.bold('  Memory'));

    const memPath = join(homedir(), '.red', 'memory.json');
    if (existsSync(memPath)) {
      try {
        const mem = JSON.parse(readFileSync(memPath, 'utf-8'));
        const count = Object.keys(mem).length;
        if (count > 0) {
          console.log(chalk.cyan('│') + chalk.green(`    ✅ ${count} memory entries`));
        } else {
          console.log(chalk.cyan('│') + chalk.dim('    ⚪ Empty'));
        }
      } catch {
        console.log(chalk.cyan('│') + chalk.yellow('    ⚠️  Memory file corrupted'));
      }
    } else {
      console.log(chalk.cyan('│') + chalk.dim('    ⚪ No memory file'));
    }
  }

  async checkQueue() {
    console.log(chalk.cyan('│') + chalk.bold('  Queue'));

    const queue = loadQueue();
    const pending = queue.filter(t => t.status === 'pending').length;

    if (pending > 0) {
      console.log(chalk.cyan('│') + chalk.yellow(`    ⚠️  ${pending} pending tasks`));
    } else {
      console.log(chalk.cyan('│') + chalk.green('    ✅ No pending tasks'));
    }
  }

  async runFixes() {
    console.log(chalk.cyan('│') + chalk.bold('  Fixes'));

    const configPath = join(homedir(), '.red', 'config.json');
    const configDir = dirname(configPath);

    if (!existsSync(configDir)) {
      try {
        mkdirSync(configDir, { recursive: true });
        console.log(chalk.cyan('│') + chalk.green('    ✅ Created config directory'));
      } catch {
        console.log(chalk.cyan('│') + chalk.red('    ❌ Could not create config directory'));
      }
    }
  }
}

export function runDoctor(fix = false) {
  const doctor = new Doctor();
  return doctor.run(fix);
}

export default Doctor;
