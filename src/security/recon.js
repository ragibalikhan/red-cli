import { execSync } from 'child_process';
import chalk from 'chalk';
import { toolExists, execSafe } from './platform.js';
import { autoInstall } from './tool-manager.js';

export class ReconEngine {
  constructor(toolsRegistry, platform) {
    this.tools = toolsRegistry;
    this.platform = platform;
    this.findings = [];
  }

  async run(target, options = {}) {
    const { passive = true, active = false, reconAll = true } = options;

    console.log(chalk.red(`\n╭─ 🔍 Recon: ${target} ────────────────────────────────────╮`));
    console.log(chalk.red('│'));
    console.log(chalk.red(`│  Mode: ${passive && active ? 'Passive + Active' : passive ? 'Passive' : 'Active'}`));
    console.log(chalk.red('│'));

    const results = {
      target,
      startTime: new Date(),
      passive: {},
      active: {},
      findings: []
    };

    if (passive) {
      console.log(chalk.cyan('│  Phase 1: Passive Recon'));
      const passiveResults = await this.runPassiveRecon(target);
      results.passive = passiveResults;
      results.findings.push(...passiveResults.findings);
    }

    if (active) {
      console.log(chalk.cyan('│  Phase 2: Active Recon'));
      console.log(chalk.red('│  ⚠️  Active recon requires explicit authorization!'));
      const activeResults = await this.runActiveRecon(target);
      results.active = activeResults;
      results.findings.push(...activeResults.findings);
    }

    results.endTime = new Date();
    console.log(chalk.red('│'));
    console.log(chalk.red('╰─────────────────────────────────────────────────────────────╯'));

    this.findings = results.findings;
    return results;
  }

  async runPassiveRecon(target) {
    const results = { findings: [] };
    const hostname = this.extractHostname(target);

    // WHOIS lookup - with fallback to RDAP API
    console.log(chalk.dim('│  ▶ WHOIS lookup...'));
    if (toolExists('whois')) {
      try {
        const whois = execSafe(`whois ${hostname} 2>/dev/null`, { timeout: 10000 });
        const created = whois.match(/Creation Date:\s*(\S+)/)?.[1] ||
          whois.match(/Created:\s*(\S+)/)?.[1];
        const registrant = whois.match(/Registrant:\s*(.+)/)?.[1]?.trim().substring(0, 40);

        console.log(chalk.green('│  ✅ WHOIS: ') + (created || 'Found'));
        if (registrant) console.log(chalk.dim('│     ') + registrant);
      } catch {
        console.log(chalk.dim('│  ⚪ WHOIS: Failed'));
      }
    } else {
      // Fallback: use RDAP API
      try {
        const rdap = execSafe(
          `curl -s "https://rdap.org/domain/${hostname}" 2>/dev/null`,
          { timeout: 10000 }
        );
        if (rdap && rdap.includes('"handle"')) {
          console.log(chalk.green('│  ✅ WHOIS: (RDAP fallback) Found'));
          results.findings.push({ type: 'whois', severity: 'info', source: 'RDAP' });
        } else {
          console.log(chalk.dim('│  ⚪ WHOIS: Not available (install: sudo apt install whois)'));
        }
      } catch {
        console.log(chalk.dim('│  ⚪ WHOIS: Not available'));
      }
    }

    // DNS enumeration - with fallback to DNS-over-HTTPS
    console.log(chalk.dim('│  ▶ DNS enumeration...'));
    if (toolExists('dig')) {
      try {
        const aRecord = execSafe(`dig +short A ${hostname}`, { timeout: 5000 });
        const mxRecord = execSafe(`dig +short MX ${hostname}`, { timeout: 5000 });
        const txtRecord = execSafe(`dig +short TXT ${hostname}`, { timeout: 5000 });
        const nsRecord = execSafe(`dig +short NS ${hostname}`, { timeout: 5000 });

        console.log(chalk.green('│  ✅ DNS: ') + (aRecord ? `A: ${aRecord.split('\n')[0]}` : 'None'));
        if (mxRecord) console.log(chalk.dim('│     ') + `MX: ${mxRecord.split('\n')[0]}`);
        if (nsRecord) console.log(chalk.dim('│     ') + `NS: ${nsRecord.split('\n')[0]}`);

        results.findings.push({
          type: 'dns',
          severity: 'info',
          a: aRecord,
          mx: mxRecord,
          ns: nsRecord
        });
      } catch {
        console.log(chalk.dim('│  ⚪ DNS: Failed'));
      }
    } else if (toolExists('nslookup')) {
      try {
        const result = execSafe(`nslookup ${hostname}`, { timeout: 5000 });
        console.log(chalk.green('│  ✅ DNS: ') + (result ? 'Found' : 'None'));
      } catch {
        console.log(chalk.dim('│  ⚪ DNS: Failed'));
      }
    } else {
      // Fallback: use Cloudflare DNS-over-HTTPS
      try {
        const doh = execSafe(
          `curl -s "https://cloudflare-dns.com/dns-query?name=${hostname}&type=A" -H "accept: application/dns-json" 2>/dev/null`,
          { timeout: 5000 }
        );
        if (doh) {
          const json = JSON.parse(doh);
          const ips = json.Answer?.map(a => a.data).join(', ') || 'not found';
          console.log(chalk.green('│  ✅ DNS: (DoH fallback) ') + (ips !== 'not found' ? ips : 'Not found'));
        } else {
          console.log(chalk.dim('│  ⚪ DNS: dig not installed, DoH failed'));
        }
      } catch {
        console.log(chalk.dim('│  ⚪ DNS: Not available (install: sudo apt install dnsutils)'));
      }
    }

    // Subdomain enumeration - with fallback to crt.sh
    console.log(chalk.dim('│  ▶ Subdomain enumeration...'));
    if (toolExists('subfinder')) {
      try {
        const subdomains = execSafe(`subfinder -d ${hostname} -silent`, { timeout: 30000 }).split('\n').filter(Boolean);

        results.findings.push({
          type: 'subdomains',
          severity: 'info',
          count: subdomains.length,
          data: subdomains.slice(0, 20)
        });

        console.log(chalk.green('│  ✅ Subdomains: ') + `${subdomains.length} found`);
        if (subdomains.length > 0) {
          console.log(chalk.dim('│     ') + subdomains.slice(0, 5).join(', '));
          if (subdomains.length > 5) console.log(chalk.dim('│     ') + `...and ${subdomains.length - 5} more`);
        }
      } catch {
        console.log(chalk.dim('│  ⚪ Subdomains: Failed'));
      }
    } else if (toolExists('amass')) {
      try {
        const subdomains = execSafe(`amass enum -passive -d ${hostname} -timeout 30`, { timeout: 35000 }).split('\n').filter(Boolean);
        console.log(chalk.green('│  ✅ Subdomains: ') + `${subdomains.length} found (amass)`);
      } catch {
        console.log(chalk.dim('│  ⚪ Subdomains: Failed'));
      }
    } else {
      // Fallback: use crt.sh (certificate transparency)
      try {
        const crtData = execSafe(
          `curl -s "https://crt.sh/?q=%.${hostname}&output=json" 2>/dev/null`,
          { timeout: 15000 }
        );
        if (crtData) {
          const json = JSON.parse(crtData);
          const subs = [...new Set(json.map(e => e.name_value).flat())].slice(0, 20);
          if (subs.length > 0) {
            results.findings.push({
              type: 'subdomains',
              severity: 'info',
              count: subs.length,
              data: subs,
              source: 'crt.sh'
            });
            console.log(chalk.green('│  ✅ Subdomains: ') + `${subs.length} found (crt.sh)`);
            console.log(chalk.dim('│     ') + subs.slice(0, 3).join(', '));
          } else {
            console.log(chalk.dim('│  ⚪ Subdomains: none found'));
          }
        } else {
          console.log(chalk.dim('│  ⚪ Subdomains: subfinder not installed, crt.sh failed'));
        }
      } catch {
        console.log(chalk.dim('│  ⚪ Subdomains: subfinder/amass not installed'));
      }
    }

    // SSL/TLS check - uses openssl (almost always available)
    console.log(chalk.dim('│  ▶ SSL/TLS check...'));
    try {
      const cert = execSafe(
        `echo | openssl s_client -connect ${hostname}:443 -servername ${hostname} 2>/dev/null | openssl x509 -noout -dates -subject`,
        { timeout: 10000 }
      );

      if (cert && cert.includes('notAfter=')) {
        const notAfter = cert.match(/notAfter=(.+)/)?.[1];
        const subject = cert.match(/subject=(.+)/)?.[1];

        results.findings.push({
          type: 'ssl',
          severity: 'info',
          notAfter: notAfter?.trim(),
          subject: subject?.trim()
        });

        console.log(chalk.green('│  ✅ SSL: ') + (subject?.trim() || 'Found'));
        if (notAfter) console.log(chalk.dim('│     ') + `Expires: ${notAfter.trim()}`);
      } else {
        console.log(chalk.dim('│  ⚪ SSL: No HTTPS on port 443'));
      }
    } catch {
      console.log(chalk.dim('│  ⚪ SSL: Check failed'));
    }

    return results;
  }

  // Helper to extract hostname
  extractHostname(target) {
    try {
      const urlStr = target.startsWith('http') ? target : `http://${target}`;
      const url = new URL(urlStr);
      return url.hostname;
    } catch {
      return target.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
    }
  }

  async runActiveRecon(target) {
    const results = { findings: [] };

    console.log(chalk.dim('│  ▶ Port scanning (nmap)...'));
    if (this.tools.isToolAvailable('recon', 'nmap')) {
      try {
        const scan = execSync(`nmap -sV --open -oG - ${target}`, {
          encoding: 'utf-8',
          timeout: 120000
        });

        const openPorts = scan.split('\n')
          .filter(l => l.includes('/open/'))
          .map(l => {
            const match = l.match(/(\d+)\/(\w+)\s+\w+\s+(.+)/);
            return match ? `${match[1]}/${match[2]} (${match[3]})` : null;
          })
          .filter(Boolean);

        if (openPorts.length > 0) {
          results.findings.push({
            type: 'open_ports',
            severity: 'high',
            count: openPorts.length,
            ports: openPorts
          });

          console.log(chalk.green('│  ✅ Open Ports: ') + openPorts.length);
          openPorts.slice(0, 5).forEach(p => console.log(chalk.dim('│     ') + p));
        } else {
          console.log(chalk.dim('│  ⚪ Open Ports: None found'));
        }
      } catch {
        console.log(chalk.dim('│  ⚪ Port scan: Failed'));
      }
    }

    console.log(chalk.dim('│  ▶ Directory enumeration (ffuf)...'));
    if (this.tools.isToolAvailable('scanning', 'ffuf')) {
      try {
        const dirs = execSync(`ffuf -u http://${target}/FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,204,301,302,307,401 -silent -t 10`, {
          encoding: 'utf-8',
          timeout: 30000
        }).trim().split('\n').filter(Boolean);

        if (dirs.length > 0) {
          results.findings.push({
            type: 'directories',
            severity: 'medium',
            count: dirs.length,
            paths: dirs.slice(0, 10)
          });

          console.log(chalk.green('│  ✅ Directories: ') + dirs.length + ' found');
          dirs.slice(0, 5).forEach(d => console.log(chalk.dim('│     ') + d));
        } else {
          console.log(chalk.dim('│  ⚪ Directories: None found'));
        }
      } catch {
        console.log(chalk.dim('│  ⚪ Directory scan: Failed'));
      }
    }

    console.log(chalk.dim('│  ▶ Technology detection...'));
    try {
      // Auto-install whatweb if not present
      let tech = '';
      if (!toolExists('whatweb')) {
        await autoInstall('whatweb', true);
      }

      if (toolExists('whatweb')) {
        try {
          tech = execSync(`whatweb -q ${target} 2>/dev/null | head -10`, {
            encoding: 'utf-8',
            timeout: 15000
          }).trim();
        } catch {}
      }

      if (tech) {
        const technologies = tech.split(',').map(t => t.trim()).filter(Boolean);
        results.findings.push({
          type: 'technologies',
          severity: 'info',
          count: technologies.length,
          technologies
        });

        console.log(chalk.green('│  ✅ Technologies: ') + technologies.slice(0, 3).join(', '));
      }
    } catch {
      console.log(chalk.dim('│  ⚪ Technologies: Not detected'));
    }

    return results;
  }

  generateDorks(domain) {
    const dorks = [
      `site:${domain} ext:env OR ext:config OR ext:yaml OR ext:yml`,
      `site:github.com ${domain} password`,
      `site:${domain} inurl:admin OR inurl:login OR inurl:signup`,
      `site:${domain} "AWS_ACCESS_KEY" OR "AWS_SECRET_KEY"`,
      `site:${domain} ext:log OR ext:bak OR ext:sql`,
      `site:${domain} "api_key" OR "apikey" OR "secret"`,
      `inurl:${domain} "phpinfo" OR "info.php"`,
      `site:${domain} "vulnerable" OR "exploit"`
    ];

    console.log(chalk.yellow('\n╭─ 📋 Google Dorks ──────────────────────────────────────╮'));
    for (let i = 0; i < dorks.length; i++) {
      console.log(chalk.dim(`│  ${i + 1}. ${dorks[i]}`));
    }
    console.log(chalk.yellow('╰─────────────────────────────────────────────────────────────╯\n'));

    return dorks;
  }
}

export default ReconEngine;