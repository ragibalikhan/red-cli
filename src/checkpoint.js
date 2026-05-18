import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { createInterface } from 'readline';

const CHECKPOINTS_DIR = join(homedir(), '.red', 'checkpoints');
const INDEX_PATH = join(CHECKPOINTS_DIR, 'index.json');

function ensureCheckpointsDir() {
  if (!existsSync(CHECKPOINTS_DIR)) {
    mkdirSync(CHECKPOINTS_DIR, { recursive: true });
  }
}

function loadIndex() {
  try {
    if (existsSync(INDEX_PATH)) {
      return JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveIndex(index) {
  ensureCheckpointsDir();
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

function generateId() {
  return Date.now().toString(36);
}

export class CheckpointManager {
  constructor() {
    this.index = loadIndex();
  }

  async create(description = 'Manual checkpoint') {
    ensureCheckpointsDir();

    const id = generateId();
    const timestamp = new Date().toISOString();
    const checkpointDir = join(CHECKPOINTS_DIR, id);

    mkdirSync(checkpointDir, { recursive: true });

    let gitStashSaved = false;
    try {
      // Cross-platform: suppress stderr with 2>NUL on Windows, 2>/dev/null on Unix
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'git stash push -m "red-cli checkpoint" 2>NUL' : 'git stash push -m "red-cli checkpoint" 2>/dev/null';
      execSync(cmd, { stdio: 'ignore' });
      gitStashSaved = true;
    } catch {}

    const files = this.collectModifiedFiles();

    const checkpoint = {
      id,
      timestamp,
      description,
      files,
      gitStash: gitStashSaved,
      workingDirectory: process.cwd()
    };

    this.index.push(checkpoint);
    saveIndex(this.index);

    console.log(chalk.green(`✓ Checkpoint created: ${id}`));
    return checkpoint;
  }

  collectModifiedFiles() {
    const files = [];
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8' });
      const lines = status.split('\n').filter(Boolean);
      for (const line of lines) {
        const file = line.substring(3);
        if (file && !file.includes('->')) {
          files.push(file);
        }
      }
    } catch {}
    return files;
  }

  list() {
    if (this.index.length === 0) {
      console.log(chalk.dim('No checkpoints found.'));
      return;
    }

    console.log(chalk.bold('\n📸 Checkpoints\n'));
    for (let i = this.index.length - 1; i >= 0; i--) {
      const cp = this.index[i];
      const date = new Date(cp.timestamp).toLocaleString();
      console.log(`  ${chalk.cyan(cp.id)} - ${date}`);
      console.log(chalk.dim(`     ${cp.description}`));
      console.log(chalk.dim(`     Files: ${cp.files.length}, Git stash: ${cp.gitStash ? 'yes' : 'no'}`));
      console.log();
    }
  }

  async previewRollback(targetId) {
    const checkpoint = this.index.find(cp => cp.id === targetId);
    if (!checkpoint) {
      console.log(chalk.red('Checkpoint not found.'));
      return null;
    }

    console.log(chalk.cyan(`
╭─ 🔄 Rollback Preview ─${'─'.repeat(40)}╮
│  Rolling back to: ${new Date(checkpoint.timestamp).toLocaleString()}
│  Description: ${checkpoint.description}
│
│  Files to restore (${checkpoint.files.length}):
│
    `));

    for (const file of checkpoint.files.slice(0, 10)) {
      console.log(chalk.yellow(`   ~ ${file}`));
    }
    if (checkpoint.files.length > 10) {
      console.log(chalk.dim(`   ... and ${checkpoint.files.length - 10} more`));
    }

    console.log(chalk.cyan(`
│
│  [y] Confirm rollback  [n] Cancel  [d] View diff
╰${'─'.repeat(56)}╯
    `));

    return checkpoint;
  }

  async rollback(targetId) {
    const checkpoint = await this.previewRollback(targetId);
    if (!checkpoint) return false;

    const confirm = await this.promptConfirmation('Confirm rollback?');
    if (!confirm) {
      console.log(chalk.yellow('Rollback cancelled.'));
      return false;
    }

    try {
      const isWindows = process.platform === 'win32';
      const devNull = isWindows ? '2>NUL' : '2>/dev/null';

      if (checkpoint.gitStash) {
        execSync(`git stash pop ${devNull}`, { stdio: 'ignore' });
      }

      const currentFiles = this.collectModifiedFiles();
      for (const file of currentFiles) {
        try {
          execSync(`git checkout -- "${file}"`, { stdio: 'ignore' });
        } catch {}
      }

      this.index = this.index.filter(cp => cp.id !== targetId);
      saveIndex(this.index);

      console.log(chalk.green(`✓ Rolled back to checkpoint: ${targetId}`));
      return true;

    } catch (err) {
      console.log(chalk.red(`Rollback failed: ${err.message}`));
      return false;
    }
  }

  rollbackLatest() {
    if (this.index.length === 0) {
      console.log(chalk.yellow('No checkpoints to rollback to.'));
      return;
    }

    const latest = this.index[this.index.length - 1];
    this.rollback(latest.id);
  }

  clear() {
    const count = this.index.length;
    this.index = [];
    saveIndex(this.index);

    try {
      rmSync(CHECKPOINTS_DIR, { recursive: true, force: true });
    } catch {}

    console.log(chalk.green(`Cleared ${count} checkpoints.`));
  }

  promptConfirmation(prompt) {
    return new Promise((resolve) => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question(chalk.cyan(`${prompt} [y/n]: `), (answer) => {
        readline.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }
}

export default CheckpointManager;
