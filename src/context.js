import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

const PROJECT_CONFIGS = {
  'package.json': { type: 'Node.js', framework: null },
  'go.mod': { type: 'Go', framework: null },
  'Cargo.toml': { type: 'Rust', framework: null },
  'pyproject.toml': { type: 'Python', framework: null },
  'requirements.txt': { type: 'Python', framework: null },
  'Gemfile': { type: 'Ruby', framework: null },
  'pom.xml': { type: 'Java', framework: null },
  'build.gradle': { type: 'Java', framework: null },
  'composer.json': { type: 'PHP', framework: null },
  '*.csproj': { type: 'C#', framework: null }
};

const FRAMEWORKS = {
  'package.json': {
    'next': 'Next.js',
    'react': 'React',
    'vue': 'Vue.js',
    'express': 'Express',
    'fastify': 'Fastify',
    'nest': 'NestJS',
    'nuxt': 'Nuxt',
    'svelte': 'Svelte',
    'vite': 'Vite'
  },
  'requirements.txt': {
    'django': 'Django',
    'flask': 'Flask',
    'fastapi': 'FastAPI'
  }
};

const TEST_RUNNERS = {
  'jest.config.js': 'jest',
  'vitest.config.js': 'vitest',
  'mocha.opts': 'mocha',
  'pytest.ini': 'pytest',
  'conftest.py': 'pytest',
  'go.mod': 'go test',
  'Cargo.toml': 'cargo test'
};

const LINT_FORMATTERS = {
  'node_modules/.bin/eslint': 'eslint',
  'node_modules/.bin/prettier': 'prettier',
  'node_modules/.bin/black': 'black',
  'node_modules/.bin/rustfmt': 'rustfmt',
  'node_modules/.bin/ruff': 'ruff'
};

const PACKAGE_MANAGERS = {
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'package-lock.json': 'npm',
  'poetry.lock': 'poetry',
  'Pipfile.lock': 'pipenv'
};

export class ProjectContext {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    this.info = this.detect();
  }

  detect() {
    const context = {
      type: 'Unknown',
      framework: null,
      testRunner: null,
      packageManager: null,
      linters: [],
      formatters: [],
      git: this.getGitInfo(),
      files: this.countFiles()
    };

    for (const [file, config] of Object.entries(PROJECT_CONFIGS)) {
      if (file.includes('*')) continue;
      if (existsSync(join(this.cwd, file))) {
        context.type = config.type;
        break;
      }
    }

    this.detectFramework(context);
    this.detectTestRunner(context);
    this.detectPackageManager(context);
    this.detectLintersAndFormatters(context);

    return context;
  }

  detectFramework(context) {
    const pkgPath = join(this.cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, label] of Object.entries(FRAMEWORKS['package.json'] || {})) {
          if (deps[name]) {
            context.framework = label;
            break;
          }
        }

        if (!context.framework && pkg.scripts?.start) {
          if (pkg.scripts.start.includes('next')) context.framework = 'Next.js';
          else if (pkg.scripts.start.includes('react')) context.framework = 'React';
          else if (pkg.scripts.start.includes('express')) context.framework = 'Express';
        }
      } catch {}
    }

    const reqPath = join(this.cwd, 'requirements.txt');
    if (existsSync(reqPath)) {
      try {
        const content = readFileSync(reqPath, 'utf-8');
        for (const [name, label] of Object.entries(FRAMEWORKS['requirements.txt'] || {})) {
          if (content.includes(name)) {
            context.framework = label;
            break;
          }
        }
      } catch {}
    }
  }

  detectTestRunner(context) {
    for (const [file, runner] of Object.entries(TEST_RUNNERS)) {
      if (existsSync(join(this.cwd, file))) {
        context.testRunner = runner;
        break;
      }
    }

    if (!context.testRunner) {
      try {
        const output = execSync('npm test -- --list 2>&1', { cwd: this.cwd, encoding: 'utf-8', timeout: 5000 });
        // Cross-platform: split into lines and take first 5
        const lines = output.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
        if (lines.includes('jest')) context.testRunner = 'jest';
        else if (lines.includes('vitest')) context.testRunner = 'vitest';
      } catch {}
    }
  }

  detectPackageManager(context) {
    for (const [file, pm] of Object.entries(PACKAGE_MANAGERS)) {
      if (existsSync(join(this.cwd, file))) {
        context.packageManager = pm;
        break;
      }
    }

    if (!context.packageManager) {
      try {
        execSync('npm --version', { stdio: 'ignore' });
        context.packageManager = 'npm';
      } catch {}
    }
  }

  detectLintersAndFormatters(context) {
    for (const [bin, tool] of Object.entries(LINT_FORMATTERS)) {
      try {
        execSync(bin + ' --version', { stdio: 'ignore', timeout: 2000 });
        if (['eslint', 'prettier'].includes(tool)) context.linters.push(tool);
        else context.formatters.push(tool);
      } catch {}
    }

    if (existsSync(join(this.cwd, '.eslintrc'))) context.linters.push('eslint');
    if (existsSync(join(this.cwd, '.prettierrc'))) context.formatters.push('prettier');
  }

  getGitInfo() {
    try {
      // Cross-platform: suppress stderr (2>NUL on Windows, 2>/dev/null on Unix)
      const isWindows = process.platform === 'win32';
      const devNull = isWindows ? '2>NUL' : '2>/dev/null';

      const branch = execSync(`git branch --show-current ${devNull}`, { encoding: 'utf-8' }).trim();
      const status = execSync(`git status --porcelain ${devNull}`, { encoding: 'utf-8' });
      const uncommitted = status.split('\n').filter(Boolean).length;

      return {
        branch,
        hasUncommitted: uncommitted > 0,
        uncommittedCount: uncommitted
      };
    } catch {
      return { branch: null, hasUncommitted: false, uncommittedCount: 0 };
    }
  }

  countFiles() {
    try {
      // Cross-platform file counting
      const isWindows = process.platform === 'win32';
      let output;

      if (isWindows) {
        // Windows: use simpler PowerShell command with proper escaping
        // Use -Command and escape properly - count files manually
        output = execSync(
          'powershell -Command "Get-ChildItem -Recurse -File -Exclude node_modules,.git,dist,build | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Count"',
          { cwd: this.cwd, encoding: 'utf-8', timeout: 10000, shell: true }
        );
      } else {
        // Unix: use find with wc
        output = execSync(
          'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" | wc -l',
          { cwd: this.cwd, encoding: 'utf-8' }
        );
      }

      return parseInt(output.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  toPrompt() {
    const lines = [chalk.bold('Project Context:')];

    lines.push(chalk.dim(`Type: ${this.info.type}`));
    if (this.info.framework) lines.push(chalk.dim(`Framework: ${this.info.framework}`));
    if (this.info.testRunner) lines.push(chalk.dim(`Test runner: ${this.info.testRunner}`));
    if (this.info.packageManager) lines.push(chalk.dim(`Package manager: ${this.info.packageManager}`));

    if (this.info.git.branch) {
      let gitInfo = `Git: ${this.info.git.branch}`;
      if (this.info.git.hasUncommitted) {
        gitInfo += `, ${this.info.git.uncommittedCount} uncommitted`;
      }
      lines.push(chalk.dim(gitInfo));
    }

    if (this.info.linters.length > 0) {
      lines.push(chalk.dim(`Linters: ${this.info.linters.join(', ')}`));
    }
    if (this.info.formatters.length > 0) {
      lines.push(chalk.dim(`Formatters: ${this.info.formatters.join(', ')}`));
    }

    lines.push(chalk.dim(`Files: ${this.info.files}`));

    return lines.join('\n');
  }

  getToolDefaults() {
    const defaults = { command: 'node' };

    switch (this.info.type) {
      case 'Python':
        defaults.command = 'python3';
        defaults.testCmd = 'pytest';
        break;
      case 'Go':
        defaults.command = 'go';
        defaults.testCmd = 'go test';
        break;
      case 'Rust':
        defaults.command = 'cargo';
        defaults.testCmd = 'cargo test';
        break;
      case 'Ruby':
        defaults.command = 'bundle';
        defaults.testCmd = 'rspec';
        break;
      case 'Java':
        defaults.command = 'mvn';
        defaults.testCmd = 'mvn test';
        break;
    }

    if (this.info.packageManager === 'yarn') defaults.pm = 'yarn';
    else if (this.info.packageManager === 'pnpm') defaults.pm = 'pnpm';
    else defaults.pm = 'npm';

    return defaults;
  }
}

export default ProjectContext;