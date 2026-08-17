import { execSync } from 'child_process';
import { toolExists, autoInstall } from './tool-manager.js';
import chalk from 'chalk';

const TOOL_TIMEOUT = 120000;
const MAX_OUTPUT = 10000;
const installCache = new Map();

function sanitize(arg) {
  if (typeof arg !== 'string') return String(arg);
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

async function ensureTool(toolName) {
  if (installCache.get(toolName) === true) return true;
  if (toolExists(toolName)) { installCache.set(toolName, true); return true; }
  console.log(chalk.yellow(`\n  ⚠️  '${toolName}' not found. Installing...`));
  const result = await autoInstall(toolName, false);
  if (result.success) {
    installCache.set(toolName, true);
    console.log(chalk.green(`  ✅ ${toolName} installed`));
    return true;
  }
  return false;
}

async function run(tool, cmd, timeout = TOOL_TIMEOUT) {
  const installed = await ensureTool(tool);
  if (!installed) {
    return { error: `'${tool}' could not be installed automatically. Install manually or run: /install-tools` };
  }
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout, maxBuffer: 10 * 1024 * 1024 });
    return { output: output.slice(0, MAX_OUTPUT) || '(no output)' };
  } catch (err) {
    const msg = (err.message || '') + (err.stderr || '');
    if (/not found|command not found|is not recognized/i.test(msg)) {
      installCache.delete(tool);
      return { error: `${tool} not found after install. Try: install_tool({ tool: "${tool}" })` };
    }
    return { error: `${tool} failed: ${err.message}`, stderr: err.stderr || '' };
  }
}

function buildNmapArgs(input) {
  const { target, ports, scan_type = 'quick', scripts, udp, os_detect, extra_args } = input;
  if (!target) return null;
  const args = [];
  switch (scan_type) {
    case 'full': args.push('-sV', '-sC', '-p-', '-T4'); break;
    case 'service': args.push('-sV', '-sC', '-T4'); break;
    case 'stealth': args.push('-sS', '-T2', '-Pn'); break;
    case 'aggressive': args.push('-sV', '-sC', '-A', '-T4'); break;
    default: args.push('-F', '-T4');
  }
  if (ports) args.push('-p', sanitize(ports));
  if (udp) args.push('-sU');
  if (os_detect) args.push('-O');
  if (scripts) args.push('--script', sanitize(scripts));
  if (extra_args) args.push(extra_args);
  args.push(sanitize(target));
  return args.join(' ');
}

export const SECURITY_TOOL_DEFINITIONS = [
  {
    name: 'nmap_scan',
    description: 'Run nmap port scan. Supports quick/full/service/stealth/aggressive scan types, UDP scanning, OS detection, and NSE scripts.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'IP address or hostname to scan' },
        ports: { type: 'string', description: 'Port range (e.g. "80,443", "1-1000", "22,80,443,8080")' },
        scan_type: { type: 'string', enum: ['quick', 'full', 'service', 'stealth', 'aggressive'], description: 'Scan type. Default: quick' },
        scripts: { type: 'string', description: 'NSE scripts (e.g. "vuln", "auth", "default")' },
        udp: { type: 'boolean', description: 'Enable UDP scanning. Default: false' },
        os_detect: { type: 'boolean', description: 'Enable OS detection. Default: false' },
        extra_args: { type: 'string', description: 'Extra nmap arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'masscan_scan',
    description: 'Fast port scanner. Scans up to 10M packets/sec. Best for large-scale port discovery before targeted nmap scans.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'IP range (e.g. "192.168.1.0/24", "10.0.0.1")' },
        ports: { type: 'string', description: 'Port range (e.g. "80,443", "1-65535"). Default: top 100 ports' },
        rate: { type: 'number', description: 'Packets per second. Default: 1000' },
        extra_args: { type: 'string', description: 'Extra masscan arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'whois_lookup',
    description: 'WHOIS domain/IP lookup. Returns registrar, creation date, expiration, name servers, and contact info.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Domain name or IP address' }
      },
      required: ['target']
    }
  },
  {
    name: 'traceroute',
    description: 'Network path analysis. Shows hops between you and the target. Helps identify network topology and filtering.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'IP address or hostname' },
        max_hops: { type: 'number', description: 'Maximum hops. Default: 30' }
      },
      required: ['target']
    }
  },
  {
    name: 'httpx_probe',
    description: 'HTTP probe tool. Returns status code, tech stack, content length, titles, headers, and TLS info for URLs.',
    input_schema: {
      type: 'object',
      properties: {
        targets: { type: 'string', description: 'URL(s) or domain(s), one per line or comma-separated' },
        ports: { type: 'string', description: 'Ports to probe (e.g. "80,443,8080"). Default: 80,443' },
        follow_redirects: { type: 'boolean', description: 'Follow redirects. Default: true' },
        tech_detect: { type: 'boolean', description: 'Enable technology detection. Default: true' },
        status_code: { type: 'boolean', description: 'Show status codes. Default: true' },
        extra_args: { type: 'string', description: 'Extra httpx arguments' }
      },
      required: ['targets']
    }
  },
  {
    name: 'whatweb_scan',
    description: 'Web technology fingerprinting. Identifies web server, CMS, frameworks, JavaScript libraries, and more.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'URL to fingerprint' },
        aggression: { type: 'number', description: 'Aggression level 1-4. Default: 1 (passive)' },
        extra_args: { type: 'string', description: 'Extra whatweb arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'subfinder_enum',
    description: 'Passive subdomain enumeration. Uses multiple sources (crt.sh, DNS, certificates) to find subdomains.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Target domain' },
        sources: { type: 'string', description: 'Sources to use (e.g. "crtsh,rapiddns,dns"). Default: all' },
        recursive: { type: 'boolean', description: 'Enable recursive enumeration. Default: false' }
      },
      required: ['domain']
    }
  },
  {
    name: 'amass_enum',
    description: 'Deep subdomain and IP enumeration. Combines passive and active reconnaissance for comprehensive asset discovery.',
    input_schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Target domain' },
        mode: { type: 'string', enum: ['passive', 'active', 'brute'], description: 'Enumeration mode. Default: passive' },
        wordlist: { type: 'string', description: 'Wordlist for brute mode. Default: built-in' },
        extra_args: { type: 'string', description: 'Extra amass arguments' }
      },
      required: ['domain']
    }
  },
  {
    name: 'ffuf_fuzz',
    description: 'Fast web fuzzer. Discovers directories, parameters, vhosts, and more with custom wordlists and filters.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL with FUZZ keyword (e.g. "https://target.com/FUZZ")' },
        wordlist: { type: 'string', description: 'Wordlist path or built-in (common, big, api). Default: common' },
        method: { type: 'string', description: 'HTTP method. Default: GET' },
        filters: { type: 'string', description: 'Filters (e.g. "-fc 404 -fs 0"). -fc=filter code, -fs=filter size' },
        headers: { type: 'string', description: 'Custom headers (e.g. "Authorization: Bearer token")' },
        data: { type: 'string', description: 'POST data (e.g. "user=FUZZ&pass=test")' },
        threads: { type: 'number', description: 'Number of threads. Default: 40' },
        extra_args: { type: 'string', description: 'Extra ffuf arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'gobuster_scan',
    description: 'Directory/DNS/VHost brute-force scanner. Fast and reliable for discovering hidden paths and subdomains.',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['dir', 'dns', 'vhost'], description: 'Scan mode. Default: dir' },
        target: { type: 'string', description: 'Target URL (dir/vhost) or domain (dns)' },
        wordlist: { type: 'string', description: 'Wordlist path or built-in (common, big, api). Default: common' },
        extensions: { type: 'string', description: 'File extensions for dir mode (e.g. "php,html,js")' },
        threads: { type: 'number', description: 'Number of threads. Default: 10' },
        extra_args: { type: 'string', description: 'Extra gobuster arguments' }
      },
      required: ['mode', 'target']
    }
  },
  {
    name: 'nuclei_scan',
    description: 'Template-based vulnerability scanner. 3000+ community templates for CVEs, misconfigs, exposures, and more.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL or domain' },
        templates: { type: 'string', description: 'Template tags/severity (e.g. "cve", "misconfig", "critical")' },
        severity: { type: 'string', description: 'Severity filter (e.g. "critical,high"). Default: all' },
        rate_limit: { type: 'number', description: 'Requests per second. Default: 150' },
        extra_args: { type: 'string', description: 'Extra nuclei arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'nikto_scan',
    description: 'Web server scanner. Checks for dangerous files, outdated software, misconfigs, and server-specific issues.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target URL or IP' },
        port: { type: 'number', description: 'Port to scan. Default: 80' },
        ssl: { type: 'boolean', description: 'Force SSL/TLS. Default: auto-detect' },
        tuning: { type: 'string', description: 'Tuning options (e.g. "123bde" for specific tests)' },
        extra_args: { type: 'string', description: 'Extra nikto arguments' }
      },
      required: ['target']
    }
  },
  {
    name: 'sqlmap_test',
    description: 'SQL injection detection and exploitation. Tests parameters for SQLi and optionally extracts data.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL with parameter (e.g. "https://target.com/page?id=1")' },
        method: { type: 'string', description: 'HTTP method. Default: GET' },
        data: { type: 'string', description: 'POST data (e.g. "user=admin&pass=test")' },
        cookie: { type: 'string', description: 'Cookie header value' },
        level: { type: 'number', description: 'Test level 1-5. Default: 1' },
        risk: { type: 'number', description: 'Risk level 1-3. Default: 1' },
        technique: { type: 'string', description: 'SQLi technique (e.g. "BEUSTQ")' },
        dbms: { type: 'string', description: 'Force DBMS (e.g. "MySQL", "PostgreSQL")' },
        batch: { type: 'boolean', description: 'Never ask for user input. Default: true' },
        extra_args: { type: 'string', description: 'Extra sqlmap arguments' }
      },
      required: ['url']
    }
  },
  {
    name: 'hydra_brute',
    description: 'Login brute-force attack. Supports SSH, FTP, HTTP, SMB, RDP, and 50+ protocols.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target IP or hostname' },
        service: { type: 'string', description: 'Service protocol (ssh, ftp, http-post-form, smb, rdp, etc.)' },
        username: { type: 'string', description: 'Username or path to username list' },
        password: { type: 'string', description: 'Password or path to password list' },
        port: { type: 'number', description: 'Service port. Default: auto-detect' },
        extra_args: { type: 'string', description: 'Extra hydra arguments' }
      },
      required: ['target', 'service', 'username', 'password']
    }
  },
  {
    name: 'wpscan_check',
    description: 'WordPress vulnerability scanner. Detects plugins, themes, version, and known CVEs.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'WordPress site URL' },
        api_token: { type: 'string', description: 'WPScan API token for vulnerability data' },
        enumerate: { type: 'string', description: 'What to enumerate (e.g. "vp,vt,u")' },
        extra_args: { type: 'string', description: 'Extra wpscan arguments' }
      },
      required: ['url']
    }
  }
];

const WORDLISTS = {
  common: '/usr/share/wordlists/dirb/common.txt',
  big: '/usr/share/wordlists/dirb/big.txt',
  api: '/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt',
  seclists: '/usr/share/seclists/Discovery/Web-Content/common.txt'
};

function getWordlistPath(name) {
  if (!name) return WORDLISTS.common;
  if (name.startsWith('/') || name.startsWith('.\\') || name.match(/^[A-Z]:\\/i)) return name;
  return WORDLISTS[name] || WORDLISTS.common;
}

export async function executeSecurityTool(toolName, input) {
  switch (toolName) {
    case 'nmap_scan': {
      const args = buildNmapArgs(input);
      if (!args) return { error: 'Target is required' };
      return await run('nmap', `nmap ${args}`);
    }

    case 'masscan_scan': {
      const { target, ports = '1-1000', rate = 1000, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      const args = [`--rate=${rate}`, `-p${sanitize(ports)}`, sanitize(target), extra_args].filter(Boolean).join(' ');
      return await run('masscan', `masscan ${args}`);
    }

    case 'whois_lookup': {
      const { target } = input;
      if (!target) return { error: 'Target is required' };
      return await run('whois', `whois ${sanitize(target)}`, 15000);
    }

    case 'traceroute': {
      const { target, max_hops = 30 } = input;
      if (!target) return { error: 'Target is required' };
      const cmd = process.platform === 'win32'
        ? `tracert -d -h ${max_hops} ${sanitize(target)}`
        : `traceroute -m ${max_hops} -n ${sanitize(target)}`;
      return await run('traceroute', cmd, 30000);
    }

    case 'httpx_probe': {
      const { targets, ports = '80,443', follow_redirects = true, tech_detect = true, status_code = true, extra_args = '' } = input;
      if (!targets) return { error: 'Targets are required' };
      const args = [];
      if (status_code) args.push('-sc');
      if (tech_detect) args.push('-td');
      if (follow_redirects) args.push('-fr');
      if (ports) args.push('-p', sanitize(ports));
      if (extra_args) args.push(extra_args);
      const tmpFile = `/tmp/httpx_targets_${Date.now()}.txt`;
      try { execSync(`echo ${sanitize(targets)} > ${tmpFile}`); } catch {}
      args.push('-l', tmpFile);
      const result = await run('httpx', `httpx ${args.join(' ')}`);
      try { execSync(`rm -f ${tmpFile}`); } catch {}
      return result;
    }

    case 'whatweb_scan': {
      const { target, aggression = 1, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      return await run('whatweb', `whatweb -a ${aggression} ${extra_args} ${sanitize(target)}`);
    }

    case 'subfinder_enum': {
      const { domain, sources = '', recursive = false } = input;
      if (!domain) return { error: 'Domain is required' };
      const args = ['-d', sanitize(domain), '-silent'];
      if (sources) args.push('-sources', sanitize(sources));
      if (recursive) args.push('-recursive');
      return await run('subfinder', `subfinder ${args.join(' ')}`);
    }

    case 'amass_enum': {
      const { domain, mode = 'passive', wordlist = '', extra_args = '' } = input;
      if (!domain) return { error: 'Domain is required' };
      const args = ['-d', sanitize(domain)];
      if (mode === 'active') args.push('-active');
      else if (mode === 'brute') { args.push('-brute'); if (wordlist) args.push('-w', sanitize(wordlist)); }
      if (extra_args) args.push(extra_args);
      return await run('amass', `amass enum ${args.join(' ')}`, 180000);
    }

    case 'ffuf_fuzz': {
      const { target, wordlist = 'common', method = 'GET', filters = '', headers = '', data = '', threads = 40, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      const wl = getWordlistPath(wordlist);
      const args = ['-u', sanitize(target), '-w', sanitize(wl), '-t', threads, '-mc', '200,301,302,403'];
      if (method !== 'GET') args.push('-X', sanitize(method));
      if (filters) args.push(filters);
      if (headers) { for (const h of headers.split('\n')) { if (h.trim()) args.push('-H', sanitize(h.trim())); } }
      if (data) args.push('-d', sanitize(data));
      if (extra_args) args.push(extra_args);
      return await run('ffuf', `ffuf ${args.join(' ')}`);
    }

    case 'gobuster_scan': {
      const { mode = 'dir', target, wordlist = 'common', extensions = '', threads = 10, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      const wl = getWordlistPath(wordlist);
      const args = [mode, '-u', sanitize(target), '-w', sanitize(wl), '-t', threads];
      if (mode === 'dir' && extensions) args.push('-x', sanitize(extensions));
      if (extra_args) args.push(extra_args);
      return await run('gobuster', `gobuster ${args.join(' ')}`);
    }

    case 'nuclei_scan': {
      const { target, templates = '', severity = '', rate_limit = 150, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      const args = ['-u', sanitize(target), '-rl', rate_limit, '-silent'];
      if (templates) args.push('-tags', sanitize(templates));
      if (severity) args.push('-severity', sanitize(severity));
      if (extra_args) args.push(extra_args);
      return await run('nuclei', `nuclei ${args.join(' ')}`, 300000);
    }

    case 'nikto_scan': {
      const { target, port = 80, ssl = false, tuning = '', extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      const args = ['-h', sanitize(target), '-p', port];
      if (ssl) args.push('-ssl');
      if (tuning) args.push('-Tuning', sanitize(tuning));
      if (extra_args) args.push(extra_args);
      return await run('nikto', `nikto ${args.join(' ')}`, 180000);
    }

    case 'sqlmap_test': {
      const { url, method = 'GET', data = '', cookie = '', level = 1, risk = 1, technique = '', dbms = '', batch = true, extra_args = '' } = input;
      if (!url) return { error: 'URL is required' };
      const args = ['-u', sanitize(url), '--level', level, '--risk', risk];
      if (batch) args.push('--batch');
      if (method !== 'GET') args.push('--method', sanitize(method));
      if (data) args.push('--data', sanitize(data));
      if (cookie) args.push('--cookie', sanitize(cookie));
      if (technique) args.push('--technique', sanitize(technique));
      if (dbms) args.push('--dbms', sanitize(dbms));
      if (extra_args) args.push(extra_args);
      return await run('sqlmap', `sqlmap ${args.join(' ')}`, 300000);
    }

    case 'hydra_brute': {
      const { target, service, username, password, port, extra_args = '' } = input;
      if (!target) return { error: 'Target is required' };
      if (!service) return { error: 'Service is required' };
      if (!username) return { error: 'Username is required' };
      if (!password) return { error: 'Password is required' };
      const args = [sanitize(target), sanitize(service), '-l', sanitize(username), '-P', sanitize(password)];
      if (port) args.push('-s', port);
      if (extra_args) args.push(extra_args);
      return await run('hydra', `hydra ${args.join(' ')}`, 600000);
    }

    case 'wpscan_check': {
      const { url, api_token = '', enumerate = 'vp,vt', extra_args = '' } = input;
      if (!url) return { error: 'URL is required' };
      const args = ['--url', sanitize(url), '--enumerate', sanitize(enumerate)];
      if (api_token) args.push('--api-token', sanitize(api_token));
      if (extra_args) args.push(extra_args);
      return await run('wpscan', `wpscan ${args.join(' ')}`, 300000);
    }

    default:
      return { error: `Unknown security tool: ${toolName}` };
  }
}
