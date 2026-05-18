import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { AutoAgent } from './autoagent.js';
import { Agent } from './agent.js';
import { createInterface } from 'readline';

const QUEUE_PATH = join(homedir(), '.red', 'queue.json');

function ensureQueueDir() {
  const dir = dirname(QUEUE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadQueue() {
  try {
    if (existsSync(QUEUE_PATH)) {
      return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveQueue(queue) {
  ensureQueueDir();
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export class TaskQueue {
  constructor(config) {
    this.config = config;
    this.queue = loadQueue();
  }

  // Extract URL/target from task description
  extractTarget(description) {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    if (urlMatch) return urlMatch[0];

    const ipMatch = description.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    if (ipMatch) return ipMatch[0];

    // Common domain patterns
    const domainMatch = description.match(/[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s]*/);
    if (domainMatch) return domainMatch[0];

    return null;
  }

  add(description, options = {}) {
    // Parse task description to extract type and target
    const securityTypes = ['xss', 'sqli', 'lfi', 'rce', 'sql', 'scan', 'recon', 'brute', 'exploit', 'pentest', 'vuln'];
    const isSecurityTask = securityTypes.some(t => description.toLowerCase().includes(t));

    const task = {
      id: generateId(),
      description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      report: null,
      auto: options.auto || true, // Security tasks auto-execute by default
      security: isSecurityTask ? {
        type: securityTypes.find(t => description.toLowerCase().includes(t)) || 'generic',
        target: this.extractTarget(description)
      } : null
    };

    this.queue.push(task);
    saveQueue(this.queue);

    console.log(chalk.green(`✓ Added to queue: "${description}"`));
    return task;
  }

  list() {
    if (this.queue.length === 0) {
      console.log(chalk.dim('Queue is empty.'));
      return;
    }

    console.log(chalk.bold('\n📋 Task Queue\n'));
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];
      const statusIcon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
      const autoTag = task.auto ? ' [auto]' : '';
      console.log(`  ${i + 1}. ${statusIcon} ${task.description}${autoTag}`);
      if (task.status === 'completed') {
        console.log(chalk.dim(`     Completed: ${new Date(task.completedAt).toLocaleString()}`));
      }
    }
    console.log();
  }

  clear() {
    this.queue = [];
    saveQueue(this.queue);
    console.log(chalk.green('Queue cleared.'));
  }

  remove(index) {
    if (index < 0 || index >= this.queue.length) {
      console.log(chalk.red('Invalid task index.'));
      return;
    }

    const removed = this.queue.splice(index, 1)[0];
    saveQueue(this.queue);
    console.log(chalk.green(`Removed: "${removed.description}"`));
  }

  async run(config, onTaskComplete) {
    if (this.queue.length === 0) {
      console.log(chalk.yellow('No tasks to run.'));
      return;
    }

    console.log(chalk.cyan.bold(`\n═══ Running ${this.queue.length} tasks ═══\n`));

    let agent;
    if (this.queue.some(t => t.auto)) {
      agent = new AutoAgent(new Agent(config));
    } else {
      agent = new Agent(config);
    }

    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i];

      if (task.status === 'completed') {
        console.log(chalk.dim(`\n─── Task ${i + 1}/${this.queue.length}: ${task.description} (skipped, already completed) ───\n`));
        continue;
      }

      console.log(chalk.cyan(`\n─── Task ${i + 1}/${this.queue.length}: ${task.description} ───\n`));

      if (i > 0) {
        const confirm = await this.promptConfirmation('Start next task?');
        if (!confirm) {
          console.log(chalk.yellow('Queue paused.'));
          break;
        }
      }

      try {
        // If it's a security task, execute it directly using security engine
        if (task.security && task.security.type) {
          const { createSecurityEngine } = await import('./security/index.js');
          const engine = await createSecurityEngine();
          const target = task.security.target;

          console.log(chalk.cyan(`  Executing ${task.security.type} on ${target || 'inferred from context'}`));

          let result;
          switch (task.security.type) {
            case 'sqli':
            case 'sql':
              if (target) {
                const { execSync } = await import('child_process');
                console.log(chalk.dim(`  Running sqlmap on ${target}...`));
                result = execSync(`sqlmap -u "${target}" --batch --level=2 --risk=1 --dbs 2>&1 | head -50`, { encoding: 'utf-8', timeout: 120000 });
              }
              break;
            case 'xss':
              if (target) {
                const { execSync } = await import('child_process');
                const payloads = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>'];
                for (const p of payloads) {
                  console.log(chalk.dim(`  Testing XSS: ${target}`));
                  result = execSync(`curl -s -L "${target}" | grep -oE "${p}" | head -3`, { encoding: 'utf-8', timeout: 10000 });
                  if (result) break;
                }
              }
              break;
            case 'scan':
              if (target) result = await engine.runVulnScan(target);
              break;
            case 'recon':
              if (target) result = await engine.runRecon(target, { passive: true });
              break;
            case 'brute':
              if (target) {
                const { execSync } = await import('child_process');
                console.log(chalk.dim(`  Running directory brute force...`));
                result = execSync(`ffuf -u "${target}/FUZZ" -w /usr/share/wordlists/dirb/common.txt -mc 200,204,301,302,307,401 -t 10 -s 2>/dev/null | head -20`, { encoding: 'utf-8', timeout: 60000 });
              }
              break;
            default:
              // Generic security task - use AI agent
              await agent.run(task.description);
              result = { executed: true };
          }

          task.report = result;
          task.status = 'completed';
        } else if (task.auto) {
          const result = await agent.run(task.description);
          task.report = result;
        } else {
          await agent.run(task.description);
          task.status = 'completed';
        }

        task.completedAt = new Date().toISOString();
        saveQueue(this.queue);

        console.log(chalk.green('\n✅ Task completed.\n'));

        if (onTaskComplete) onTaskComplete(task, i);

      } catch (err) {
        task.status = 'failed';
        task.report = { error: err.message };
        saveQueue(this.queue);

        console.log(chalk.red(`\n❌ Task failed: ${err.message}\n`));

        const action = await this.promptFailureAction();
        if (action === 'abort') {
          console.log(chalk.yellow('Queue aborted.'));
          break;
        } else if (action === 'skip') {
          continue;
        }
      }
    }

    console.log(chalk.cyan.bold('\n═══ Queue Complete ═══\n'));
    this.summary();
  }

  summary() {
    const completed = this.queue.filter(t => t.status === 'completed').length;
    const failed = this.queue.filter(t => t.status === 'failed').length;
    const pending = this.queue.filter(t => t.status === 'pending').length;

    console.log(chalk.bold('Summary:'));
    console.log(chalk.green(`  Completed: ${completed}`));
    if (failed > 0) console.log(chalk.red(`  Failed: ${failed}`));
    console.log(chalk.dim(`  Pending: ${pending}`));
    console.log();
  }

  promptConfirmation(prompt) {
    return new Promise((resolve) => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question(chalk.cyan(`${prompt} [y/n]: `), (answer) => {
        readline.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  async promptFailureAction() {
    return new Promise((resolve) => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question(chalk.cyan('[r]etry / [s]kip / [a]bort: '), (answer) => {
        readline.close();
        const a = answer.toLowerCase().charAt(0);
        if (a === 'r') resolve('retry');
        else if (a === 's') resolve('skip');
        else resolve('abort');
      });
    });
  }
}

export function createQueue(config) {
  return new TaskQueue(config);
}

export default TaskQueue;
