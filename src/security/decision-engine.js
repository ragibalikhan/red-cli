import chalk from 'chalk';
import { execSafe, toolExists } from './platform.js';

export class DecisionEngine {
  constructor(agent, securityEngine) {
    this.agent = agent;
    this.securityEngine = securityEngine;
    this.findings = [];
    this.executedActions = [];
    this.attackChain = [];
    this.target = null;
    this.discoveredServices = {};
    this.discoveredPaths = [];
    this.techStack = [];
    this.maxIterations = 30;
    this.iteration = 0;
  }

  setTarget(target) {
    this.target = target;
  }

  setMaxIterations(max) {
    this.maxIterations = max;
  }

  reset() {
    this.findings = [];
    this.executedActions = [];
    this.attackChain = [];
    this.discoveredServices = {};
    this.discoveredPaths = [];
    this.techStack = [];
    this.iteration = 0;
  }

  async decide(toolName, toolOutput, currentFindings) {
    this.iteration++;
    this.findings.push(...currentFindings);

    this.updateWorldModel(toolOutput, currentFindings);

    const nextAction = await this.consultClaude();

    if (nextAction && !nextAction.done && !this.alreadyDone(nextAction)) {
      this.executedActions.push(nextAction);
      return nextAction;
    }
    return { done: true };
  }

  updateWorldModel(output, findings) {
    if (!output) return;

    const portMatches = output.match(/(\d+)\/(tcp|udp)\s+open\s+(.+)/g) || [];
    portMatches.forEach(match => {
      const m = match.match(/(\d+)\/(tcp|udp)\s+open\s+(.+)/);
      if (m) {
        this.discoveredServices[m[1]] = m[3].trim();
      }
    });

    if (findings) {
      findings.filter(f => f.title?.includes('Found:') || f.title?.includes('exposed'))
        .forEach(f => this.discoveredPaths.push(f));

      findings.filter(f => f.title?.includes('Technologies') || f.detail?.includes('PHP') || f.detail?.includes('nginx') || f.detail?.includes('Apache') || f.detail?.includes('WordPress'))
        .forEach(f => {
          if (f.detail && !this.techStack.includes(f.detail)) {
            this.techStack.push(f.detail);
          }
        });
    }

    const pathMatches = output.match(/\/[\w\-\/]+/g) || [];
    pathMatches.forEach(p => {
      if (!this.discoveredPaths.some(dp => dp.includes(p))) {
        this.discoveredPaths.push(p);
      }
    });
  }

  async consultClaude() {
    const worldState = `
Target: ${this.target}

Discovered Services:
${Object.entries(this.discoveredServices).map(([port, svc]) => `  Port ${port}: ${svc}`).join('\n') || '  (none discovered yet)'}

Tech Stack: ${this.techStack.join(', ') || '(none discovered yet)'}

Exposed Paths: ${this.discoveredPaths.slice(0, 10).join(', ') || '(none discovered yet)'}

All Findings So Far (${this.findings.length}):
${this.findings.map(f => `[${f.severity || 'info'}] ${f.title}`).slice(0, 20).join('\n')}

Actions Already Taken:
${this.executedActions.map(a => a.tool + ': ' + a.command).join('\n') || '(none)'}

Available Tools: nmap, nikto, nuclei, sqlmap, curl, openssl, hydra, dirb, gobuster, ffuf, whatweb, sslscan, netcat

Current Iteration: ${this.iteration}/${this.maxIterations}

What is the single most impactful next security test to run?
Respond ONLY in this JSON format:
{
  "tool": "tool_name",
  "command": "exact command to run",
  "reason": "why this is the most valuable next step",
  "severity_expected": "critical|high|medium|low",
  "done": false
}

If you believe the assessment is complete, respond with: {"done": true}

Rules:
- Never repeat an action already taken
- Prioritize critical/high severity attack vectors
- If port 3306 open → test default MySQL creds
- If port 6379 open → test Redis without auth
- If .git exposed → try git-dumper
- If login page found → test default credentials
- If SQLi suspected → run sqlmap
- If WordPress detected → run wpscan
- Chain findings into escalating attack paths
`;

    try {
      const response = await this.agent.provider.sendMessage(
        [{ role: 'user', content: worldState }],
        []
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { done: true };
    } catch (e) {
      console.log(chalk.dim(`  Decision engine error: ${e.message}`));
      return { done: true };
    }
  }

  alreadyDone(action) {
    if (!action || !action.command) return true;
    return this.executedActions.some(a =>
      a.command === action.command
    );
  }

  async executeAction(action) {
    if (!action || action.done) {
      return null;
    }

    console.log(chalk.cyan(`\n  🤖 Decision: ${action.reason}`));
    console.log(chalk.dim(`    Running: ${action.command}`));

    const result = execSafe(action.command);

    if (result) {
      console.log(chalk.dim(`    Output:\n    ${result.split('\n').slice(0, 15).join('\n    ')}`));
    }

    return result;
  }

  getStats() {
    return {
      iteration: this.iteration,
      maxIterations: this.maxIterations,
      totalFindings: this.findings.length,
      critical: this.findings.filter(f => f.severity === 'critical').length,
      high: this.findings.filter(f => f.severity === 'high').length,
      medium: this.findings.filter(f => f.severity === 'medium').length,
      low: this.findings.filter(f => f.severity === 'low').length,
      actionsExecuted: this.executedActions.length,
      servicesDiscovered: Object.keys(this.discoveredServices).length,
      pathsDiscovered: this.discoveredPaths.length,
      techStack: this.techStack
    };
  }
}

export default DecisionEngine;