import readline from 'readline';
import chalk from 'chalk';
import { CommandRegistry, COMMAND_CATEGORIES } from '../commands/registry.js';

export class SlashMenu {
  constructor() {
    this.registry = new CommandRegistry();
    this.commands = this.registry.getAll();
    this.filteredCommands = this.commands;
    this.selectedIndex = 0;
    this.query = '';
    this.visible = false;
    this.detailMode = false;
    this.searchIndex = 0;
    this.rl = null;
    this.inputCallback = null;
    this.originalRawMode = false;
  }

  show(onSelect) {
    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      console.log(chalk.yellow('\n  Interactive menu requires a terminal. Use commands directly.\n'));
      if (onSelect) onSelect('/');
      return;
    }

    this.visible = true;
    this.query = '/';
    this.filteredCommands = this.commands;
    this.selectedIndex = 0;
    this.detailMode = false;
    this.inputCallback = onSelect;

    this.originalRawMode = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.render();

    this.handleInput = this.handleKeypress.bind(this);
    process.stdin.on('keypress', this.handleInput);
  }

  hide() {
    if (!this.visible) return;

    this.visible = false;
    this.clearMenu();

    process.stdin.removeListener('keypress', this.handleInput);

    if (!this.originalRawMode) {
      process.stdin.setRawMode(false);
    }

    this.query = '';
  }

  handleKeypress(char, key) {
    if (this.detailMode) {
      if (key.name === 'escape' || key.name === 'return' || char === '?') {
        this.detailMode = false;
        this.render();
      }
      return;
    }

    // Handle special keys
    if (key.name === 'escape') {
      this.hide();
      return;
    }

    if (key.name === 'return') { // Enter
      this.executeSelected();
      return;
    }

    if (key.name === 'tab') {
      this.autocomplete();
      return;
    }

    if (key.name === 'up') {
      this.moveUp();
      return;
    }

    if (key.name === 'down') {
      this.moveDown();
      return;
    }

    if (key.name === 'pageup') {
      this.pageUp();
      return;
    }

    if (key.name === 'pagedown') {
      this.pageDown();
      return;
    }

    if (key.name === 'backspace') {
      if (this.query.length <= 1) {
        this.hide();
        return;
      }
      this.query = this.query.slice(0, -1);
      this.filter();
      return;
    }

    if (key.name === 'f1' || char === '?') {
      this.toggleDetail();
      return;
    }

    // Regular character input
    if (char && char.length === 1 && char !== '\t' && char !== '\n') {
      this.query += char;
      this.filter();
    }
  }

  filter() {
    const searchQuery = this.query.startsWith('/') ? this.query.slice(1) : this.query;
    this.filteredCommands = this.registry.search(searchQuery);
    this.selectedIndex = 0;
    this.searchIndex = 0;
    this.render();
  }

  moveUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.filteredCommands.length - 1;
    }
    this.render();
  }

  moveDown() {
    if (this.selectedIndex < this.filteredCommands.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    this.render();
  }

  pageUp() {
    this.selectedIndex = Math.max(0, this.selectedIndex - 10);
    this.render();
  }

  pageDown() {
    this.selectedIndex = Math.min(this.filteredCommands.length - 1, this.selectedIndex + 10);
    this.render();
  }

  autocomplete() {
    const selected = this.filteredCommands[this.selectedIndex];
    if (selected) {
      this.query = selected.name;
      this.filter();
      this.render();
    }
  }

  toggleDetail() {
    this.detailMode = !this.detailMode;
    this.render();
  }

  executeSelected() {
    const selected = this.filteredCommands[this.selectedIndex];
    if (selected) {
      this.hide();
      if (this.inputCallback) {
        this.inputCallback(selected.name);
      }
    }
  }

  render() {
    this.clearMenu();

    if (this.detailMode) {
      this.renderDetail();
      return;
    }

    const maxWidth = process.stdout.columns - 4 || 76;
    const menuWidth = Math.min(maxWidth, 80);

    // Input line
    console.log(chalk.bgBlack.white(` ${this.query}█ `.padEnd(menuWidth)));

    // Menu items
    const categoryGroups = {};
    for (const cmd of this.filteredCommands) {
      if (!categoryGroups[cmd.category]) {
        categoryGroups[cmd.category] = [];
      }
      categoryGroups[cmd.category].push(cmd);
    }

    let lineNum = 0;
    let displayed = 0;
    const maxDisplay = Math.min(15, this.filteredCommands.length);

    for (const [category, cmds] of Object.entries(categoryGroups)) {
      if (displayed >= maxDisplay) break;

      console.log(chalk.dim(' '.repeat(2) + category));

      for (const cmd of cmds) {
        if (displayed >= maxDisplay) break;

        const isSelected = displayed === this.selectedIndex;
        const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
        const icon = cmd.icon || '  ';
        const name = this.highlightMatch(cmd.name, this.query);
        const desc = cmd.description.substring(0, menuWidth - cmd.name.length - 10);

        if (isSelected) {
          console.log(chalk.bgCyan.black(`${prefix}${icon} ${name} `) + chalk.dim(desc));
        } else {
          console.log(`${prefix}${icon} ${chalk.cyan(name)} ${chalk.dim(desc)}`);
        }
        displayed++;
      }
    }

    // Footer
    console.log(chalk.dim('─'.repeat(menuWidth)));
    console.log(chalk.dim('[↑↓] Navigate  [Enter] Run  [Tab] Complete  [?] Details  [Esc] Close'));
  }

  renderDetail() {
    const selected = this.filteredCommands[this.selectedIndex];
    if (!selected) return;

    const maxWidth = process.stdout.columns - 4 || 76;
    const menuWidth = Math.min(maxWidth, 80);

    this.clearMenu();

    // Header
    console.log(chalk.bgRed.black(` ${selected.name} `.padEnd(menuWidth, '─')));

    // Content
    console.log(chalk.bold(`${selected.icon} ${selected.name.replace('/', '')}`));
    console.log();

    const desc = selected.longDescription || selected.description;
    const lines = this.wrapText(desc, menuWidth - 2);
    for (const line of lines) {
      console.log('  ' + line);
    }

    if (selected.aliases && selected.aliases.length > 0) {
      console.log();
      console.log(chalk.dim(`  Aliases: ${selected.aliases.join(', ')}`));
    }

    if (selected.args && selected.args.length > 0) {
      console.log();
      console.log(chalk.bold('  Arguments:'));
      for (const arg of selected.args) {
        const required = arg.required ? '(required)' : '(optional)';
        console.log(chalk.dim(`    ${arg.name} ${required} — ${arg.description}`));
      }
    }

    // Footer
    console.log(chalk.dim('─'.repeat(menuWidth)));
    console.log(chalk.dim('[Enter] Run  [Tab] Autocomplete  [Esc] Close'));
  }

  highlightMatch(text, query) {
    if (!query || query.length <= 1) return text;

    const searchTerm = query.toLowerCase().replace('/', '');
    const lowerText = text.toLowerCase();
    let result = '';
    let lastIdx = 0;

    for (let i = 0; i < searchTerm.length; i++) {
      const idx = lowerText.indexOf(searchTerm[i], lastIdx);
      if (idx === -1) continue;

      result += text.slice(lastIdx, idx);
      result += chalk.yellow.bold(text[idx]);
      lastIdx = idx + 1;
    }
    result += text.slice(lastIdx);

    return result || text;
  }

  wrapText(text, width) {
    const words = text.split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).length > width) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);

    return lines;
  }

  clearMenu() {
    // Clear just the menu area - move cursor to line start and clear
    // Using escape sequence to clear from cursor to end of screen
    process.stdout.write('\r\x1b[J');  // Clear from cursor to end of screen
  }
}

export default SlashMenu;