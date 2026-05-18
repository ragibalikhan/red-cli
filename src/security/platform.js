import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform, release } from 'os';
import chalk from 'chalk';

const isWindows = platform() === 'win32';

// Safe exec that returns empty string on failure instead of throwing
export function execSafe(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts
    }).trim();
  } catch (e) {
    return '';
  }
}

// Check if a tool is installed and return its path
export function toolExists(name) {
  try {
    const checkCommand = isWindows ? `where.exe ${name}` : `command -v ${name}`;
    const path = execSync(checkCommand, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

// Check if Go is installed (needed for certain tools)
export function hasGo() {
  return toolExists('go') !== null;
}

// Check if npm is installed
export function hasNpm() {
  return toolExists('npm') !== null;
}

// Check if pip is installed
export function hasPip() {
  return toolExists('pip3') !== null || toolExists('pip') !== null;
}

// Check if cargo/rust is installed
export function hasCargo() {
  return toolExists('cargo') !== null;
}

// Detect package type from tool name
function detectPackageType(tool) {
  // npm packages (scoped like @types/node or names like express)
  if (tool.startsWith('@') || tool.includes('/')) {
    return 'npm';
  }
  // npm packages (common naming pattern)
  if (/^[a-z][a-z0-9-]*$/i.test(tool) && !tool.includes('-') && tool.length < 20) {
    // Could be npm, check if it looks like a known npm package
    const commonNpmPackages = ['express', 'typescript', 'vite', 'webpack', 'eslint', 'prettier', 'nodemon', 'ts-node', 'react', 'vue', 'next', 'lodash', 'axios', 'moment', ' chalk', 'inquirer', 'commander', 'yeoman'];
    if (commonNpmPackages.includes(tool)) return 'npm';
  }
  // Python packages (often have underscores or common patterns)
  if (/^[a-z][a-z0-9_]*$/i.test(tool)) {
    const commonPipPackages = ['requests', 'flask', 'django', 'numpy', 'pandas', 'pytest', 'black', 'ruff', 'pillow', 'aiohttp', 'urllib', 'cryptography', 'pyyaml', 'jinja2', 'websocket', 'fastapi', 'pydantic', 'sqlalchemy', 'celery', 'redis'];
    if (commonPipPackages.includes(tool)) return 'pip';
  }
  // Rust crates
  if (/^[a-z][a-z0-9_-]*$/i.test(tool) && tool.length < 25) {
    return 'cargo';
  }
  return null;
}

// Auto-detect package manager and generate install command
// Main export - tries predefined first, then auto-detects
export function getInstallCmd(tool, pm = 'apt') {
  // Check if Go is needed but not installed
  const goTools = ['subfinder', 'nuclei', 'httpx', 'amass', 'ffuf'];
  if (goTools.includes(tool) && pm === 'apt' && !hasGo()) {
    console.log(chalk.red(`  ⚠️  ${tool} requires Go but Go is not installed.`));
    console.log(chalk.dim('  Install Go first: sudo apt-get install golang-go'));
    console.log(chalk.dim(`  Or download from: https://go.dev/dl/`));
    return null;
  }

  // Try predefined first
  const predefined = getPredefinedCmd(tool, pm);
  if (predefined) return predefined;

  // Fall back to auto-detect
  return getAutoInstallCmd(tool);
}

// Auto-install a tool if not present
export async function autoInstallTool(toolName) {
  if (toolExists(toolName)) {
    return true; // Already installed
  }

  console.log(chalk.yellow(`  📦 Tool '${toolName}' not found. Attempting to install...`));

  const installCmd = getInstallCmd(toolName);
  if (!installCmd) {
    console.log(chalk.red(`  ❌ Cannot install '${toolName}' automatically.`));
    console.log(chalk.dim(`  Please install manually.`));
    return false;
  }

  try {
    // Try npm install first for Node tools
    if (hasNpm() && !installCmd.includes('apt') && !installCmd.includes('brew')) {
      console.log(chalk.dim(`  Trying npm install...`));
      execSync(`npm install -g ${toolName} 2>&1`, { stdio: 'inherit' });
      if (toolExists(toolName)) {
        console.log(chalk.green(`  ✅ ${toolName} installed via npm`));
        return true;
      }
    }

    // Try apt-get for Linux
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      console.log(chalk.dim(`  Trying apt-get...`));
      execSync(`sudo apt-get update && sudo apt-get install -y ${toolName} 2>&1`, { stdio: 'inherit', timeout: 120000 });
      if (toolExists(toolName)) {
        console.log(chalk.green(`  ✅ ${toolName} installed via apt-get`));
        return true;
      }
    }

    console.log(chalk.yellow(`  ⚠️  Could not auto-install ${toolName}`));
    return false;
  } catch (e) {
    console.log(chalk.red(`  ❌ Install failed: ${e.message}`));
    return false;
  }
}

export function getAutoInstallCmd(tool) {
  const pm = process.platform === 'darwin' ? 'brew' : 'apt';

  // First check predefined commands
  const predefinedCmd = getPredefinedCmd(tool, pm);
  if (predefinedCmd) return predefinedCmd;

  // Detect package type
  const packageType = detectPackageType(tool);

  if (packageType === 'npm') {
    if (!hasNpm()) {
      console.log(chalk.red(`  ⚠️  npm is not installed.`));
      console.log(chalk.dim('  Install Node.js from: https://nodejs.org'));
      return null;
    }
    return `npm install -g ${tool}`;
  }

  if (packageType === 'pip') {
    if (!hasPip()) {
      console.log(chalk.red(`  ⚠️  pip is not installed.`));
      console.log(chalk.dim('  Install Python and pip: sudo apt-get install python3-pip'));
      return null;
    }
    return `pip3 install ${tool}`;
  }

  if (packageType === 'cargo') {
    if (!hasCargo()) {
      console.log(chalk.red(`  ⚠️  Rust/Cargo is not installed.`));
      console.log(chalk.dim('  Install from: https://rustup.rs'));
      return null;
    }
    return `cargo install ${tool}`;
  }

  // Fallback to system package manager
  if (pm === 'brew') {
    return `brew install ${tool}`;
  }
  return `sudo apt-get install -y ${tool}`;
}

// Get predefined install command
function getPredefinedCmd(tool, pm) {
  const commands = {
    apt: {
      nmap: 'sudo apt-get install -y nmap',
      dig: 'sudo apt-get install -y dnsutils',
      whois: 'sudo apt-get install -y whois',
      nikto: 'sudo apt-get install -y nikto',
      sqlmap: 'sudo apt-get install -y sqlmap',
      dirb: 'sudo apt-get install -y dirb',
      gobuster: 'sudo apt-get install -y gobuster',
      curl: 'sudo apt-get install -y curl',
      wget: 'sudo apt-get install -y wget',
      netcat: 'sudo apt-get install -y netcat',
      sslscan: 'sudo apt-get install -y sslscan',
      subfinder: 'go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
      nuclei: 'go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest',
      ffuf: 'go install github.com/ffuf/ffuf/v2@latest',
      httpx: 'go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest',
      amass: 'go install -v github.com/owasp/amass/v3/cmd/amass@latest',
      semgrep: 'pip3 install semgrep',
      trivy: 'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin',
      whatweb: 'sudo apt-get install -y whatweb'
    },
    brew: {
      nmap: 'brew install nmap',
      dig: 'brew install bind',
      whois: 'brew install whois',
      nikto: 'brew install nikto',
      sqlmap: 'brew install sqlmap',
      gobuster: 'brew install gobuster',
      sslscan: 'brew install sslscan',
      subfinder: 'brew install subfinder',
      nuclei: 'brew install nuclei',
      ffuf: 'brew install ffuf',
      httpx: 'brew install httpx',
      gitleaks: 'brew install gitleaks',
      semgrep: 'brew install semgrep',
      trivy: 'brew install trivy'
    }
  };
  return commands[pm]?.[tool] || null;
}

export class PlatformDetector {
  constructor() {
    this.os = 'unknown';
    this.version = '';
    this.isRoot = false;
    this.hasSudo = false;
    this.isKali = false;
    this.isWSL = false;
    this.packageManager = null;
    this.arch = '';
  }

  async detect() {
    this.detectOS();
    this.detectPrivilege();
    this.detectPackageManager();
    this.detectArch();
    await this.detectKali();
    this.detectWSL();

    return this;
  }

  detectOS() {
    const p = platform();
    if (p === 'win32') {
      this.os = 'Windows';
      try {
        this.version = release();
      } catch {}
    } else if (p === 'darwin') {
      this.os = 'macOS';
      try {
        this.version = release();
      } catch {}
    } else {
      this.os = 'Linux';
      try {
        const osRelease = execSync('cat /etc/os-release', { encoding: 'utf-8' });
        const match = osRelease.match(/VERSION_ID="([^"]+)"/);
        if (match) this.version = match[1];

        const nameMatch = osRelease.match(/NAME="([^"]+)"/);
        if (nameMatch) this.os = nameMatch[1];
      } catch {
        this.version = 'Unknown';
      }
    }
  }

  detectPrivilege() {
    if (platform() === 'win32') {
      this.isRoot = false;
      this.hasSudo = false;
      return;
    }
    try {
      const uid = execSync('id -u', { encoding: 'utf-8' }).trim();
      this.isRoot = uid === '0';
    } catch {
      this.isRoot = false;
    }

    try {
      execSync('sudo -n true', { stdio: 'ignore' });
      this.hasSudo = true;
    } catch {
      this.hasSudo = false;
    }
  }

  detectPackageManager() {
    const managers = [
      { name: 'apt', cmd: 'apt --version' },
      { name: 'apt-get', cmd: 'apt-get --version' },
      { name: 'yum', cmd: 'yum --version' },
      { name: 'dnf', cmd: 'dnf --version' },
      { name: 'pacman', cmd: 'pacman --version' },
      { name: 'brew', cmd: 'brew --version' },
      { name: 'choco', cmd: 'choco --version' },
      { name: 'winget', cmd: 'winget --version' }
    ];

    for (const m of managers) {
      try {
        execSync(m.cmd, { stdio: 'ignore', timeout: 2000 });
        this.packageManager = m.name;
        break;
      } catch {}
    }

    if (!this.packageManager && this.os === 'Windows') {
      this.packageManager = 'choco';
    }
  }

  detectArch() {
    try {
      const p = platform();
      if (p === 'win32') {
        this.arch = execSync('echo %PROCESSOR_ARCHITECTURE%', { encoding: 'utf-8' }).trim();
      } else if (p === 'darwin') {
        this.arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
      } else {
        this.arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
      }
    } catch {
      this.arch = 'unknown';
    }
  }

  async detectKali() {
    if (platform() === 'win32') {
      this.isKali = false;
      return;
    }
    try {
      if (existsSync('/etc/kali_version')) {
        this.isKali = true;
        return;
      }
      const osRelease = execSync('cat /etc/os-release', { encoding: 'utf-8' });
      this.isKali = osRelease.includes('Kali');
    } catch {
      this.isKali = false;
    }
  }

  detectWSL() {
    if (platform() === 'win32') {
      this.isWSL = false;
      return;
    }
    try {
      const wsl = execSync('cat /proc/version', { encoding: 'utf-8' });
      this.isWSL = wsl.toLowerCase().includes('microsoft') || wsl.toLowerCase().includes('wsl');
    } catch {
      this.isWSL = false;
    }
  }

  getInstallCommand(toolName) {
    const installMap = {
      apt: `sudo apt-get install -y ${toolName}`,
      'apt-get': `sudo apt-get install -y ${toolName}`,
      yum: `sudo yum install -y ${toolName}`,
      dnf: `sudo dnf install -y ${toolName}`,
      pacman: `sudo pacman -S --noconfirm ${toolName}`,
      brew: `brew install ${toolName}`,
      choco: `choco install ${toolName} -y`,
      winget: `winget install ${toolName}`
    };

    return installMap[this.packageManager] || `# Install ${toolName} manually`;
  }

  isSupported() {
    return ['Linux', 'macOS', 'Windows', 'Ubuntu', 'Debian', 'Kali'].includes(this.os);
  }

  toJSON() {
    return {
      os: this.os,
      version: this.version,
      isRoot: this.isRoot,
      hasSudo: this.hasSudo,
      isKali: this.isKali,
      isWSL: this.isWSL,
      packageManager: this.packageManager,
      arch: this.arch
    };
  }
}

export default PlatformDetector;
