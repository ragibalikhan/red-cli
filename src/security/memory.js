import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const SECURITY_MEMORY_PATH = join(homedir(), '.red', 'security-memory.json');
const MAX_SCANS = 50;

export class SecurityMemory {
  constructor() {
    this.scans = this.load();
  }

  load() {
    try {
      if (existsSync(SECURITY_MEMORY_PATH)) {
        return JSON.parse(readFileSync(SECURITY_MEMORY_PATH, 'utf-8'));
      }
    } catch (e) {
      console.log(chalk.dim(`  Memory load warning: ${e.message}`));
    }
    return { scans: [], lastUpdated: null };
  }

  save() {
    try {
      const dir = dirname(SECURITY_MEMORY_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(SECURITY_MEMORY_PATH, JSON.stringify(this.scans, null, 2));
    } catch (e) {
      console.log(chalk.dim(`  Memory save warning: ${e.message}`));
    }
  }

  addScan(target, findings, metadata = {}) {
    const scan = {
      id: Date.now().toString(36),
      target,
      timestamp: new Date().toISOString(),
      findings: findings || [],
      summary: this.summarize(findings || []),
      technologies: metadata.technologies || [],
      openPorts: metadata.openPorts || [],
      httpStatus: metadata.httpStatus || null,
      scanType: metadata.scanType || 'network'
    };

    this.scans.scans = [scan, ...this.scans.scans].slice(0, MAX_SCANS);
    this.scans.lastUpdated = scan.timestamp;
    this.save();

    console.log(chalk.dim(`  💾 Saved to memory (${this.scans.scans.length} scans total)`));
    return scan.id;
  }

  getByTarget(target) {
    if (!target) return this.scans.scans;
    return this.scans.scans.filter(s =>
      s.target === target || s.target.includes(target)
    );
  }

  getRecent(limit = 10) {
    return this.scans.scans.slice(0, limit);
  }

  getLatest(target) {
    const scans = this.getByTarget(target);
    return scans[0] || null;
  }

  getTechnologies() {
    const techSet = new Set();
    for (const scan of this.scans.scans) {
      if (scan.technologies) {
        scan.technologies.forEach(t => techSet.add(t));
      }
    }
    return Array.from(techSet);
  }

  getAllTargets() {
    const targets = new Set();
    for (const scan of this.scans.scans) {
      targets.add(scan.target);
    }
    return Array.from(targets);
  }

  summarize(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) {
      const sev = (f.severity || 'info').toLowerCase();
      if (counts[sev] !== undefined) counts[sev]++;
    }
    return counts;
  }

  toContext() {
    return {
      recentScans: this.getRecent(5),
      technologies: this.getTechnologies(),
      totalScans: this.scans.scans.length,
      targets: this.getAllTargets()
    };
  }

  clear() {
    this.scans = { scans: [], lastUpdated: null };
    this.save();
    console.log(chalk.green('  ✅ Security memory cleared'));
  }

  list() {
    if (this.scans.scans.length === 0) {
      console.log(chalk.yellow('  No security scans in memory yet.'));
      return;
    }

    console.log(chalk.cyan('\n╭─ 📜 Security Scan History ─────────────────────────────────╮'));
    for (const scan of this.scans.scans.slice(0, 15)) {
      const { critical, high, medium, low } = scan.summary;
      const total = critical + high + medium + low;
      const date = new Date(scan.timestamp).toLocaleString();

      console.log(chalk.cyan('│ ') + chalk.yellow(scan.target.padEnd(30)) + chalk.dim(date));
      console.log(chalk.cyan('│ ') + chalk.dim(`  ${total} issues | ${critical}C ${high}H ${medium}M ${low}L`));
      if (scan.technologies?.length) {
        console.log(chalk.cyan('│ ') + chalk.dim(`  Tech: ${scan.technologies.join(', ')}`));
      }
      console.log(chalk.cyan('│'));
    }
    console.log(chalk.cyan('╰──────────────────────────────────────────────────────────╯\n'));

    if (this.scans.scans.length > 15) {
      console.log(chalk.dim(`  ... and ${this.scans.scans.length - 15} more scans`));
    }
  }
}

export default SecurityMemory;