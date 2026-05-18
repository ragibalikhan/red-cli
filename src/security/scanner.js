import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import chalk from 'chalk';
import { toolExists, execSafe } from './platform.js';
import { autoInstall, runWithAutoInstall, getMissingTools } from './tool-manager.js';
import { parseExploitOutput, formatExploitResult } from './exploit-parser.js';
import { XSS_PAYLOADS, SQLI_PAYLOADS, CMD_PAYLOADS, LFI_PAYLOADS, SSRF_PAYLOADS } from './exploit.js';

const SECRET_PATTERNS = {
  'AWS Access Key': /AKIA[0-9A-Z]{16}/g,
  'AWS Secret Key': /[0-9a-zA-Z\/+]{40}/g,
  'GitHub Token': /ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g,
  'OpenAI API Key': /sk-[A-Za-z0-9]{16,64}/g,
  'Anthropic API Key': /sk-ant-[A-Za-z0-9\-]{80,110}/g,
  'Stripe Secret': /sk_live_[0-9a-zA-Z]{16,64}/g,
  'Slack Token': /xox[baprs]-[0-9a-zA-Z\-]+/g,
  'Google API Key': /AIza[0-9A-Za-z\-_]{35}/g,
  'Private Key': /-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----/g,
  'JWT Secret': /JWT_SECRET\s*=\s*(?:["']?[^"'\s]+["']?)|jwt_secret\s*=\s*(?:["']?[^"'\s]+["']?)/gi,
  'JWT Token': /eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+\/=]*/g,
  'SendGrid API Key': /SG\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
  'Database URL': /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g,
  'Password in Code': /password\s*[=:]\s*["'][^"']{4,}["']/gi,
  'Hardcoded IP': /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
};

const VULNERABLE_PATTERNS = {
  'SQL Injection Risk': /(?:SELECT|INSERT|UPDATE|DELETE)[^\n"']*\+\s*[^\n;]+/gi,
  'Command Injection': /(?:eval\s*\(|exec\s*\(|system\s*\(|shell_exec\s*\(|subprocess\.call\s*\(|os\.system\s*\(|execSync\s*\()/gi,
  'XSS Risk': /innerHTML\s*=|document\.write\s*\(|dangerouslySetInnerHTML|res\.send\([^\)]*\+\s*req\.|res\.sendFile\([^\)]*\+\s*req\./gi,
  'Hardcoded Secret': /password\s*[=:]\s*["'][^"']+["']|api[_-]?key\s*[=:]\s*["'][^"']+["']|AWS_SECRET|AWS_KEY|JWT_SECRET|jwt_secret/gi,
  'Hardcoded JWT Secret': /JWT_SECRET\s*=\s*(?:["']?[^"'\s]+["']?)|jwt_secret\s*=\s*(?:["']?[^"'\s]+["']?)/gi,
  'Weak crypto': /createHash\(\s*['"]md5['"]\s*\)|hashlib\.md5\s*\(/gi,
  'Insecure Random': /Math\.random\s*\(\s*\)|random\.randint\s*\(\s*\)/gi,
  'NoSQL Injection': /find\(\s*{\s*.*\busername\b.*\bpassword\b.*\}/gi,
  'Path Traversal': /sendFile\(|res\.sendFile\(|readFileSync\([^\)]*\.\.|path\.join\([^\)]*\.\.|\b\.\.[\/\\]/gi,
  'Eval Usage': /eval\s*\(/gi,
  'Debug Code': /console\.log\(|console\.error\(|debug\s*\(/gi,
  'TODO Security': /TODO.*[Ss]ecurity|FIXME.*[Ss]ecurity|HACK.*[Ss]ecurity/gi,
  'Insecure Deserialization': /unpickle|yaml\.load\s*\(|pickle\.load\s*\(|pickle\.loads\s*\(/gi
};

export class VulnerabilityScanner {
  constructor(toolsRegistry, platform) {
    this.tools = toolsRegistry;
    this.platform = platform;
    this.findings = [];
  }

  async scan(target, options = {}) {
    const results = { target, findings: [] };
    const verbose = options.verbose || false;

    // Determine if target is network (URL/IP) or local path
    const isNetwork = this.isNetworkTarget(target);

    console.log(chalk.red(`\n╭─ 🔍 Vulnerability Scan: ${target} ────────────────────────╮`));
    console.log(chalk.red('│'));
    console.log(chalk.cyan(`│  Target type: ${isNetwork ? 'REMOTE (network scan)' : 'LOCAL (static analysis)'}`));

    if (isNetwork) {
      // Run REAL network scan
      await this.scanNetworkTarget(target, results, { verbose });
    } else {
      // Run local static code analysis
      const projectType = this.detectProjectType(target);
      console.log(chalk.cyan(`│  Project type: ${projectType}`));

      if (projectType === 'nodejs') {
        await this.scanNodeDeps(target, results);
      } else if (projectType === 'python') {
        await this.scanPythonDeps(target, results);
      }

      await this.scanCode(target, results);
    }

    console.log(chalk.red('│'));
    console.log(chalk.red('╰──────────────────────────────────────────────────────────╯'));

    results.findings = this.summarizeFindings(results.findings);
    this.displayFindings(results.findings);
    this.findings = results.findings;
    return results;
  }

  // Determine if target is a URL, IP address, or hostname (network) vs local path
  isNetworkTarget(target) {
    if (!target) return false;
    const t = target.trim();
    // URL pattern
    if (t.startsWith('http://') || t.startsWith('https://')) return true;
    // IP address pattern (with optional port)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(t)) return true;
    // Domain pattern (no slashes, no leading ./ or /)
    if (!t.startsWith('./') && !t.startsWith('/') && !t.includes(':\\') && !existsSync(t)) {
      // If it doesn't exist as a local path, treat as network
      return true;
    }
    return false;
  }

  // Display findings with severity colors
  displayFindings(findings) {
    if (findings.length === 0) {
      console.log(chalk.green('\n  ✅ No vulnerabilities found\n'));
      return;
    }

    const bySeverity = {
      critical: findings.filter(f => f.severity === 'critical'),
      high: findings.filter(f => f.severity === 'high'),
      medium: findings.filter(f => f.severity === 'medium'),
      low: findings.filter(f => f.severity === 'low'),
      info: findings.filter(f => f.severity === 'info'),
    };

    const colors = {
      critical: chalk.red.bold,
      high: chalk.yellow.bold,
      medium: chalk.blue.bold,
      low: chalk.cyan,
      info: chalk.dim,
    };

    console.log(chalk.cyan('\n  Findings:'));
    for (const [sev, items] of Object.entries(bySeverity)) {
      if (items.length === 0) continue;
      console.log(colors[sev](`  ${sev.toUpperCase()}: ${items.length}`));
      items.forEach(f => {
        console.log(`    • ${f.title}`);
        if (f.detail) console.log(chalk.dim(`      ${f.detail}`));
        if (f.fix) console.log(chalk.green(`      Fix: ${f.fix}`));
      });
    }

    const total = findings.filter(f => f.severity !== 'info').length;
    console.log(chalk.cyan(`\n  Total issues (excluding info): ${total}\n`));
  }

  // REAL NETWORK SCANNING
  async scanNetworkTarget(target, results, options = {}) {
    const { verbose = false } = options;
    const hostname = this.extractHostname(target);
    const isHTTPS = target.startsWith('https') || target.includes(':443');
    const port = isHTTPS ? 443 : 80;

    console.log(chalk.cyan(`│  Host: ${hostname}`));
    console.log(chalk.red('│'));

    if (verbose) {
      console.log(chalk.dim('│  🔧 Verbose mode: showing tool execution'));
      console.log(chalk.red('│'));
    }

    // Step 1: HTTP Probe
    await this.step('HTTP Probe', async () => {
      if (verbose) console.log(chalk.dim(`│     cmd: curl -sI "${target}"`));
      const httpResult = await this.httpProbe(target);
      results.findings.push(...httpResult.findings);
      return httpResult.summary;
    }, { verbose, tool: 'curl' });

    // Step 2: Security Headers Check
    await this.step('Security Headers', async () => {
      if (verbose) console.log(chalk.dim(`│     cmd: curl -sI "${target}"`));
      const headersResult = await this.checkSecurityHeaders(target);
      results.findings.push(...headersResult.findings);
      return headersResult.summary;
    }, { verbose, tool: 'curl' });

    // Step 3: SSL/TLS Check (if HTTPS)
    if (isHTTPS || port === 443) {
      await this.step('SSL/TLS Analysis', async () => {
        if (verbose) console.log(chalk.dim(`│     cmd: openssl s_client -connect ${hostname}:443`));
        const sslResult = await this.checkSSL(hostname, 443);
        results.findings.push(...sslResult.findings);
        return sslResult.summary;
      }, { verbose, tool: 'openssl' });
    }

    // Step 4: Port Scan
    await this.step('Port Scan', async () => {
      if (toolExists('nmap')) {
        if (verbose) console.log(chalk.dim(`│     cmd: nmap -sV -sC --top-ports 1000 ${hostname}`));
      } else {
        if (verbose) console.log(chalk.dim(`│     cmd: curl (fallback port check)`));
      }
      const portResult = await this.portScan(hostname);
      results.findings.push(...portResult.findings);
      return portResult.summary;
    }, { verbose, tool: toolExists('nmap') ? 'nmap' : 'curl' });

    // Step 5: Sensitive Paths Discovery
    await this.step('Sensitive Paths', async () => {
      if (verbose) console.log(chalk.dim(`│     cmd: curl (checking 20 paths)`));
      const pathsResult = await this.discoverPaths(target);
      results.findings.push(...pathsResult.findings);
      return pathsResult.summary;
    }, { verbose, tool: 'curl' });

    // Step 6: Technology Detection
    await this.step('Tech Detection', async () => {
      if (verbose) console.log(chalk.dim(`│     cmd: curl -sI + curl -sL`));
      const techResult = await this.detectTech(target);
      results.findings.push(...techResult.findings);
      return techResult.summary;
    }, { verbose, tool: 'curl' });

    // Step 7: Nikto scan (if installed)
    if (toolExists('nikto')) {
      await this.step('Nikto Scan', async () => {
        if (verbose) console.log(chalk.dim(`│     cmd: nikto -h "${target}"`));
        const niktoResult = await this.runNikto(target);
        results.findings.push(...niktoResult.findings);
        return niktoResult.summary;
      }, { verbose, tool: 'nikto' });
    }

    // Step 8: Nuclei scan (if installed)
    if (toolExists('nuclei')) {
      await this.step('Nuclei Templates', async () => {
        if (verbose) console.log(chalk.dim(`│     cmd: nuclei -u "${target}"`));
        const nucleiResult = await this.runNuclei(target);
        results.findings.push(...nucleiResult.findings);
        return nucleiResult.summary;
      }, { verbose, tool: 'nuclei' });
    }

    // Step 9: Directory brute-forcing
    await this.step('Directory Scan', async () => {
      if (verbose) console.log(chalk.dim(`│     cmd: Directory brute-forcing`));
      const dirResults = await this.bruteForceDirectories(target);
      if (dirResults && dirResults.findings) {
        results.findings.push(...dirResults.findings);
      }
      return dirResults?.summary || 'completed';
    }, { verbose, tool: 'curl' });

    // Step 10: Optional exploitation testing (can be enabled)
    // Uncomment to enable automated exploitation testing
    // const exploitResults = await this.testVulnerabilities(target, { testXSS: true, testSQLi: false });
    // results.findings.push(...exploitResults.findings);
  }

  // Step execution with timing and optional verbose tool display
  async step(name, fn, options = {}) {
    const { verbose = false, tool = null } = options;

    // Show tool being executed in verbose mode
    if (verbose && tool) {
      console.log(chalk.cyan(`│  ⚡ Running: ${chalk.yellow(tool)}`));
    }

    process.stdout.write(chalk.dim(`│  ▶ ${name}...`));
    const start = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - start;
      process.stdout.write(chalk.green(` ✅ (${ms}ms)\n`));
      if (result && result !== 'N/A' && result !== 'failed') {
        const lines = result.split('\n').slice(0, 3);
        lines.forEach(l => console.log(chalk.dim(`│     ${l}`)));
      }
      return result;
    } catch (e) {
      process.stdout.write(chalk.red(` ❌\n`));
      console.log(chalk.dim(`│     ${e.message || 'Error'}`));
      return null;
    }
  }

  // Extract hostname from URL or IP
  extractHostname(target) {
    try {
      const urlStr = target.startsWith('http') ? target : `http://${target}`;
      const url = new URL(urlStr);
      return url.hostname;
    } catch {
      return target.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
    }
  }

  // HTTP Probe - uses curl (always available)
  async httpProbe(target) {
    const findings = [];
    try {
      const result = execSafe(
        `curl -sI --connect-timeout 10 --max-time 15 -L "${target}" 2>&1`,
        { timeout: 20000 }
      );

      const statusMatch = result.match(/HTTP\/[\d.]+ (\d+)/);
      const status = statusMatch?.[1] || 'unknown';

      findings.push({
        type: 'http',
        severity: 'info',
        title: `HTTP Status: ${status}`,
        detail: `Response code: ${status}`
      });

      // Check for server header (info disclosure)
      const serverMatch = result.match(/[Ss]erver: (.+)/i);
      if (serverMatch) {
        findings.push({
          type: 'info_disclosure',
          severity: 'low',
          title: 'Server Version Disclosure',
          detail: `Server header reveals: ${serverMatch[1].trim()}`,
          fix: 'Remove or obscure the Server header'
        });
      }

      // Check for X-Powered-By
      const poweredBy = result.match(/X-Powered-By: (.+)/i);
      if (poweredBy) {
        findings.push({
          type: 'info_disclosure',
          severity: 'low',
          title: 'Technology Disclosure',
          detail: `X-Powered-By: ${poweredBy[1].trim()}`,
          fix: 'Remove X-Powered-By header'
        });
      }

      // Check for X-AspNet-Version
      const aspVersion = result.match(/X-AspNet-Version: (.+)/i);
      if (aspVersion) {
        findings.push({
          type: 'info_disclosure',
          severity: 'low',
          title: 'ASP.NET Version Disclosure',
          detail: `X-AspNet-Version: ${aspVersion[1].trim()}`
        });
      }

      return { findings, summary: `HTTP ${status}, ${findings.length} findings` };
    } catch (e) {
      findings.push({
        type: 'error',
        severity: 'info',
        title: 'HTTP probe failed',
        detail: e.message
      });
      return { findings, summary: 'failed' };
    }
  }

  // Security Headers Check - built-in
  async checkSecurityHeaders(target) {
    const findings = [];

    try {
      const result = execSafe(
        `curl -sI --connect-timeout 10 --max-time 15 "${target}" 2>&1`,
        { timeout: 20000 }
      );

      const headerNames = {};
      result.split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const name = line.substring(0, colonIdx).trim().toLowerCase();
          const value = line.substring(colonIdx + 1).trim();
          headerNames[name] = value;
        }
      });

      const required = {
        'strict-transport-security': { severity: 'high', fix: 'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains' },
        'content-security-policy': { severity: 'high', fix: 'Add a Content-Security-Policy header' },
        'x-frame-options': { severity: 'medium', fix: 'Add: X-Frame-Options: DENY' },
        'x-content-type-options': { severity: 'medium', fix: 'Add: X-Content-Type-Options: nosniff' },
        'referrer-policy': { severity: 'low', fix: 'Add: Referrer-Policy: strict-origin-when-cross-origin' },
        'permissions-policy': { severity: 'low', fix: 'Add a Permissions-Policy header' },
      };

      for (const [header, info] of Object.entries(required)) {
        if (!headerNames[header]) {
          findings.push({
            type: 'security_header',
            severity: info.severity,
            title: `Missing Security Header: ${header}`,
            detail: `The ${header} header is not set`,
            fix: info.fix
          });
        }
      }

      return { findings, summary: `${findings.length} missing security headers` };
    } catch (e) {
      return { findings, summary: 'failed' };
    }
  }

  // SSL/TLS Check - uses openssl (almost always available)
  async checkSSL(hostname, port = 443) {
    const findings = [];

    try {
      const certInfo = execSafe(
        `echo | openssl s_client -connect ${hostname}:${port} -servername ${hostname} 2>/dev/null | openssl x509 -noout -dates -subject -issuer 2>/dev/null`
      );

      if (!certInfo) {
        findings.push({ type: 'ssl', severity: 'high', title: 'SSL/TLS not available or certificate invalid' });
        return { findings, summary: 'SSL not available' };
      }

      // Check expiry
      const expiryMatch = certInfo.match(/notAfter=(.+)/);
      if (expiryMatch) {
        const expiry = new Date(expiryMatch[1]);
        const daysLeft = Math.floor((expiry - Date.now()) / 86400000);
        if (daysLeft < 30) {
          findings.push({
            type: 'ssl',
            severity: daysLeft < 0 ? 'critical' : 'high',
            title: daysLeft < 0 ? 'SSL Certificate EXPIRED' : `SSL Certificate expires in ${daysLeft} days`,
            detail: `Expires: ${expiry.toDateString()}`,
            fix: 'Renew SSL certificate immediately'
          });
        }
      }

      // Check subject
      const subjectMatch = certInfo.match(/subject=(.+)/);
      if (subjectMatch) {
        findings.push({
          type: 'ssl',
          severity: 'info',
          title: `SSL Certificate: ${subjectMatch[1].trim()}`
        });
      }

      return { findings, summary: `SSL checked, ${findings.length} issues` };
    } catch (e) {
      return { findings: [{ type: 'ssl', severity: 'info', title: 'SSL check failed', detail: e.message }], summary: 'failed' };
    }
  }

  // Port Scan - nmap if available, else curl fallback
  async portScan(hostname) {
    const findings = [];

    if (toolExists('nmap')) {
      try {
        const result = execSafe(
          `nmap -sV -sC --top-ports 1000 -T4 --open ${hostname} 2>&1`,
          { timeout: 120000 }
        );

        const openPorts = [];
        const lines = result.split('\n');
        for (const line of lines) {
          const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+open\s+(.+)/);
          if (portMatch) {
            const [, port, proto, service] = portMatch;
            openPorts.push({ port: parseInt(port), proto, service: service.trim() });

            const dangerousPorts = {
              21: 'FTP - often misconfigured',
              23: 'Telnet - unencrypted',
              3306: 'MySQL exposed - should be internal only',
              5432: 'PostgreSQL exposed - should be internal only',
              6379: 'Redis exposed - often has no auth',
              27017: 'MongoDB exposed - often has no auth',
              9200: 'Elasticsearch exposed - often has no auth',
              2375: 'Docker daemon exposed - critical',
            };

            if (dangerousPorts[port]) {
              findings.push({
                type: 'port',
                severity: 'high',
                title: `Dangerous Port Open: ${port}/${proto}`,
                detail: dangerousPorts[port],
                fix: `Firewall port ${port} from public internet`
              });
            }
          }
        }

        findings.push({
          type: 'port',
          severity: 'info',
          title: `Open Ports: ${openPorts.map(p => p.port).join(', ') || 'none'}`,
          detail: openPorts.map(p => `${p.port}/${p.proto}: ${p.service}`).join('\n')
        });

        return { findings, summary: `${openPorts.length} open ports found` };
      } catch (e) {
        return { findings, summary: 'nmap failed' };
      }
    } else {
      // Fallback: check common ports with curl (works on all platforms)
      const commonPorts = [80, 443, 8080, 8443, 22, 21, 23, 25, 3306, 5432, 6379, 27017];
      const open = [];

      for (const port of commonPorts) {
        const result = execSafe(
          `curl -sI --connect-timeout 3 --max-time 5 http://${hostname}:${port} 2>&1 | head -1`,
          { timeout: 8000 }
        );
        if (result && (result.includes('HTTP') || result.includes('Connection'))) {
          open.push(port);
        }
      }

      findings.push({
        type: 'port',
        severity: 'info',
        title: `Open Ports (basic): ${open.join(', ') || 'none'}`,
        detail: 'Install nmap for comprehensive scanning'
      });

      return { findings, summary: `Basic check: ${open.length} ports open` };
    }
  }

  // Sensitive Paths Discovery - built-in
  async discoverPaths(target) {
    const findings = [];

    const sensitivePaths = [
      { path: '/.git/config', severity: 'critical', title: 'Git repository exposed' },
      { path: '/.env', severity: 'critical', title: '.env file exposed' },
      { path: '/.env.backup', severity: 'critical', title: '.env.backup exposed' },
      { path: '/wp-config.php', severity: 'critical', title: 'WordPress config exposed' },
      { path: '/config.php', severity: 'critical', title: 'Config file exposed' },
      { path: '/database.yml', severity: 'critical', title: 'Database config exposed' },
      { path: '/admin', severity: 'medium', title: 'Admin panel accessible' },
      { path: '/administrator', severity: 'medium', title: 'Administrator panel accessible' },
      { path: '/phpmyadmin', severity: 'high', title: 'phpMyAdmin exposed' },
      { path: '/adminer.php', severity: 'high', title: 'Adminer DB tool exposed' },
      { path: '/.DS_Store', severity: 'low', title: 'DS_Store file exposed' },
      { path: '/robots.txt', severity: 'info', title: 'robots.txt found' },
      { path: '/sitemap.xml', severity: 'info', title: 'sitemap.xml found' },
      { path: '/api/v1', severity: 'info', title: 'API v1 endpoint found' },
      { path: '/graphql', severity: 'info', title: 'GraphQL endpoint found' },
      { path: '/swagger', severity: 'medium', title: 'Swagger UI exposed' },
      { path: '/swagger-ui.html', severity: 'medium', title: 'Swagger UI exposed' },
      { path: '/actuator', severity: 'high', title: 'Spring Boot Actuator exposed' },
      { path: '/actuator/env', severity: 'critical', title: 'Spring Actuator /env exposed' },
      { path: '/telescope', severity: 'medium', title: 'Laravel Telescope exposed' },
    ];

    const baseURL = target.replace(/\/$/, '');
    const batchSize = 5;

    for (let i = 0; i < sensitivePaths.length; i += batchSize) {
      const batch = sensitivePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(async ({ path, severity, title }) => {
        const url = baseURL + path;
        const status = await this.getHTTPStatus(url);

        if (status && status !== 404 && status !== 410) {
          findings.push({
            type: 'path',
            severity,
            title,
            detail: `${url} returned HTTP ${status}`,
            fix: severity === 'critical' ? 'Remove this file or block public access immediately' : 'Review if this should be publicly accessible'
          });

          const color = severity === 'critical' ? chalk.red : severity === 'high' ? chalk.yellow : chalk.cyan;
          console.log(chalk.dim(`│     🚨 Found: ${path} [${status}]`));
        }
      }));
    }

    return { findings, summary: `${findings.length} sensitive paths found` };
  }

  async getHTTPStatus(url) {
    try {
      const result = execSafe(
        `curl -sI --connect-timeout 5 --max-time 8 -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null`,
        { timeout: 15000 }
      );
      const code = parseInt(result.trim());
      return isNaN(code) ? null : code;
    } catch {
      return null;
    }
  }

  // Tech Stack Detection - built-in
  async detectTech(target) {
    const findings = [];

    try {
      const headers = execSafe(
        `curl -sI --connect-timeout 10 "${target}" 2>/dev/null`,
        { timeout: 15000 }
      );

      const html = execSafe(
        `curl -sL --connect-timeout 10 --max-time 15 "${target}" 2>/dev/null | head -c 5000`,
        { timeout: 20000 }
      );

      const tech = [];

      if (headers.includes('X-Powered-By: PHP')) tech.push('PHP');
      if (headers.includes('X-Powered-By: Express')) tech.push('Express.js');
      if (headers.includes('X-Powered-By: ASP.NET')) tech.push('ASP.NET');
      if (headers.match(/[Ss]erver: nginx/)) tech.push('nginx');
      if (headers.match(/[Ss]erver: Apache/)) tech.push('Apache');
      if (headers.match(/[Ss]erver: IIS/)) tech.push('IIS');
      if (headers.includes('X-Generator: WordPress')) tech.push('WordPress');
      if (headers.includes('x-shopify')) tech.push('Shopify');
      if (headers.includes('x-cloudflare')) tech.push('Cloudflare');

      if (html.includes('wp-content')) tech.push('WordPress');
      if (html.includes('Drupal')) tech.push('Drupal');
      if (html.includes('Joomla')) tech.push('Joomla');
      if (html.includes('Laravel')) tech.push('Laravel');
      if (html.includes('__NEXT_DATA__')) tech.push('Next.js');
      if (html.includes('ng-version')) tech.push('Angular');
      if (html.includes('data-reactroot')) tech.push('React');
      if (html.includes('__vue')) tech.push('Vue.js');
      if (html.includes('data-cf-beacon')) tech.push('Cloudflare');

      if (tech.length > 0) {
        findings.push({
          type: 'tech',
          severity: 'info',
          title: `Technologies: ${tech.join(', ')}`,
          detail: 'Use this to look up known CVEs'
        });
      }

      return { findings, summary: `Detected: ${tech.join(', ') || 'unknown'}` };
    } catch (e) {
      return { findings, summary: 'failed' };
    }
  }

  // Nikto scan (if installed)
  async runNikto(target) {
    const findings = [];
    try {
      const result = execSafe(
        `nikto -h "${target}" -T 1,2,3,4 -Format txt 2>&1 | head -50`,
        { timeout: 60000 }
      );

      if (result && result.includes('-')) {
        findings.push({
          type: 'nikto',
          severity: 'medium',
          title: 'Nikto findings available',
          detail: result.substring(0, 500)
        });
      }

      return { findings, summary: result ? 'Nikto scan complete' : 'No findings' };
    } catch (e) {
      return { findings, summary: 'Nikto failed' };
    }
  }

  // Nuclei scan (if installed)
  async runNuclei(target) {
    const findings = [];
    try {
      const result = execSafe(
        `nuclei -u "${target}" -silent -json 2>&1 | head -20`,
        { timeout: 60000 }
      );

      if (result) {
        findings.push({
          type: 'nuclei',
          severity: 'info',
          title: 'Nuclei template scan complete'
        });
      }

      return { findings, summary: 'Nuclei scan complete' };
    } catch (e) {
      return { findings, summary: 'Nuclei failed' };
    }
  }

  // Automated exploitation testing with result verification
  async testVulnerabilities(target, options = {}) {
    const findings = [];
    const { testXSS = false, testSQLi = false, testLFI = false, testSSRF = false } = options;

    console.log(chalk.red.bold('\n  ⚡ Running Exploitation Tests...\n'));

    // XSS Testing
    if (testXSS) {
      console.log(chalk.cyan('  Testing XSS vulnerabilities...'));
      const xssResults = await this.testXSS(target);
      findings.push(...xssResults);
    }

    // SQL Injection Testing
    if (testSQLi) {
      console.log(chalk.cyan('  Testing SQL Injection...'));
      const sqliResults = await this.testSQLi(target);
      findings.push(...sqliResults);
    }

    // LFI Testing
    if (testLFI) {
      console.log(chalk.cyan('  Testing Local File Inclusion...'));
      const lfiResults = await this.testLFI(target);
      findings.push(...lfiResults);
    }

    // SSRF Testing
    if (testSSRF) {
      console.log(chalk.cyan('  Testing SSRF...'));
      const ssrfResults = await this.testSSRF(target);
      findings.push(...ssrfResults);
    }

    return { findings, summary: `${findings.length} vulnerabilities confirmed` };
  }

  // Test for XSS vulnerabilities
  async testXSS(target) {
    const findings = [];
    const payloads = XSS_PAYLOADS.slice(0, 10); // Test first 10 payloads
    const params = ['q', 'search', 'query', 'id', 'name', 'input', 's'];

    for (const param of params) {
      for (const payload of payloads) {
        try {
          const encodedPayload = encodeURIComponent(payload);
          const testURL = `${target}?${param}=${encodedPayload}`;
          const result = execSafe(
            `curl -sL --max-time 10 "${testURL}" 2>&1`,
            { timeout: 15000 }
          );

          // Verify exploitation result
          const parsed = parseExploitOutput('xss', result, target);
          if (parsed.exploited) {
            findings.push({
              type: 'exploitation',
              severity: 'high',
              title: `XSS Vulnerability Confirmed`,
              detail: `Parameter: ${param}\nPayload: ${payload}\nConfidence: ${parsed.confidence}`,
              finding: parsed.findings[0],
              exploited: true
            });
            console.log(chalk.green(`    ✅ XSS confirmed in parameter '${param}'`));
            break;
          }
        } catch {}
      }
      if (findings.length > 0) break;
    }

    return findings;
  }

  // Test for SQL Injection vulnerabilities
  async testSQLi(target) {
    const findings = [];
    const payloads = SQLI_PAYLOADS.slice(0, 10);
    const params = ['id', 'q', 'search', 'user', 'page', 'cat'];

    for (const param of params) {
      for (const payload of payloads) {
        try {
          const encodedPayload = encodeURIComponent(payload);
          const testURL = `${target}?${param}=${encodedPayload}`;
          const result = execSafe(
            `curl -sL --max-time 10 "${testURL}" 2>&1`,
            { timeout: 15000 }
          );

          // Verify exploitation result
          const parsed = parseExploitOutput('sqli', result, target);
          if (parsed.exploited) {
            findings.push({
              type: 'exploitation',
              severity: 'critical',
              title: `SQL Injection Confirmed`,
              detail: `Parameter: ${param}\nPayload: ${payload}\nConfidence: ${parsed.confidence}`,
              finding: parsed.findings[0],
              exploited: true
            });
            console.log(chalk.green(`    ✅ SQL Injection confirmed in parameter '${param}'`));
            break;
          }
        } catch {}
      }
      if (findings.length > 0) break;
    }

    return findings;
  }

  // Test for LFI vulnerabilities
  async testLFI(target) {
    const findings = [];
    const payloads = LFI_PAYLOADS.slice(0, 8);
    const params = ['file', 'path', 'page', 'include', 'src', 'doc', 'template'];

    for (const param of params) {
      for (const payload of payloads) {
        try {
          const encodedPayload = encodeURIComponent(payload);
          const testURL = `${target}?${param}=${encodedPayload}`;
          const result = execSafe(
            `curl -sL --max-time 10 "${testURL}" 2>&1`,
            { timeout: 15000 }
          );

          // Verify exploitation result
          const parsed = parseExploitOutput('lfi', result, target);
          if (parsed.exploited) {
            findings.push({
              type: 'exploitation',
              severity: 'high',
              title: `LFI Vulnerability Confirmed`,
              detail: `Parameter: ${param}\nPayload: ${payload}\nConfidence: ${parsed.confidence}`,
              finding: parsed.findings[0],
              exploited: true
            });
            console.log(chalk.green(`    ✅ LFI confirmed in parameter '${param}'`));
            break;
          }
        } catch {}
      }
      if (findings.length > 0) break;
    }

    return findings;
  }

  // Test for SSRF vulnerabilities
  async testSSRF(target) {
    const findings = [];
    const payloads = SSRF_PAYLOADS.slice(0, 5);
    const params = ['url', 'redirect', 'next', 'page', 'file', 'src', 'href', 'u'];

    for (const param of params) {
      for (const payload of payloads) {
        try {
          const encodedPayload = encodeURIComponent(payload);
          const testURL = `${target}?${param}=${encodedPayload}`;
          const result = execSafe(
            `curl -sL --max-time 15 "${testURL}" 2>&1`,
            { timeout: 20000 }
          );

          // Verify exploitation result
          const parsed = parseExploitOutput('ssrf', result, target);
          if (parsed.exploited) {
            findings.push({
              type: 'exploitation',
              severity: 'critical',
              title: `SSRF Vulnerability Confirmed`,
              detail: `Parameter: ${param}\nPayload: ${payload}\nConfidence: ${parsed.confidence}`,
              finding: parsed.findings[0],
              exploited: true
            });
            console.log(chalk.green(`    ✅ SSRF confirmed in parameter '${param}'`));
            break;
          }
        } catch {}
      }
      if (findings.length > 0) break;
    }

    return findings;
  }

  // Directory brute-forcing
  async bruteForceDirectories(target) {
    const findings = [];
    const wordlist = [
      'admin', 'backup', 'config', 'dashboard', 'data', 'db', 'debug', 'dev',
      'files', 'images', 'include', 'login', 'logs', 'phpinfo', 'private', 'public',
      'scripts', 'secret', 'server-status', 'sql', 'static', 'test', 'uploads',
      'wp-admin', 'wp-content', 'xmlrpc', 'api', 'v1', 'v2', 'console', 'management'
    ];

    console.log(chalk.cyan('  Running directory brute-forcing...'));

    const baseURL = target.replace(/\/$/, '');
    const foundDirs = [];

    for (const dir of wordlist) {
      const url = `${baseURL}/${dir}`;
      const status = await this.getHTTPStatus(url);
      if (status && status !== 404) {
        foundDirs.push({ path: `/${dir}`, status });
      }
    }

    if (foundDirs.length > 0) {
      findings.push({
        type: 'directory',
        severity: 'medium',
        title: 'Directories Discovered',
        detail: foundDirs.map(d => `${d.path} [${d.status}]`).join('\n')
      });
      console.log(chalk.green(`    ✅ Found ${foundDirs.length} directories`));
    }

    return findings;
  }

  // Subdomain enumeration
  async enumerateSubdomains(domain) {
    const findings = [];
    const subdomains = [
      'www', 'mail', 'ftp', 'localhost', 'webmail', 'smtp', 'pop', 'ns1', 'webdisk',
      'ns2', 'cpanel', 'whm', 'autodiscover', 'autoconfig', 'm', 'imap', 'test', 'ns',
      'blog', 'pop3', 'dev', 'www2', 'admin', 'forum', 'news', 'vpn', 'ns3', 'mail2',
      'new', 'mysql', 'old', 'lists', 'support', 'mobile', 'mx', 'static', 'docs',
      'beta', 'shop', 'sql', 'secure', 'demo', 'server', 'cdn', 'stats', 'logs'
    ];

    console.log(chalk.cyan('  Running subdomain enumeration...'));

    const found = [];
    for (const sub of subdomains) {
      const host = `${sub}.${domain}`;
      const result = execSafe(
        `curl -sI --connect-timeout 5 --max-time 8 http://${host} 2>&1 | head -1`,
        { timeout: 12000 }
      );
      if (result && result.includes('HTTP')) {
        found.push(host);
      }
    }

    if (found.length > 0) {
      findings.push({
        type: 'subdomain',
        severity: 'medium',
        title: 'Subdomains Discovered',
        detail: found.join('\n')
      });
      console.log(chalk.green(`    ✅ Found ${found.length} subdomains`));
    }

    return findings;
  }

  detectProjectType(path) {
    // Don't try to detect project type for network targets
    if (this.isNetworkTarget(path)) return 'network';
    if (existsSync(join(path, 'package.json'))) return 'nodejs';
    if (existsSync(join(path, 'requirements.txt')) ||
      existsSync(join(path, 'pyproject.toml'))) return 'python';
    if (existsSync(join(path, 'go.mod'))) return 'go';
    if (existsSync(join(path, 'Cargo.toml'))) return 'rust';
    return 'generic';
  }

  async scanNodeDeps(path, results) {
    console.log(chalk.dim('│  ▶ Running npm audit...'));
    try {
      const audit = execSync('npm audit --json 2>/dev/null', {
        encoding: 'utf-8',
        cwd: path,
        timeout: 30000
      });

      const parsed = JSON.parse(audit);
      const vulns = parsed.vulnerabilities || {};

      for (const [severity, items] of Object.entries(vulns)) {
        const list = Object.values(items);
        for (const v of list) {
          results.findings.push({
            type: 'dependency',
            severity: severity === 'critical' ? 'critical' :
              severity === 'high' ? 'high' :
                severity === 'medium' ? 'medium' : 'low',
            title: v.name,
            message: v.title || v.name,
            via: v.via?.[0]?.title || 'npm audit'
          });
        }
      }

      console.log(chalk.green('│  ✅ npm audit: ') + `${results.findings.length} vulnerabilities found`);
    } catch {
      console.log(chalk.dim('│  ⚪ npm audit: Not available'));
    }

    console.log(chalk.dim('│  ▶ Checking for secrets...'));
    const secrets = await this.scanSecrets(path);
    results.findings.push(...secrets);
    console.log(chalk.green('│  ✅ Secrets scan: ') + `${secrets.length} findings`);
  }

  async scanPythonDeps(path, results) {
    console.log(chalk.dim('│  ▶ Running pip-audit...'));
    try {
      const audit = execSync('pip-audit --format=json 2>/dev/null', {
        encoding: 'utf-8',
        cwd: path,
        timeout: 30000
      });

      const parsed = JSON.parse(audit);
      for (const [name, vuln] of Object.entries(parsed)) {
        results.findings.push({
          type: 'dependency',
          severity: vuln.vulns ? 'high' : 'low',
          title: name,
          message: vuln.vulns ? Object.keys(vuln.vulns).join(', ') : 'No known vulns'
        });
      }
      console.log(chalk.green('│  ✅ pip-audit complete'));
    } catch {
      console.log(chalk.dim('│  ⚪ pip-audit: Not available (pip install pip-audit)'));
    }
  }

  async scanCode(path, results) {
    console.log(chalk.dim('│  ▶ Static code analysis...'));

    if (this.tools.isToolAvailable('code_analysis', 'semgrep')) {
      try {
        const output = execSync(`semgrep --json --quiet ${path} 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 60000
        });

        const parsed = JSON.parse(output);
        for (const result of parsed.results || []) {
          results.findings.push({
            type: 'code',
            severity: result.extra.severity === 'ERROR' ? 'high' : 'medium',
            title: result.check_id,
            file: result.path,
            line: result.start.line,
            message: result.extra.message
          });
        }
        console.log(chalk.green('│  ✅ semgrep: ') + `${parsed.results?.length || 0} findings`);
      } catch {
        console.log(chalk.dim('│  ⚪ semgrep: Failed'));
      }
    }

    if (this.tools.isToolAvailable('code_analysis', 'bandit')) {
      try {
        const banditOutput = execSync(`bandit -r ${path} -f json 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 60000
        });
        const parsed = JSON.parse(banditOutput);
        for (const issue of parsed.results || []) {
          results.findings.push({
            type: 'code',
            severity: 'high',
            title: issue.test_name || 'bandit finding',
            file: issue.filename,
            line: issue.line_number,
            message: issue.issue_text
          });
        }
        console.log(chalk.green('│  ✅ bandit: ') + `${parsed.results?.length || 0} findings`);
      } catch {
        console.log(chalk.dim('│  ⚪ bandit: Failed')); 
      }
    }

    const patternFindings = this.scanCodePatterns(path);
    results.findings.push(...patternFindings);
    console.log(chalk.green('│  ✅ Pattern scan: ') + `${patternFindings.length} findings`);
  }

  scanCodePatterns(path) {
    const findings = [];
    // Include HTML files for frontend vulnerability scanning
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.html', '.htm', '.vue', '.svelte'];

    // HTML-specific vulnerability patterns
    const HTML_PATTERNS = {
      'XSS via innerHTML': /innerHTML\s*=\s*[^=]/gi,
      'XSS via document.write': /document\.write\s*\(/gi,
      'XSS via eval': /eval\s*\(/gi,
      'Inline Event Handler': /on(click|load|error|mouseover|submit|change|focus|blur)\s*=/gi,
      'Insecure Iframe': /<iframe[^>]*src\s*=\s*["'][^"']*["']/gi,
      'Insecure Form Action': /<form[^>]*action\s*=\s*["']http:/gi,
      'Missing CSP Meta': /<meta[^>]*http-equiv\s*=\s*["']Content-Security-Policy/gi,
      'Insecure Cookie': /Set-Cookie[^;]*Secure[^;]*/gi,
      'Deprecated document.write': /document\.write\s*\(/gi,
      'Insecure URL Protocol': /href\s*=\s*["']javascript:/gi,
    };

    // HTML syntax bug patterns
    const HTML_BUG_PATTERNS = {
      'Unclosed tag': /<([a-zA-Z][a-zA-Z0-9]*)[^>]*>(?!.*<\/\1>)/gi,
      'Unclosed script': /<script[^>]*>[^<]*<[^s]/gi,
      'Duplicate ID': /id\s*=\s*["']([^"']+)["'][^>]*[^>]*id\s*=\s*["']\1["']/gi,
    };

    // Handle single file path - check if path is a file, not directory
    if (existsSync(path) && statSync(path).isFile()) {
      const ext = extname(path).toLowerCase();
      if (extensions.includes(ext)) {
        try {
          const content = readFileSync(path, 'utf-8');

          // Scan with JavaScript patterns
          for (const [patternName, regex] of Object.entries(VULNERABLE_PATTERNS)) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(content)) !== null) {
              const lines = content.substring(0, match.index).split('\n');
              findings.push({
                type: 'code_pattern',
                severity: patternName.includes('Injection') || patternName.includes('XSS') ? 'high' : 'medium',
                title: patternName,
                file: path,
                line: lines.length,
                snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
              });
            }
          }

          // HTML-specific patterns
          if (['.html', '.htm', '.vue', '.svelte'].includes(ext)) {
            for (const [patternName, regex] of Object.entries(HTML_PATTERNS)) {
              regex.lastIndex = 0;
              let match;
              while ((match = regex.exec(content)) !== null) {
                const lines = content.substring(0, match.index).split('\n');
                findings.push({
                  type: 'html_vulnerability',
                  severity: patternName.includes('XSS') ? 'high' : 'medium',
                  title: patternName,
                  file: path,
                  line: lines.length,
                  snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
                });
              }
            }

            for (const [patternName, regex] of Object.entries(HTML_BUG_PATTERNS)) {
              regex.lastIndex = 0;
              let match;
              while ((match = regex.exec(content)) !== null) {
                const lines = content.substring(0, match.index).split('\n');
                findings.push({
                  type: 'html_bug',
                  severity: 'low',
                  title: patternName,
                  file: path,
                  line: lines.length,
                  snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
                });
              }
            }
          }
        } catch {}
      }
      return findings;
    }

    // It's a directory - use scanDir
    const scanDir = (dir) => {
      try {
        const items = readdirSync(dir);
        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item === 'dist') continue;

          const fullPath = join(dir, item);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (extensions.includes(extname(item))) {
            try {
              const content = readFileSync(fullPath, 'utf-8');
              const ext = extname(item).toLowerCase();

              // Scan with JavaScript patterns for all files
              for (const [patternName, regex] of Object.entries(VULNERABLE_PATTERNS)) {
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(content)) !== null) {
                  const lines = content.substring(0, match.index).split('\n');
                  findings.push({
                    type: 'code_pattern',
                    severity: patternName.includes('Injection') || patternName.includes('XSS') ? 'high' : 'medium',
                    title: patternName,
                    file: fullPath,
                    line: lines.length,
                    snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
                  });
                }
              }

              // Additional HTML-specific patterns
              if (ext === '.html' || ext === '.htm' || ext === '.vue' || ext === '.svelte') {
                // XSS vulnerabilities in HTML
                for (const [patternName, regex] of Object.entries(HTML_PATTERNS)) {
                  regex.lastIndex = 0;
                  let match;
                  while ((match = regex.exec(content)) !== null) {
                    const lines = content.substring(0, match.index).split('\n');
                    const severity = patternName.includes('XSS') ? 'high' : 'medium';
                    findings.push({
                      type: 'html_vulnerability',
                      severity,
                      title: patternName,
                      file: fullPath,
                      line: lines.length,
                      snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
                    });
                  }
                }

                // HTML syntax bugs
                for (const [patternName, regex] of Object.entries(HTML_BUG_PATTERNS)) {
                  regex.lastIndex = 0;
                  let match;
                  while ((match = regex.exec(content)) !== null) {
                    const lines = content.substring(0, match.index).split('\n');
                    findings.push({
                      type: 'html_bug',
                      severity: 'low',
                      title: patternName,
                      file: fullPath,
                      line: lines.length,
                      snippet: content.substring(Math.max(0, match.index - 30), match.index + 50)
                    });
                  }
                }
              }
            } catch {}
          }
        }
      } catch {}
    };

    scanDir(path);
    return findings;
  }

  async scanSecrets(path, options = {}) {
    const findings = [];
    const includeGit = options.includeGit || false;

    const scanFile = (filePath) => {
      try {
        const content = readFileSync(filePath, 'utf-8');

        for (const [secretType, regex] of Object.entries(SECRET_PATTERNS)) {
          regex.lastIndex = 0;
          let match;
          while ((match = regex.exec(content)) !== null) {
            const lines = content.substring(0, match.index).split('\n');
            findings.push({
              type: 'secret',
              severity: 'critical',
              title: `${secretType} Exposed`,
              file: filePath,
              line: lines.length,
              snippet: match[0].substring(0, 30) + '...'
            });
          }
        }
      } catch {}
    };

    const scanDir = (dir) => {
      try {
        const items = readdirSync(dir);
        for (const item of items) {
          if (item === 'node_modules' || item === '.git') continue;

          const fullPath = join(dir, item);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else {
            const ext = extname(item);
            if (['.js', '.ts', '.py', '.json', '.yaml', '.yml', '.env', '.config', '.sh'].includes(ext) ||
              item.includes('.env') || item.includes('config')) {
              scanFile(fullPath);
            }
          }
        }
      } catch {}
    };

    scanDir(path);
    return findings;
  }

  async scanBugs(path, options = {}) {
    const results = [];

    console.log(chalk.red('\n╭─ 🔍 Bug Scan: ') + path + chalk.red(' ────────────────────────────────────────╮'));

    const bugPatterns = {
      'Unreachable Code': /if\s*\(false\)\s*{/g,
      'Null Check Missing': /\w+\.\w+\s*(?!\??\.)\w+\(/g,
      'Empty Catch Block': /catch\s*\([^)]*\)\s*{[\s]*}/g,
      'Hardcoded Timeout': /setTimeout\([^,]+,[^0-9](\d+)[^0-9]/g,
      'Race Condition Risk': /async.*await.*for.*of/g
    };

    const scanDir = (dir) => {
      try {
        const items = readdirSync(dir);
        for (const item of items) {
          if (['node_modules', '.git', 'dist', 'build'].includes(item)) continue;

          const fullPath = join(dir, item);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (['.js', '.ts', '.py'].includes(extname(item))) {
            try {
              const content = readFileSync(fullPath, 'utf-8');

              for (const [bugType, regex] of Object.entries(bugPatterns)) {
                let match;
                while ((match = regex.exec(content)) !== null) {
                  const lines = content.substring(0, match.index).split('\n');
                  results.push({
                    type: 'bug',
                    severity: 'medium',
                    title: bugType,
                    file: fullPath,
                    line: lines.length
                  });
                }
              }
            } catch {}
          }
        }
      } catch {}
    };

    scanDir(path);
    console.log(chalk.green('│  ✅ Found ') + `${results.length} potential bugs`);
    console.log(chalk.red('╰──────────────────────────────────────────────────────────╯\n'));

    return results;
  }

  summarizeFindings(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    for (const f of findings) {
      const sev = (f.severity || 'info').toLowerCase();
      if (counts[sev] !== undefined) counts[sev]++;
    }

    return findings;
  }
}

export default VulnerabilityScanner;