import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const GLOBAL_MEMORY_PATH = join(homedir(), '.red', 'memory.json');
const PROJECT_MEMORY_PATH = join(process.cwd(), '.red', 'project-memory.json');

function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadJson(path, default_ = {}) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch {}
  return default_;
}

function saveJson(path, data) {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export class Memory {
  constructor() {
    this.global = loadJson(GLOBAL_MEMORY_PATH);
    this.project = loadJson(PROJECT_MEMORY_PATH, null);
    this.loadProjectMemory();
  }

  loadProjectMemory() {
    if (existsSync(PROJECT_MEMORY_PATH)) {
      this.project = loadJson(PROJECT_MEMORY_PATH);
    } else {
      this.project = null;
    }
  }

  remember(key, value) {
    this.global[key] = value;
    saveJson(GLOBAL_MEMORY_PATH, this.global);
    console.log(chalk.green(`✓ Remembered: ${key}`));
  }

  recall(key) {
    if (key) {
      const value = this.global[key] || this.project?.[key];
      return value;
    }
    return { global: this.global, project: this.project };
  }

  forget(key) {
    if (this.global[key]) {
      delete this.global[key];
      saveJson(GLOBAL_MEMORY_PATH, this.global);
      console.log(chalk.green(`✓ Forgot: ${key}`));
    } else if (this.project?.[key]) {
      delete this.project[key];
      saveJson(PROJECT_MEMORY_PATH, this.project);
      console.log(chalk.green(`✓ Forgot project memory: ${key}`));
    } else {
      console.log(chalk.yellow(`Key "${key}" not found.`));
    }
  }

  clearGlobal() {
    this.global = {};
    saveJson(GLOBAL_MEMORY_PATH, this.global);
    console.log(chalk.green('✓ Cleared all global memories.'));
  }

  setProjectMemory(key, value) {
    if (!this.project) {
      this.project = {};
      ensureDir(PROJECT_MEMORY_PATH);
    }
    this.project[key] = value;
    saveJson(PROJECT_MEMORY_PATH, this.project);
    console.log(chalk.green(`✓ Project memory set: ${key}`));
  }

  getProjectMemory() {
    return this.project || {};
  }

  clearProject() {
    if (this.project) {
      this.project = {};
      saveJson(PROJECT_MEMORY_PATH, {});
      console.log(chalk.green('✓ Cleared project memories.'));
    }
  }

  toPrompt() {
    const parts = [];

    const keysToInclude = [
      'preferred_language',
      'preferred_framework',
      'coding_style',
      'package_manager',
      'formatting_preference'
    ];

    const relevant = {};
    for (const key of keysToInclude) {
      if (this.global[key]) relevant[key] = this.global[key];
    }

    if (Object.keys(relevant).length > 0) {
      parts.push(chalk.bold('\nYour memory about this user:'));
      for (const [key, value] of Object.entries(relevant)) {
        parts.push(chalk.dim(`  ${key}: ${value}`));
      }
    }

    if (this.project && Object.keys(this.project).length > 0) {
      parts.push(chalk.bold('\nYour memory about this project:'));
      for (const [key, value] of Object.entries(this.project)) {
        parts.push(chalk.dim(`  ${key}: ${value}`));
      }
    }

    return parts.join('\n');
  }

  list() {
    console.log(chalk.bold('\n📚 Global Memory'));
    if (Object.keys(this.global).length === 0) {
      console.log(chalk.dim('  (empty)'));
    } else {
      for (const [key, value] of Object.entries(this.global)) {
        console.log(`  ${chalk.cyan(key)}: ${value}`);
      }
    }

    if (this.project) {
      console.log(chalk.bold('\n📁 Project Memory'));
      for (const [key, value] of Object.entries(this.project)) {
        console.log(`  ${chalk.yellow(key)}: ${value}`);
      }
    }
    console.log();
  }

  autoLearn(code) {
    const patterns = [
      { regex: /import.*from\s+['"](\w+)['"]/, type: 'preferred_language' },
      { regex: /const (\w+)\s*=/, type: 'coding_style' },
      { regex: /async\s+function|await\s+/, type: 'async_preference' }
    ];

    for (const p of patterns) {
      if (p.regex.test(code)) {
        this.learnFromCode(p.type, code);
      }
    }
  }

  learnFromCode(type, code) {
    if (type === 'async_preference' && code.includes('await')) {
      this.remember('async_style', 'uses async/await');
    }
  }
}

export function createMemory() {
  return new Memory();
}

export default Memory;