import chalk from 'chalk';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

export class SessionSelector {
  constructor(sessionsPath) {
    this.sessionsPath = sessionsPath;
    this.sessions = [];
    this.selectedIndex = 0;
    this._originalRawMode = false;
    this.handleKey = null;
  }

  async loadSessions() {
    if (!existsSync(this.sessionsPath)) return [];

    const files = readdirSync(this.sessionsPath)
      .filter(f => f.endsWith('.md') || f.endsWith('.json'))
      .sort((a, b) => {
        // Sort by modification time, newest first
        try {
          const sa = statSync(join(this.sessionsPath, a));
          const sb = statSync(join(this.sessionsPath, b));
          return sb.mtime.getTime() - sa.mtime.getTime();
        } catch {
          return b.localeCompare(a);
        }
      });

    return files.map(f => {
      const p = join(this.sessionsPath, f);
      const stat = statSync(p);
      let preview = '';
      let messageCount = 0;

      try {
        const content = readFileSync(p, 'utf-8');

        if (f.endsWith('.md')) {
          // Extract first non-header line as preview
          const lines = content.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
              preview = trimmed.substring(0, 80);
              break;
            }
          }
          // Count message blocks (looks for role markers)
          messageCount = (content.match(/\*\*\w+:\*\*/g) || []).length / 2;
        } else {
          // JSON format
          try {
            const data = JSON.parse(content);
            messageCount = Array.isArray(data) ? data.length : 0;
            if (Array.isArray(data) && data.length > 0) {
              const last = data[data.length - 1];
              if (last.content && typeof last.content === 'string') {
                preview = last.content.substring(0, 80);
              }
            }
          } catch {}
        }
      } catch {}

      return {
        name: f,
        path: p,
        date: new Date(stat.mtime),
        size: stat.size,
        preview,
        messageCount
      };
    });
  }

  async show() {
    this.sessions = await this.loadSessions();

    if (this.sessions.length === 0) {
      return null;
    }

    // Save original raw mode state
    this._originalRawMode = process.stdin.isRaw;

    // Enter raw mode for keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    }

    this.render();

    return new Promise((resolve) => {
      this.handleKey = (char, key) => {
        switch (key.name) {
          case 'up':
            this.selectedIndex = this.selectedIndex > 0
              ? this.selectedIndex - 1
              : this.sessions.length - 1;
            this.render();
            break;
          case 'down':
            this.selectedIndex = this.selectedIndex < this.sessions.length - 1
              ? this.selectedIndex + 1
              : 0;
            this.render();
            break;
          case 'pageup':
            this.selectedIndex = Math.max(0, this.selectedIndex - 10);
            this.render();
            break;
          case 'pagedown':
            this.selectedIndex = Math.min(this.sessions.length - 1, this.selectedIndex + 10);
            this.render();
            break;
          case 'return': // Enter - select
            this.cleanup();
            const selected = this.sessions[this.selectedIndex];
            resolve(selected);
            return;
          case 'escape':
          case 'ctrl_c':
            this.cleanup();
            resolve(null);
            return;
          default:
            // Number keys for quick selection (1-9)
            if (char && char >= '1' && char <= '9') {
              const idx = parseInt(char) - 1;
              if (idx < this.sessions.length) {
                this.selectedIndex = idx;
                this.cleanup();
                const selected = this.sessions[this.selectedIndex];
                resolve(selected);
              }
            }
            break;
        }
      };

      process.stdin.on('keypress', this.handleKey);
    });
  }

  cleanup() {
    if (this.handleKey) {
      process.stdin.removeListener('keypress', this.handleKey);
      this.handleKey = null;
    }
    if (!this._originalRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    // Pause stdin to let the main REPL recover properly
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }
    this.clearMenu();
  }

  render() {
    this.clearMenu();

    const maxWidth = process.stdout.columns || 80;
    const menuWidth = Math.min(75, maxWidth - 5);

    // Header
    console.log(chalk.bold('\n  📂 Saved Sessions'));
    console.log(chalk.dim('  ' + '─'.repeat(menuWidth - 2)));
    console.log(chalk.dim(`  Use ↑↓ to navigate, Enter to select, Esc to cancel`));
    console.log();

    // Sessions list
    const visibleCount = Math.min(12, this.sessions.length);
    const startIdx = Math.max(0, this.selectedIndex - Math.floor(visibleCount / 2));
    const endIdx = Math.min(this.sessions.length, startIdx + visibleCount);

    for (let i = startIdx; i < endIdx; i++) {
      const s = this.sessions[i];
      const isSelected = i === this.selectedIndex;

      const prefix = isSelected ? chalk.cyan('❯ ') : '   ';
      const name = isSelected ? chalk.bold.cyan(s.name) : chalk.white(s.name);

      // Date and size
      const dateStr = s.date.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      const sizeStr = Math.round(s.size / 1024) + 'KB';
      const meta = chalk.dim(`${dateStr} • ${sizeStr}`);

      // Message count
      const msgCount = s.messageCount > 0 ? chalk.dim(` • ${s.messageCount} msgs`) : '';

      console.log(`${prefix}${name}   ${meta}${msgCount}`);

      // Show preview for selected session
      if (isSelected && s.preview) {
        console.log(chalk.dim(`   └─ ${s.preview}`));
      }
    }

    console.log();
    console.log(chalk.dim('  ' + '─'.repeat(menuWidth - 2)));

    // Show selected preview in detail
    const sel = this.sessions[this.selectedIndex];
    if (sel) {
      console.log();
      console.log(chalk.dim(`  Selected: ${chalk.white(sel.name)}`));
      if (sel.preview) {
        console.log(chalk.dim(`  Preview: ${sel.preview}`));
      }
    }
  }

  clearMenu() {
    // Clear from current position to end of screen
    process.stdout.write('\r\x1b[J');
  }
}

export default SessionSelector;