import { execSync } from 'child_process';
import chalk from 'chalk';

const SECURITY_TOOLS = {
  recon: {
    nmap: { check: 'nmap --version', install: { apt: 'nmap', brew: 'nmap', choco: 'nmap' } },
    masscan: { check: 'masscan --version', install: { apt: 'masscan' } },
    whois: { check: 'whois --version', install: { apt: 'whois', brew: 'whois' } },
    dig: { check: 'dig -v', install: { apt: 'dnsutils', brew: 'bind' } },
    subfinder: { check: 'subfinder --version', install: { brew: 'subfinder' } },
    amass: { check: 'amass --version', install: { brew: 'amass' } },
    theHarvester: { check: 'theHarvester -h', install: { apt: 'theharvester' } },
    crt: { check: null, install: { npm: 'crt.sh' } },
    wappalyzer: { check: null, install: { npm: 'wappalyzer' } }
  },
  scanning: {
    nikto: { check: 'nikto -Version', install: { apt: 'nikto', brew: 'nikto' } },
    nuclei: { check: 'nuclei --version', install: { brew: 'nuclei' } },
    zap: { check: 'zap.sh -version', install: { manual: 'https://www.zaproxy.org' } },
    wapiti: { check: 'wapiti --version', install: { apt: 'wapiti' } },
    sqlmap: { check: 'sqlmap --version', install: { apt: 'sqlmap', brew: 'sqlmap' } },
    ffuf: { check: 'ffuf -V', install: { brew: 'ffuf' } },
    gobuster: { check: 'gobuster version', install: { apt: 'gobuster', brew: 'gobuster' } },
    dirb: { check: 'dirb --version', install: { apt: 'dirb' } },
    dirbuster: { check: null, install: { apt: 'dirbuster' } }
  },
  exploitation: {
    metasploit: { check: 'msfconsole --version', install: { manual: 'https://metasploit.com' } },
    hydra: { check: 'hydra --version', install: { apt: 'hydra', brew: 'hydra' } },
    john: { check: 'john --version', install: { apt: 'john', brew: 'john' } },
    hashcat: { check: 'hashcat --version', install: { apt: 'hashcat', brew: 'hashcat' } },
    msfvenom: { check: 'msfvenom --version', install: { manual: 'https://metasploit.com' } }
  },
  network: {
    wireshark: { check: 'wireshark --version', install: { apt: 'wireshark', brew: 'wireshark' } },
    tcpdump: { check: 'tcpdump --version', install: { apt: 'tcpdump', brew: 'tcpdump' } },
    netcat: { check: 'nc -h', install: { apt: 'netcat', brew: 'netcat' } },
    socat: { check: 'socat -V', install: { apt: 'socat', brew: 'socat' } },
    responder: { check: 'responder -h', install: { apt: 'responder' } }
  },
  code_analysis: {
    semgrep: { check: 'semgrep --version', install: { brew: 'semgrep', pip: 'semgrep' } },
    bandit: { check: 'bandit --version', install: { pip: 'bandit' } },
    trivy: { check: 'trivy --version', install: { brew: 'trivy' } },
    snyk: { check: 'snyk --version', install: { npm: 'snyk' } },
    grype: { check: 'grype version', install: { brew: 'grype' } },
    gitleaks: { check: 'gitleaks version', install: { brew: 'gitleaks' } },
    gitsecrets: { check: 'git-secrets --version', install: { brew: 'git-secrets' } },
    trufflehog: { check: 'trufflehog --version', install: { brew: 'trufflehog' } },
    eslint: { check: 'eslint --version', install: { npm: 'eslint' } }
  },
  accessibility: {
    axe: { check: 'axe --version', install: { npm: '@axe-core/cli' } },
    pa11y: { check: 'pa11y --version', install: { npm: 'pa11y' } },
    lighthouse: { check: 'lighthouse --version', install: { npm: 'lighthouse' } }
  },
  forensics: {
    strings: { check: 'strings --version', install: { apt: 'binutils', brew: 'binutils' } },
    binwalk: { check: 'binwalk --help', install: { apt: 'binwalk', brew: 'binwalk' } },
    volatility: { check: 'vol.py --info', install: { pip: 'volatility3' } },
    steghide: { check: 'steghide --version', install: { apt: 'steghide', brew: 'steghide' } }
  },
  kali: {
    aircrack: { check: 'aircrack-ng --version', install: { apt: 'aircrack-ng' } },
    maltego: { check: null, install: { manual: 'https://www.maltego.com' } },
    beef: { check: 'beef-xss -v', install: { apt: 'beef-xss' } },
    setoolkit: { check: 'setoolkit --version', install: { apt: 'set' } },
    enum4linux: { check: 'enum4linux -h', install: { apt: 'enum4linux' } },
    crackmapexec: { check: 'crackmapexec --help', install: { pip: 'crackmapexec' } },
    impacket: { check: 'smbclient --version', install: { pip: 'impacket' } },
    bloodhound: { check: 'bloodhound --help', install: { apt: 'bloodhound' } }
  }
};

export class ToolsRegistry {
  constructor() {
    this.tools = JSON.parse(JSON.stringify(SECURITY_TOOLS));
    this.available = {};
    this.missing = [];
  }

  async detectTools(platform) {
    const categories = Object.keys(this.tools);

    for (const category of categories) {
      if (category === 'kali' && !platform.isKali) continue;

      this.available[category] = {};

      for (const [toolName, toolConfig] of Object.entries(this.tools[category])) {
        if (platform.isKali && category !== 'kali') continue;

        try {
          if (toolConfig.check) {
            execSync(toolConfig.check, { stdio: 'ignore', timeout: 3000 });
            this.available[category][toolName] = { available: true, version: 'unknown' };
          } else {
            this.available[category][toolName] = { available: true, version: 'unknown' };
          }
        } catch {
          this.available[category][toolName] = { available: false, version: null };
          this.missing.push(toolName);
        }
      }
    }

    return this.available;
  }

  getStatus() {
    return this.available;
  }

  getMissing() {
    return this.missing;
  }

  getAvailable(category) {
    return this.available[category] || {};
  }

  isToolAvailable(category, toolName) {
    return this.available[category]?.[toolName]?.available || false;
  }

  getInstallCommand(toolName, packageManager) {
    for (const category of Object.values(this.tools)) {
      if (category[toolName]) {
        const tool = category[toolName];
        if (tool.install[packageManager]) {
          const pmCommands = {
            apt: `sudo apt-get install -y ${tool.install.apt}`,
            'apt-get': `sudo apt-get install -y ${tool.install.apt-get}`,
            yum: `sudo yum install -y ${tool.install.yum}`,
            dnf: `sudo dnf install -y ${tool.install.dnf}`,
            pacman: `sudo pacman -S --noconfirm ${tool.install.pacman}`,
            brew: `brew install ${tool.install.brew}`,
            choco: `choco install ${tool.install.choco} -y`,
            pip: `pip install ${tool.install.pip}`,
            npm: `npm install -g ${tool.install.npm}`
          };
          return pmCommands[packageManager] || '# Manual install required';
        }
        if (tool.install.manual) {
          return `# Manual install: ${tool.install.manual}`;
        }
      }
    }
    return '# Unknown tool';
  }

  async installTool(toolName, packageManager) {
    const command = this.getInstallCommand(toolName, packageManager);
    console.log(chalk.yellow(`Installing ${toolName}...`));
    console.log(chalk.dim(command));

    try {
      execSync(command, { stdio: 'inherit', shell: true });
      console.log(chalk.green(`✓ ${toolName} installed`));
      return true;
    } catch (err) {
      console.log(chalk.red(`✗ Failed to install ${toolName}`));
      return false;
    }
  }

  async installAllMissing(packageManager) {
    const results = {};
    for (const tool of this.missing) {
      results[tool] = await this.installTool(tool, packageManager);
    }
    return results;
  }

  getToolsSummary() {
    let total = 0;
    let available = 0;

    for (const category of Object.values(this.available)) {
      for (const tool of Object.values(category)) {
        total++;
        if (tool.available) available++;
      }
    }

    return { total, available, missing: total - available };
  }
}

export default ToolsRegistry;