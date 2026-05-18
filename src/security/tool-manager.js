import { execSync, exec } from 'child_process';
import { existsSync } from 'fs';
import { platform, homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

// Detect platform
export const OS = {
  WINDOWS: platform() === 'win32',
  LINUX: platform() === 'linux',
  MAC: platform() === 'darwin',
  KALI: false,
  UBUNTU: false
};

// Check Linux distro
try {
  if (OS.LINUX) {
    const osRelease = execSync('cat /etc/os-release', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    OS.KALI = osRelease.includes('Kali');
    OS.UBUNTU = osRelease.includes('Ubuntu');
  }
} catch {}

// Tool definitions with install commands for each platform
const TOOL_DEFINITIONS = {
  // Recon tools
  nmap: {
    name: 'nmap',
    desc: 'Network port scanner',
    apt: 'nmap',
    brew: 'nmap',
    choco: 'nmap',
    npm: null
  },
  whatweb: {
    name: 'whatweb',
    desc: 'Web technology detector',
    apt: 'whatweb',
    brew: 'whatweb',
    choco: null,
    npm: null
  },
  ffuf: {
    name: 'ffuf',
    desc: 'Web directory fuzzer',
    apt: null, // needs go or manual install
    brew: 'ffuf',
    choco: null,
    npm: null,
    goInstall: 'go install github.com/ffuf/ffuf@latest'
  },
  dirb: {
    name: 'dirb',
    desc: 'Web directory scanner',
    apt: 'dirb',
    brew: null,
    choco: null,
    npm: null
  },
  gobuster: {
    name: 'gobuster',
    desc: 'Directory/file busting',
    apt: null,
    brew: 'gobuster',
    choco: null,
    npm: null,
    goInstall: 'go install github.com/OJ/gobuster/v3@latest'
  },
  nikto: {
    name: 'nikto',
    desc: 'Web vulnerability scanner',
    apt: 'nikto',
    brew: 'nikto',
    choco: null,
    npm: null
  },

  // Exploitation tools
  sqlmap: {
    name: 'sqlmap',
    desc: 'SQL injection tool',
    apt: 'sqlmap',
    brew: 'sqlmap',
    choco: 'sqlmap',
    npm: null
  },
  hydra: {
    name: 'hydra',
    desc: 'Password brute forcer',
    apt: 'hydra',
    brew: 'hydra',
    choco: null,
    npm: null
  },
  'redis-cli': {
    name: 'redis-cli',
    desc: 'Redis client',
    apt: 'redis-tools',
    brew: null,
    choco: null,
    npm: null
  },

  // Network tools
  curl: {
    name: 'curl',
    desc: 'HTTP client',
    apt: 'curl',
    brew: 'curl',
    choco: null,
    npm: null
  },
  wget: {
    name: 'wget',
    desc: 'Download tool',
    apt: 'wget',
    brew: 'wget',
    choco: null,
    npm: null
  },

  // Code analysis
  semgrep: {
    name: 'semgrep',
    desc: 'Static analysis tool',
    apt: null,
    brew: 'semgrep',
    choco: null,
    npm: 'semgrep'
  },
  bandit: {
    name: 'bandit',
    desc: 'Python security checker',
    apt: 'python3-bandit',
    brew: 'bandit',
    choco: null,
    npm: null,
    pip: 'bandit'
  },
  npmaudit: {
    name: 'npm',
    desc: 'Node security audit',
    apt: null,
    brew: null,
    choco: null,
    npm: null // built into npm
  },

  // CVEs
  cve: {
    name: 'cve-search',
    desc: 'CVE database tool',
    apt: null,
    brew: null,
    choco: null,
    npm: null
  }
};

// Check if tool exists
export function toolExists(name) {
  // Special case for npm tools
  if (name === 'npm' || name === 'node') return true;

  try {
    if (OS.WINDOWS) {
      const where = execSync(`where.exe ${name}`, {
        encoding: 'utf-8',
        shell: 'cmd.exe',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return where.length > 0;
    } else {
      const path = execSync(`command -v ${name}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return path.length > 0;
    }
  } catch {
    return false;
  }
}

// Get install command based on OS
function getInstallCommand(toolName) {
  const tool = TOOL_DEFINITIONS[toolName];
  if (!tool) return null;

  if (OS.WINDOWS) {
    // Try chocolatey
    if (tool.choco) {
      return { cmd: `choco install -y ${tool.choco}`, method: 'chocolatey' };
    }
    // Try npm
    if (tool.npm) {
      return { cmd: `npm install -g ${tool.npm}`, method: 'npm' };
    }
    // Try pip
    if (tool.pip) {
      return { cmd: `pip install ${tool.pip}`, method: 'pip' };
    }
    // WSL suggestion
    return {
      cmd: null,
      method: 'wsl',
      suggestion: 'Install WSL2: wsl --install -d Ubuntu'
    };
  }

  if (OS.MAC) {
    if (tool.brew) {
      return { cmd: `brew install ${tool.brew}`, method: 'brew' };
    }
    if (tool.npm) {
      return { cmd: `npm install -g ${tool.npm}`, method: 'npm' };
    }
  }

  // Linux (Kali, Ubuntu, etc)
  if (OS.KALI || OS.UBUNTU) {
    if (tool.apt) {
      return { cmd: `sudo apt-get update && sudo apt-get install -y ${tool.apt}`, method: 'apt' };
    }
    if (tool.goInstall) {
      return { cmd: tool.goInstall, method: 'go' };
    }
  }

  return null;
}

// Auto-install a tool
export async function autoInstall(toolName, silent = false) {
  if (toolExists(toolName)) {
    return { success: true, reason: 'already installed' };
  }

  if (!silent) {
    console.log(chalk.yellow(`\n  ⚠️  Tool '${toolName}' not found`));
    console.log(chalk.cyan(`  Attempting to install...`));
  }

  const installInfo = getInstallCommand(toolName);

  if (!installInfo || !installInfo.cmd) {
    if (!silent) {
      console.log(chalk.red(`  ❌ Cannot auto-install '${toolName}' on this platform`));
      if (installInfo?.suggestion) {
        console.log(chalk.dim(`  💡 ${installInfo.suggestion}`));
      }
    }
    return { success: false, reason: 'no install method' };
  }

  try {
    if (!silent) {
      console.log(chalk.dim(`  Installing via ${installInfo.method}...`));
    }

    execSync(installInfo.cmd, {
      encoding: 'utf-8',
      timeout: 180000,
      stdio: silent ? 'pipe' : 'inherit'
    });

    // Verify installation
    if (toolExists(toolName)) {
      if (!silent) {
        console.log(chalk.green(`  ✅ ${toolName} installed successfully!`));
      }
      return { success: true, reason: 'installed' };
    }
  } catch (e) {
    if (!silent) {
      console.log(chalk.red(`  ❌ Installation failed: ${e.message}`));
    }
    return { success: false, reason: e.message };
  }

  return { success: false, reason: 'unknown' };
}

// Check and install multiple tools
export async function ensureTools(toolNames, silent = false) {
  const results = {};
  const toInstall = [];

  for (const tool of toolNames) {
    if (!toolExists(tool)) {
      toInstall.push(tool);
    }
  }

  if (toInstall.length === 0) {
    return { allPresent: true, results: {} };
  }

  if (!silent) {
    console.log(chalk.cyan(`\n  📦 Checking ${toInstall.length} tools...`));
  }

  for (const tool of toInstall) {
    results[tool] = await autoInstall(tool, silent);
  }

  return {
    allPresent: toInstall.every(t => results[t].success),
    results
  };
}

// Run command with auto-install on failure
export async function runWithAutoInstall(toolName, command, options = {}) {
  const { timeout = 30000, silent = false } = options;

  // First try to run
  if (toolExists(toolName)) {
    try {
      return execSync(command, {
        encoding: 'utf-8',
        timeout,
        stdio: 'pipe'
      }).trim();
    } catch (e) {
      if (!silent) {
        console.log(chalk.red(`  Command failed: ${e.message}`));
      }
      return null;
    }
  }

  // Tool not found - try to install
  const installResult = await autoInstall(toolName, silent);

  if (installResult.success) {
    // Try again
    try {
      return execSync(command, {
        encoding: 'utf-8',
        timeout,
        stdio: 'pipe'
      }).trim();
    } catch (e) {
      return null;
    }
  }

  return null;
}

// Get tool status for all known tools
export function getToolStatus() {
  const status = {};
  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    status[name] = {
      installed: toolExists(name),
      description: def.desc
    };
  }
  return status;
}

// Display missing tools
export function getMissingTools() {
  const missing = [];
  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    if (!toolExists(name)) {
      missing.push({ name, desc: def.desc });
    }
  }
  return missing;
}

// Quick install all basic tools
export async function installBasicTools() {
  const basicTools = ['nmap', 'curl', 'wget', 'sqlmap', 'nikto'];
  console.log(chalk.cyan('\n  📦 Installing basic security tools...\n'));

  for (const tool of basicTools) {
    if (!toolExists(tool)) {
      await autoInstall(tool);
    }
  }

  console.log(chalk.green('\n  ✅ Basic tools installation complete!\n'));
}

export default {
  OS,
  toolExists,
  autoInstall,
  ensureTools,
  runWithAutoInstall,
  getToolStatus,
  getMissingTools,
  installBasicTools
};
