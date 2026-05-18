import readline from 'readline';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const INPUT_HISTORY_PATH = join(homedir(), '.red', 'input-history');
const MAX_INPUT_HISTORY = 1000;

export class InputHandler {
  constructor() {
    this.rl = null;
    this.history = [];
    this.ghostSuggestion = '';
    this.multiLineMode = false;
    this.multiLineBuffer = [];
    this.syntaxColors = this.initSyntaxColors();
    this.loadHistory();
  }

  initSyntaxColors() {
    return {
      command: chalk.cyan,
      path: chalk.yellow,
      url: chalk.blue.underline,
      string: chalk.green,
      number: chalk.magenta
    };
  }

  loadHistory() {
    try {
      if (existsSync(INPUT_HISTORY_PATH)) {
        this.history = JSON.parse(readFileSync(INPUT_HISTORY_PATH, 'utf-8'));
      }
    } catch {
      this.history = [];
    }
  }

  saveHistory() {
    try {
      const dir = dirname(INPUT_HISTORY_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(INPUT_HISTORY_PATH, JSON.stringify(this.history.slice(-MAX_INPUT_HISTORY)));
    } catch {}
  }

  addToHistory(line) {
    if (line && line.trim() && this.history[this.history.length - 1] !== line) {
      this.history.push(line);
      this.saveHistory();
    }
  }

  searchHistory(query) {
    if (!query) return [];
    const lower = query.toLowerCase();
    return this.history.filter(h => h.toLowerCase().includes(lower)).slice(-20).reverse();
  }

  getGhostSuggestion(input) {
    if (!input || input.length < 2) return '';

    const recent = this.history.slice(-10).reverse();
    for (const h of recent) {
      if (h.toLowerCase().startsWith(input.toLowerCase()) && h !== input) {
        return h.slice(input.length);
      }
    }
    return '';
  }

  highlightSyntax(input) {
    // Highlight /commands
    let highlighted = input.replace(/(\/[a-zA-Z][a-zA-Z0-9]*)/g,
      this.syntaxColors.command('$1'));

    // Highlight file paths (basic)
    highlighted = highlighted.replace(/([a-zA-Z]:[\\\/]|[.][\\\/]?)[a-zA-Z0-9_\\\/.-]+/g,
      this.syntaxColors.path('$1'));

    // Highlight URLs
    highlighted = highlighted.replace(/(https?:\/\/[^\s]+)/g,
      this.syntaxColors.url('$1'));

    // Highlight quoted strings
    highlighted = highlighted.replace(/(["'])(.*?)\1/g,
      this.syntaxColors.string('$1$2$1'));

    // Highlight numbers
    highlighted = highlighted.replace(/\b(\d+)\b/g,
      this.syntaxColors.number('$1'));

    return highlighted;
  }

  detectPaste(text) {
    const lines = text.split('\n');
    return lines.length > 3;
  }

  async promptMultiLine(initialValue = '') {
    this.multiLineMode = true;
    this.multiLineBuffer = initialValue ? [initialValue] : [];

    console.log(chalk.dim('  (Enter to add new line, Ctrl+D to finish, Esc to cancel)'));

    return new Promise((resolve) => {
      const multiRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const askLine = () => {
        multiRl.question(chalk.cyan('  > '), (line) => {
          if (line === '' || line === '\x04') {
            multiRl.close();
            this.multiLineMode = false;
            resolve(this.multiLineBuffer.join('\n'));
          } else {
            this.multiLineBuffer.push(line);
            askLine();
          }
        });
      };

      askLine();
    });
  }
}

export default InputHandler;