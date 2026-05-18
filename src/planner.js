import chalk from 'chalk';
import { getDefaultSystemPrompt } from './config.js';
import { createInterface } from 'readline';

const PLANNER_SYSTEM_PROMPT = `You are a task planner. Your job is to break down complex tasks into clear, actionable steps.

Given a user request, create a structured plan with:
1. A clear task title
2. Numbered steps with icons:
   - 📖 = reading/discovering
   - 📦 = installing dependencies
   - ✏️ = creating new files
   - 🔧 = editing existing files
   - 🧪 = testing
   - 🔍 = searching/analyzing
3. Estimated number of tool calls
4. Brief description of each step

Output ONLY valid JSON in this format:
{
  "title": "Task title",
  "steps": [
    {"id": 1, "icon": "📖", "description": "Read existing files", "toolHint": "read_file, list_directory"},
    {"id": 2, "icon": "📦", "description": "Install dependencies", "toolHint": "bash"}
  ],
  "estimatedCalls": 5
}

Do NOT include any explanation outside the JSON.`;

const AUTO_TRIGGER_KEYWORDS = ['add', 'build', 'create', 'refactor', 'migrate', 'implement', 'set up', 'fix all'];
const AUTO_TRIGGER_MIN_WORDS = 20;

export class Planner {
  constructor(agent) {
    this.agent = agent;
  }

  shouldAutoPlan(message) {
    const words = message.split(/\s+/).length;
    const hasKeyword = AUTO_TRIGGER_KEYWORDS.some(kw => message.toLowerCase().includes(kw));
    return words >= AUTO_TRIGGER_MIN_WORDS || hasKeyword;
  }

  async planTask(userMessage, context = '') {
    const prompt = `${PLANNER_SYSTEM_PROMPT}

Current working directory: ${process.cwd()}
${context ? `Context:\n${context}` : ''}

User request: ${userMessage}`;

    const messages = [
      { role: 'user', content: prompt }
    ];

    const response = await this.agent.provider.sendMessage(messages, []);

    try {
      const plan = JSON.parse(response.content);
      return this.validatePlan(plan);
    } catch {
      return this.createFallbackPlan(userMessage);
    }
  }

  validatePlan(plan) {
    if (!plan.title || !Array.isArray(plan.steps)) {
      return this.createFallbackPlan(plan.title || 'Task');
    }
    return plan;
  }

  createFallbackPlan(title) {
    return {
      title,
      steps: [
        { id: 1, icon: '🔍', description: 'Analyze the task', toolHint: 'search_files, read_file' },
        { id: 2, icon: '✏️', description: 'Implement the solution', toolHint: 'write_file, edit_file' },
        { id: 3, icon: '🧪', description: 'Verify the implementation', toolHint: 'bash, run_tests' }
      ],
      estimatedCalls: 3
    };
  }

  displayPlan(plan) {
    const width = Math.min(60, process.stdout.columns - 4 || 60);

    let output = `\n${chalk.cyan('╭─ ')}📋 ${chalk.bold('Plan')} ${chalk.cyan('─').repeat(width - 20)}\n`;
    output += `${chalk.cyan('│')}\n`;
    output += `${chalk.cyan('│')}  ${chalk.bold('Task:')} ${plan.title}\n`;
    output += `${chalk.cyan('│')}\n`;
    output += `${chalk.cyan('│')}  ${chalk.bold('Steps:')}\n`;

    for (const step of plan.steps) {
      const stepText = `   ${step.icon}  ${step.id}. ${step.description}`;
      const padding = width - stepText.length - 2;
      output += `${chalk.cyan('│')} ${stepText}${' '.repeat(Math.max(0, padding))}${chalk.cyan('│')}\n`;
    }

    output += `${chalk.cyan('│')}\n`;
    output += `${chalk.cyan('│')}  ${chalk.dim('Estimated:')} ${plan.steps.length} steps • ~${plan.estimatedCalls || 5} tool calls\n`;
    output += `${chalk.cyan('│')}\n`;
    output += `${chalk.cyan('│')}  ${chalk.cyan('[y]')} Execute  ${chalk.cyan('[n]')} Cancel  ${chalk.cyan('[e]')} Edit  ${chalk.cyan('[s]')} Step-by-step\n`;
    output += `${chalk.cyan('╰')}${'─'.repeat(width - 1)}\n`;

    return output;
  }

  async executePlan(plan, mode = 'execute') {
    const results = [];
    const stepResults = [];

    if (mode === 'step') {
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        console.log(chalk.yellow(`\n📍 Step ${step.id}: ${step.description}`));

        const stepResult = await this.executeStep(step, stepResults);
        stepResults.push({ step, result: stepResult });
        results.push(stepResult);

        if (i < plan.steps.length - 1) {
          const continue_ = await this.promptStepContinue();
          if (continue_ === 'abort') break;
          if (continue_ === 'skip') continue;
        }
      }
    } else {
      for (const step of plan.steps) {
        const stepResult = await this.executeStep(step, stepResults);
        stepResults.push({ step, result: stepResult });
        results.push(stepResult);
      }
    }

    return {
      completed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: stepResults
    };
  }

  async executeStep(step, previousResults) {
    const contextSummary = previousResults
      .map(r => r.result?.output?.substring(0, 200))
      .filter(Boolean)
      .join('\n\n');

    const stepPrompt = `Execute step ${step.id}: ${step.description}
Tool hints: ${step.toolHint}
Previous results: ${contextSummary || 'None yet'}

Complete this step and report what you did.`;

    try {
      await this.agent.run(stepPrompt, false);
      return { success: true, step };
    } catch (err) {
      return { success: false, step, error: err.message };
    }
  }

  async promptStepContinue() {
    return new Promise((resolve) => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      readline.question(chalk.cyan('\n[c]ontinue  [s]kip  [e]dit next  [a]bort: '), (answer) => {
        readline.close();
        const a = answer.toLowerCase().charAt(0);
        if (a === 'c') resolve('continue');
        else if (a === 's') resolve('skip');
        else if (a === 'e') resolve('edit');
        else resolve('abort');
      });
    });
  }
}

export default Planner;
export { AUTO_TRIGGER_KEYWORDS, AUTO_TRIGGER_MIN_WORDS };
