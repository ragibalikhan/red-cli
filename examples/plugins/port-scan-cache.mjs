import { execSync } from 'child_process';
import chalk from 'chalk';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map();

export const commands = [
  {
    name: '/portcache',
    aliases: ['/pc'],
    description: 'Quick port scan with 24h cache: /portcache <host>',
    args: [{ name: 'host', required: true, description: 'Host to scan' }],
    async run(host) {
      if (!host) {
        console.log(chalk.yellow('  Usage: /portcache <host>'));
        return;
      }

      const now = Date.now();
      const cached = cache.get(host);

      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log(chalk.dim(`  📦 Returning cached result for ${host} (${Math.round((now - cached.timestamp) / 1000)}s old)`));
        console.log(cached.result);
        return;
      }

      console.log(chalk.dim(`  🔍 Scanning ${host}...`));
      try {
        const output = execSync(`nmap -F ${host}`, { timeout: 30000, encoding: 'utf-8' });
        const lines = output.split('\n').filter(l => l.includes('open') || l.includes('PORT'));
        const resultText = lines.join('\n') || 'No open ports found.';

        cache.set(host, { result: resultText, timestamp: now });
        console.log(chalk.green('  ✓ Scan complete (cached for 24h)'));
        console.log(resultText);
      } catch (err) {
        console.log(chalk.red(`  ✗ Scan failed: ${err.message}`));
      }
    }
  }
];

export const tools = [
  {
    name: 'cached_portscan',
    description: 'Run a fast port scan against a host (cached for 24 hours). Returns open ports.',
    input_schema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Hostname or IP to scan' }
      },
      required: ['host']
    },
    async execute(input) {
      const now = Date.now();
      const cached = cache.get(input.host);

      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return { output: cached.result, source: 'cache' };
      }

      try {
        const output = execSync(`nmap -F ${input.host}`, { timeout: 30000, encoding: 'utf-8' });
        const lines = output.split('\n').filter(l => l.includes('open') || l.includes('PORT'));
        const resultText = lines.join('\n') || 'No open ports found.';

        cache.set(input.host, { result: resultText, timestamp: now });
        return { output: resultText, source: 'fresh' };
      } catch (err) {
        return { error: err.message };
      }
    }
  }
];

export function init(ctx) {
  // Auto-clean expired cache entries every hour
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache) {
      if ((now - value.timestamp) >= CACHE_TTL) {
        cache.delete(key);
      }
    }
  }, 60 * 60 * 1000);
}
