import { execSync } from 'child_process';
import chalk from 'chalk';
import { toolExists, getInstallCmd, getAutoInstallCmd, hasGo, hasNpm, hasPip, hasCargo } from './platform.js';

export async function ensureToolsInstalled(requiredTools, packageManager = 'apt') {
  const missing = requiredTools.filter(t => !toolExists(t));

  if (missing.length === 0) return true;

  console.log(chalk.yellow('\n  Missing tools needed for this scan:'));
  missing.forEach(tool => {
    const cmd = getInstallCmd(tool, packageManager);
    console.log(`   ❌ ${tool.padEnd(12)} → ${cmd || 'manual install required'}`);
  });

  return { missing, suggestions: missing.map(t => getInstallCmd(t, packageManager)) };
}

// Helper to ask user permission (uses global rl if available)
async function askUserPermission(question) {
  if (global.__red_rl) {
    return new Promise((resolve) => {
      global.__red_rl.question(chalk.cyan(question), (answer) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(chalk.cyan(question), (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

// Check if Go is needed for any tool and prompt to install
async function ensureGoInstalled() {
  if (hasGo()) return true;

  console.log(chalk.yellow('\n  ⚠️  Go is required to install this tool.'));
  console.log(chalk.dim('  Go is needed for: subfinder, nuclei, httpx, amass, ffuf, and other Go tools.\n'));

  const proceed = await askUserPermission('  Install Go now? [y/n]: ');
  if (proceed) {
    console.log(chalk.yellow('  Installing Go...'));
    try {
      execSync('sudo apt-get install -y golang-go', { stdio: 'inherit', shell: true });
      console.log(chalk.green('  ✅ Go installed successfully'));
      return true;
    } catch (e) {
      console.log(chalk.red('  ❌ Failed to install Go'));
      console.log(chalk.dim('  Install manually: sudo apt-get install golang-go'));
      return false;
    }
  }
  return false;
}

// Check if a dependency is needed and prompt to install
async function ensureDependencyInstalled(depName, installCmd, depType) {
  console.log(chalk.yellow(`\n  ⚠️  ${depType} is required to install this package but is not installed.`));

  const proceed = await askUserPermission(`  Install ${depName} now? [y/n]: `);
  if (proceed) {
    console.log(chalk.yellow(`  Installing ${depName}...`));
    try {
      execSync(installCmd, { stdio: 'inherit', shell: true });
      console.log(chalk.green(`  ✅ ${depName} installed successfully`));
      return true;
    } catch (e) {
      console.log(chalk.red(`  ❌ Failed to install ${depName}`));
      console.log(chalk.dim(`  Install manually: ${installCmd}`));
      return false;
    }
  }
  return false;
}

export async function installTool(toolName, packageManager = 'apt') {
  // Check if tool already exists
  if (toolExists(toolName)) {
    console.log(chalk.green(`  ✅ ${toolName} is already installed`));
    return true;
  }

  // Try predefined command first, then auto-detect
  let cmd = getInstallCmd(toolName, packageManager);
  if (!cmd) {
    console.log(chalk.dim(`  🔍 Auto-detecting package type for: ${toolName}`));
    cmd = getAutoInstallCmd(toolName);
  }

  if (!cmd) {
    console.log(chalk.red(`  ❌ Could not determine how to install ${toolName}`));
    console.log(chalk.dim('  Please install it manually or provide the package manager type.'));
    return false;
  }

  // Show what we're about to do
  console.log(chalk.dim(`  📦 Install command: ${cmd}`));

  // Check for dependencies and prompt user
  const goTools = ['subfinder', 'nuclei', 'httpx', 'amass', 'ffuf'];
  if (goTools.includes(toolName)) {
    const goInstalled = await ensureGoInstalled();
    if (!goInstalled) {
      console.log(chalk.red(`  ❌ Cannot install ${toolName} without Go`));
      return false;
    }
  }

  // Check for npm
  if (cmd.startsWith('npm install') && !hasNpm()) {
    const installed = await ensureDependencyInstalled('Node.js/npm', 'sudo apt-get install -y nodejs npm', 'Node.js');
    if (!installed) return false;
  }

  // Check for pip
  if (cmd.startsWith('pip') && !hasPip()) {
    const installed = await ensureDependencyInstalled('pip', 'sudo apt-get install -y python3-pip', 'pip');
    if (!installed) return false;
  }

  // Check for cargo
  if (cmd.startsWith('cargo install') && !hasCargo()) {
    const installed = await ensureDependencyInstalled('Rust/Cargo', 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh', 'Rust');
    if (!installed) return false;
  }

  // Ask for final permission
  console.log('');
  const proceed = await askUserPermission(`  Proceed with installation? [y/n]: `);
  if (!proceed) {
    console.log(chalk.yellow('  Installation cancelled.'));
    return false;
  }

  process.stdout.write(chalk.yellow(`  Installing ${toolName}... `));
  try {
    execSync(cmd, { stdio: 'pipe', shell: true });
    console.log(chalk.green('✅ done'));
    return true;
  } catch (e) {
    console.log(chalk.red('❌ failed'));
    console.log(chalk.dim(`  Try manually: ${cmd}`));
    return false;
  }
}

export function listAvailableTools() {
  const essentialTools = [
    { name: 'nmap', purpose: 'Port scanning', critical: true },
    { name: 'nikto', purpose: 'Web vulnerability scanning', critical: false },
    { name: 'sqlmap', purpose: 'SQL injection testing', critical: false },
    { name: 'curl', purpose: 'HTTP requests (usually pre-installed)', critical: true },
    { name: 'openssl', purpose: 'SSL/TLS analysis (usually pre-installed)', critical: true },
    { name: 'whois', purpose: 'WHOIS lookups', critical: false },
    { name: 'dig', purpose: 'DNS enumeration', critical: false },
    { name: 'subfinder', purpose: 'Subdomain enumeration', critical: false },
    { name: 'nuclei', purpose: 'Vulnerability templates', critical: false },
  ];

  console.log(chalk.cyan('\n╭─ 🛠️  Security Tools Status ─────────────────────────────────╮'));
  console.log(chalk.cyan('│'));
  for (const tool of essentialTools) {
    const available = toolExists(tool.name);
    const status = available ? chalk.green('✅') : chalk.red('❌');
    const label = tool.critical ? chalk.bold : chalk.dim;
    console.log(`${status} ${label(tool.name.padEnd(12))} - ${tool.purpose}`);
  }
  console.log(chalk.cyan('│'));
  console.log(chalk.cyan('╰──────────────────────────────────────────────────────────╯\n'));
}

export default { ensureToolsInstalled, installTool, listAvailableTools };