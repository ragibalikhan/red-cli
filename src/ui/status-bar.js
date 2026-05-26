import chalk from 'chalk';
import readline from 'readline';

export class StatusBar {
  constructor() {
    this.model = 'claude-sonnet-4';
    this.mode = 'recon';
    this.tokens = { used: 0, max: 8000 };
    this.tools = 0;
    this.path = '';
    this.thinking = false;
    this.securityMode = false;
  }

  update(options = {}) {
    if (options.model !== undefined) this.model = options.model;
    if (options.mode !== undefined) this.mode = options.mode;
    if (options.tokens !== undefined) this.tokens = options.tokens;
    if (options.tools !== undefined) this.tools = options.tools;
    if (options.path !== undefined) this.path = options.path;
    if (options.thinking !== undefined) this.thinking = options.thinking;
    if (options.securityMode !== undefined) this.securityMode = options.securityMode;
  }

  render() {
    const maxWidth = process.stdout.columns || 80;

    const parts = [];

    if (this.securityMode) {
      parts.push(chalk.red('🔴 security'));
    } else {
      parts.push(chalk.red('red'));
    }

    parts.push(chalk.dim(this.model));
    parts.push(chalk.dim(`${this.mode} mode`));

    const tokenPercent = Math.round((this.tokens.used / this.tokens.max) * 100);
    parts.push(chalk.dim(`${this.tokens.used}/${this.tokens.max} tokens`));

    if (this.thinking) {
      parts.push(chalk.cyan('⚙️ thinking...'));
    } else {
      parts.push(chalk.dim(`${this.tools} tools`));
    }

    if (this.path) {
      parts.push(chalk.dim(this.path));
    }

    const bar = parts.join(chalk.dim(' │ '));

    // Pad to full width
    const padded = bar.padEnd(maxWidth);

    return chalk.bgBlack.white(padded);
  }

  show() {
    this.write(this.render());
  }

  write(content) {
    // Save cursor position
    process.stdout.write('\x1b7');
    // Move to bottom
    process.stdout.write(`\x1b[${process.stdout.rows};1H`);
    // Clear line
    process.stdout.write('\x1b[2K');
    // Write status
    process.stdout.write(content);
    // Restore cursor
    process.stdout.write('\x1b8');
  }

  clear() {
    process.stdout.write('\x1b[2K');
  }
}

export default new StatusBar();