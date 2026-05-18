import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';

const LINE_WIDTH = 60;

function computeDiff(oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  const diff = [];
  let i = 0, j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      diff.push({ type: 'unchanged', oldLine: i + 1, newLine: j + 1, content: oldLines[i] });
      i++;
      j++;
    } else if (j < newLines.length && (!oldLines[i] || !oldLines.slice(i, i + 3).some(l => l === newLines[j]))) {
      const additions = [];
      while (j < newLines.length && (!oldLines[i] || oldLines[i] !== newLines[j])) {
        additions.push({ type: 'added', line: j + 1, content: newLines[j] });
        j++;
      }
      for (const a of additions) diff.push(a);
    } else if (i < oldLines.length) {
      const deletions = [];
      while (i < oldLines.length && (!newLines[j] || newLines[j] !== oldLines[i])) {
        deletions.push({ type: 'removed', line: i + 1, content: oldLines[i] });
        i++;
      }
      for (const d of deletions) diff.push(d);
    }
  }

  return diff;
}

export class DiffReview {
  constructor(options = {}) {
    this.mode = options.mode || 'auto';
    this.autoThreshold = options.autoThreshold || 50;
    this.pendingChanges = [];
    this.acceptedFiles = new Set();
    this.rejectedFiles = new Set();
  }

  shouldReview(path, oldContent, newContent) {
    if (this.mode === 'never') return false;
    if (this.mode === 'always') return true;

    const isNewFile = !oldContent;
    if (isNewFile && this.mode === 'auto') return false;

    const linesChanged = Math.abs((newContent?.split('\n').length || 0) - (oldContent?.split('\n').length || 0));
    return linesChanged > this.autoThreshold;
  }

  async reviewChange(path, newContent, isNewFile = false) {
    let oldContent = '';

    if (!isNewFile) {
      try {
        oldContent = readFileSync(path, 'utf-8');
      } catch {
        isNewFile = true;
      }
    }

    if (!this.shouldReview(path, oldContent, newContent)) {
      return { accepted: true, reviewed: false };
    }

    const diff = computeDiff(oldContent, newContent);
    const display = this.displayDiff(path, diff, isNewFile);

    console.log(display);

    return new Promise((resolve) => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question(chalk.cyan('[a]ccept  [r]eject  [e]dit  [A]ccept all  [R]eject all: '), (answer) => {
        readline.close();
        const a = answer.toLowerCase().charAt(0);

        if (a === 'a') {
          this.acceptedFiles.add(path);
          resolve({ accepted: true, reviewed: true });
        } else if (a === 'r') {
          this.rejectedFiles.add(path);
          resolve({ accepted: false, reviewed: true });
        } else if (a === 'e') {
          resolve({ accepted: false, reviewed: true, edit: true });
        } else if (a === 'A') {
          this.acceptedFiles.add(path);
          resolve({ accepted: true, reviewed: true, acceptAll: true });
        } else if (a === 'R') {
          this.rejectedFiles.add(path);
          resolve({ accepted: false, reviewed: true, rejectAll: true });
        } else {
          resolve(this.reviewChange(path, newContent, isNewFile));
        }
      });
    });
  }

  displayDiff(path, diff, isNewFile) {
    const lines = [];
    const width = Math.min(LINE_WIDTH, process.stdout.columns - 4 || 60);

    lines.push(chalk.cyan(`\n╭─ 📝 File Change: ${path} ${'─'.repeat(width - path.length - 15)}╮`));
    lines.push(chalk.cyan('│'));

    const displayLines = diff.slice(0, 30);

    for (const d of displayLines) {
      if (d.type === 'unchanged') {
        lines.push(chalk.cyan(`│`) + chalk.dim(`   ${String(d.oldLine).padStart(3)} │ ${(d.content || '').substring(0, width - 15)}`));
      } else if (d.type === 'removed') {
        lines.push(chalk.cyan('│') + chalk.red(`   ${String(d.oldLine).padStart(3)} │ ${(d.content || '').substring(0, width - 15)}`));
      } else if (d.type === 'added') {
        lines.push(chalk.cyan('│') + chalk.green(`   ${String(d.newLine).padStart(3)} + │ ${(d.content || '').substring(0, width - 15)}`));
      }
    }

    if (diff.length > 30) {
      lines.push(chalk.cyan('│') + chalk.dim(`   ... ${diff.length - 30} more lines`));
    }

    lines.push(chalk.cyan('│'));
    lines.push(chalk.cyan('│') + chalk.cyan(' [a] Accept  [r] Reject  [e] Edit  [A] Accept all  [R] Reject all'));
    lines.push(chalk.cyan('╰') + '─'.repeat(width - 1) + '╯');

    return lines.join('\n');
  }

  reviewEdit(oldContent, newContent) {
    const diff = computeDiff(oldContent, newContent);
    return this.displayDiff('edit', diff, false);
  }

  isAccepted(path) {
    return this.acceptedFiles.has(path);
  }

  isRejected(path) {
    return this.rejectedFiles.has(path);
  }

  reset() {
    this.acceptedFiles.clear();
    this.rejectedFiles.clear();
  }

  setMode(mode) {
    this.mode = mode;
  }
}

export function createDiffReview(options = {}) {
  return new DiffReview(options);
}

export default DiffReview;
