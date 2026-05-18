import { existsSync } from 'fs';
import { join } from 'path';

const CHECKS = [
  {
    name: 'security engine imports',
    run: async () => {
      const mod = await import('../src/security/index.js');
      return typeof mod.createSecurityEngine === 'function';
    }
  },
  {
    name: 'command classifier imports',
    run: async () => {
      const mod = await import('../src/command-runner.js');
      return mod.classifyCommand('pwd').level === 'safe';
    }
  },
  {
    name: 'package manifest exists',
    run: async () => existsSync(join(process.cwd(), 'package.json'))
  }
];

export class RedTeamTestRunner {
  constructor(options = {}) {
    this.options = options;
  }

  async run(category = 'all') {
    const selected = category === 'all' || category === 'smoke'
      ? CHECKS
      : CHECKS.filter((check) => check.name.includes(category));

    if (selected.length === 0) {
      console.log(`No red-team smoke checks matched category: ${category}`);
      return { passed: 0, failed: 0, checks: [] };
    }

    const results = [];
    for (const check of selected) {
      try {
        const ok = await check.run();
        results.push({ name: check.name, ok: Boolean(ok) });
      } catch (error) {
        results.push({ name: check.name, ok: false, error: error.message });
      }
    }

    const passed = results.filter((result) => result.ok).length;
    const failed = results.length - passed;

    if (this.options.verbose || failed > 0) {
      for (const result of results) {
        const status = result.ok ? 'PASS' : 'FAIL';
        const suffix = result.error ? ` - ${result.error}` : '';
        console.log(`${status} ${result.name}${suffix}`);
      }
    }

    console.log(`Red-team smoke checks: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      process.exitCode = 1;
    }

    return { passed, failed, checks: results };
  }
}

export default RedTeamTestRunner;
