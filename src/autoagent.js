import chalk from 'chalk';
import { Planner } from './planner.js';
import { getModeTools } from './modes.js';
import { executeTool } from './tools.js';
import { renderToolCall, renderToolResult } from './renderer.js';
import { parseToolCallsFromText, getTextToolCallPrompt, getTextToolSchemaPrompt } from './tool-call-parser.js';

const COMPLETION_TAG_REGEX = /<task_complete>[\s\S]*?<\/task_complete>/;
const COMPLETION_SUMMARY_REGEX = /<summary>([\s\S]*?)<\/summary>/;
const COMPLETION_FILES_REGEX = /<files_changed>([\s\S]*?)<\/files_changed>/;
const COMPLETION_NEXT_REGEX = /<next_steps>([\s\S]*?)<\/next_steps>/;

const DESTRUCTIVE_PATTERNS = /\b(rm|rmdir|del|drop table|mkfs|dd)\b/i;
const CONFIRM_PATTERNS = [DESTRUCTIVE_PATTERNS, /npm install|pip install|yarn add|cargo add/i, /git push|git force/i];

async function checkTaskCompletion(agent, messages, toolCallHistory, task, iteration, maxIterations) {
  if (iteration >= maxIterations) {
    return { complete: true, reason: 'max iterations reached' };
  }

  if (iteration > 3 && toolCallHistory.length > 5) {
    const lastTools = toolCallHistory.slice(-5);
    const allSame = lastTools.every(t => t.name === lastTools[0].name);
    if (allSame) {
      return { complete: false, reason: 'loop detected - continuing' };
    }
  }

  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop();

  if (!lastAssistantMsg) {
    return { complete: false, reason: 'no assistant response yet' };
  }

  const hasToolCalls = lastAssistantMsg.content?.some && lastAssistantMsg.content.some(b => b.type === 'tool_use');

  if (!hasToolCalls && iteration > 2) {
    try {
      const checkPrompt = `
Given this conversation and tool results, has the original task been completed?

Original task: ${task}

Last few actions:
${toolCallHistory.slice(-5).map(t => `- ${t.name}: ${JSON.stringify(t.input).slice(0, 100)}`).join('\n')}

Reply with ONLY: {"complete": true/false, "reason": "why"}
`;

      const response = await agent.provider.sendMessage(
        [{ role: 'user', content: checkPrompt }],
        []
      );

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.complete) {
          return { complete: true, reason: result.reason || 'AI confirmed completion' };
        }
      }
    } catch (e) {
      return { complete: false, reason: 'completion check failed' };
    }
  }

  return { complete: false, reason: 'task still in progress' };
}

export class AutoAgent {
  constructor(agent, options = {}) {
    this.agent = agent;
    this.planner = new Planner(agent);
    this.maxIterations = options.maxIterations || 50;
    this.maxTime = options.maxTime || 600000;
    this.startTime = null;
    this.iteration = 0;
    this.toolCallHistory = [];
    this.filesChanged = new Set();
    this.isRunning = false;
    // Uses this.agent.messages directly - no redundant copy
  }

  async run(task, options = {}) {
    this.isRunning = true;
    this.startTime = Date.now();
    this.iteration = 0;
    this.toolCallHistory = [];
    this.filesChanged = new Set();
    // Reset handled by agent.clearHistory() or start fresh

    console.log(chalk.cyan.bold('\n═══ Auto Agent Mode ═══'));
    console.log(chalk.dim(`Task: ${task}`));
    console.log(chalk.dim(`Max iterations: ${this.maxIterations}, Max time: ${Math.round(this.maxTime / 60000)}m\n`));

    if (this.agent.provider?.supportsNativeTools !== true) {
      console.log(chalk.yellow('[WARNING] This provider does not expose native tool calling. Auto mode will use structured text tool-call fallback.\n'));
    }

    const plan = await this.planner.planTask(task);
    console.log(this.planner.displayPlan(plan));

    const confirmed = await this.promptConfirmation('Execute this plan?');
    if (!confirmed) {
      console.log(chalk.yellow('Plan cancelled.'));
      return { cancelled: true };
    }

    const result = await this.executeAutoLoop(task, plan, options);

    if (result.completed) {
      this.displayCompletionReport(task, result);
    }

    this.isRunning = false;
    return result;
  }

  async executeAutoLoop(task, plan, options) {
    // Start with clean message history for each run
    this.agent.messages = [];
    let context = this.buildContext(task, plan);

    while (this.iteration < this.maxIterations && this.isRunning) {
      this.iteration++;
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;

      this.displayProgress(mins, secs);

      if (elapsed > this.maxTime) {
        console.log(chalk.yellow('\n⏱ Time limit reached.'));
        break;
      }

      const shouldConfirm = this.shouldPauseForConfirmation();

      if (shouldConfirm) {
        const proceed = await this.promptConfirmation('\n⚠️  Confirmation required. Proceed?');
        if (!proceed) {
          console.log(chalk.yellow('\nStopped by user.'));
          break;
        }
      }

      try {
        const response = await this.executeIteration(context);

        if (this.isCompletionSignal(response)) {
          return this.parseCompletionSignal(response);
        }

        const completionCheck = await checkTaskCompletion(
          this.agent,
          this.agent.messages,
          this.toolCallHistory,
          task,
          this.iteration,
          this.maxIterations
        );

        if (completionCheck.complete) {
          return {
            completed: true,
            iterations: this.iteration,
            elapsed: Date.now() - this.startTime,
            summary: completionCheck.reason,
            filesChanged: Array.from(this.filesChanged),
            toolCalls: this.toolCallHistory.length
          };
        }

        if (this.isStuckInLoop()) {
          console.log(chalk.yellow('\n⚠️  Detected possible loop. Pausing...'));
          const proceed = await this.promptConfirmation('Continue?');
          if (!proceed) break;
          this.resetToolHistory();
        }

        context += '\n' + response;

      } catch (err) {
        console.log(chalk.red(`\nError on iteration ${this.iteration}: ${err.message}`));

        // If it's a message format error, clear the problematic messages
        if (err.message.includes('tool_call_id') || err.message.includes('tool_calls')) {
          // Remove the last user message that might have caused the issue
          const lastMsg = this.agent.messages[this.agent.messages.length - 1];
          if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
            this.agent.messages.pop();
          }
        }

        const proceed = await this.promptConfirmation('Retry?');
        if (!proceed) break;
      }
    }

    return {
      completed: false,
      iterations: this.iteration,
      elapsed: Date.now() - this.startTime,
      message: 'Max iterations reached or stopped'
    };
  }

  buildContext(task, plan) {
    return `You are in auto-agent mode. Complete the following task by executing tool calls autonomously.

Task: ${task}

Plan:
${plan.steps.map(s => `${s.id}. ${s.description}`).join('\n')}

${this.agent.provider?.supportsNativeTools === true ? '' : getTextToolCallPrompt() + '\n\n' + getTextToolSchemaPrompt(getModeTools(this.agent.tools, this.agent.mode)) + '\n'}

IMPORTANT: When the task is complete, include this XML tag in your response:
<task_complete>
  <summary>What was accomplished</summary>
  <files_changed>list of files created/modified</files_changed>
  <next_steps>any remaining suggestions</next_steps>
</task_complete>`;
  }

  async executeIteration(context) {
    const modeTools = getModeTools(this.agent.tools, this.agent.mode);
    const nativeToolsSupported = this.agent.provider?.supportsNativeTools === true;
    const requestTools = nativeToolsSupported ? modeTools : [];
    const toolMap = {};
    for (const t of modeTools) {
      toolMap[t.name] = t;
    }

    // Add user message to agent's message history
    this.agent.messages.push({ role: 'user', content: context });

    const stream = await this.agent.provider.streamMessage(this.agent.messages, requestTools);
    let response = '';
    let toolCallsContent = [];  // Store tool_use blocks for assistant message
    let toolResultsContent = [];  // Store tool_result blocks
    const runToolUses = async (toolUses, callBlocks, resultBlocks) => {
      for (const toolUse of toolUses) {
        const toolDef = toolMap[toolUse.name];
        if (!toolDef) {
          console.log(chalk.red(`Tool not available: ${toolUse.name}`));
          continue;
        }

        console.log(renderToolCall(toolUse.name, toolUse.input));

        callBlocks.push({
          type: 'tool_use',
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input
        });

        try {
          const result = await executeTool(toolUse.name, toolUse.input, {
            workingDirectory: process.cwd(),
            onConfirm: this.agent.onConfirm
          });

          console.log(renderToolResult(result));

          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          });

          this.toolCallHistory.push({ name: toolUse.name, input: toolUse.input });
        } catch (err) {
          console.log(chalk.red(`Tool error: ${err.message}`));
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${err.message}`
          });
        }
      }
    };

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        response += chunk.content;
        process.stdout.write(chalk.white(chunk.content));
      }

      // Handle tool calls
      if (chunk.toolUses && chunk.toolUses.length > 0) {
        await runToolUses(chunk.toolUses, toolCallsContent, toolResultsContent);
      }
    }

    if (toolCallsContent.length === 0) {
      const textToolUses = parseToolCallsFromText(response);
      if (textToolUses.length > 0) {
        await runToolUses(textToolUses, toolCallsContent, toolResultsContent);
      }
    }

    // Save assistant message with tool_use blocks
    this.agent.messages.push({
      role: 'assistant',
      content: toolCallsContent.length > 0 ? toolCallsContent : response
    });

    // If there were tool results, add them as a user message
    if (toolResultsContent.length > 0) {
      this.agent.messages.push({
        role: 'user',
        content: toolResultsContent
      });

      // Continue conversation to get final response
      const followUpStream = await this.agent.provider.streamMessage(this.agent.messages, requestTools);
      let followUpResponse = '';
      let followUpToolCalls = [];

      for await (const followUpChunk of followUpStream) {
        if (followUpChunk.type === 'text') {
          followUpResponse += followUpChunk.content;
          process.stdout.write(chalk.white(followUpChunk.content));
        }
        // Handle tool calls in followup response
        if (followUpChunk.toolUses && followUpChunk.toolUses.length > 0) {
          followUpToolCalls = followUpChunk.toolUses;
        }
      }

      if (followUpToolCalls.length === 0) {
        followUpToolCalls = parseToolCallsFromText(followUpResponse);
      }

      // If followup also has tool calls, handle them
      if (followUpToolCalls.length > 0) {
        const toolMap = {};
        for (const t of modeTools) {
          toolMap[t.name] = t;
        }

        const followUpToolResults = [];
        for (const toolUse of followUpToolCalls) {
          const toolDef = toolMap[toolUse.name];
          if (!toolDef) {
            console.log(chalk.red(`Tool not available: ${toolUse.name}`));
            continue;
          }

          console.log(renderToolCall(toolUse.name, toolUse.input));

          try {
            const result = await executeTool(toolUse.name, toolUse.input, {
              workingDirectory: process.cwd(),
              onConfirm: this.agent.onConfirm
            });
            console.log(renderToolResult(result));
            followUpToolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            });
          } catch (err) {
            console.log(chalk.red(`Tool error: ${err.message}`));
            followUpToolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${err.message}`
            });
          }
        }

        // Add tool results and make another round
        this.agent.messages.push({
          role: 'assistant',
          content: followUpToolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input }))
        });
        this.agent.messages.push({
          role: 'user',
          content: followUpToolResults
        });

        // Get final response after tool execution
        const finalStream = await this.agent.provider.streamMessage(this.agent.messages, requestTools);
        let finalResponse = '';
        for await (const finalChunk of finalStream) {
          if (finalChunk.type === 'text') {
            finalResponse += finalChunk.content;
            process.stdout.write(chalk.white(finalChunk.content));
          }
        }

        if (finalResponse) {
          this.agent.messages.push({ role: 'assistant', content: finalResponse });
          return finalResponse;
        }
      }

      // Add final assistant response
      if (followUpResponse) {
        this.agent.messages.push({ role: 'assistant', content: followUpResponse });
        return followUpResponse;
      }
    }

    return response;
  }

  shouldPauseForConfirmation() {
    const lastCalls = this.toolCallHistory.slice(-3);
    if (lastCalls.length >= 3) {
      const allSame = lastCalls.every(c => c.name === lastCalls[0].name && JSON.stringify(c.input) === JSON.stringify(lastCalls[0].input));
      if (allSame) return true;
    }

    const lastCall = this.toolCallHistory[this.toolCallHistory.length - 1];
    if (lastCall?.name === 'bash' && CONFIRM_PATTERNS.some(p => p.test(lastCall.input?.command || ''))) {
      return true;
    }

    return false;
  }

  isStuckInLoop() {
    const recent = this.toolCallHistory.slice(-6);
    if (recent.length >= 6) {
      const names = recent.map(c => c.name);
      const unique = new Set(names).size;

      // Also check if same inputs are being repeated (same file, same pattern)
      if (unique === 1 && recent.length === 6) {
        const lastInputs = recent.map(c => JSON.stringify(c.input).slice(0, 100));
        const sameInputs = lastInputs.every(i => i === lastInputs[0]);
        if (sameInputs) {
          return true;
        }
      }
    }
    return false;
  }

  resetToolHistory() {
    this.toolCallHistory = this.toolCallHistory.slice(-2);
  }

  isCompletionSignal(text) {
    return COMPLETION_TAG_REGEX.test(text);
  }

  parseCompletionSignal(text) {
    const summary = (text.match(COMPLETION_SUMMARY_REGEX)?.[1] || '').trim();
    const files = (text.match(COMPLETION_FILES_REGEX)?.[1] || '').trim();
    const nextSteps = (text.match(COMPLETION_NEXT_REGEX)?.[1] || '').trim();

    return {
      completed: true,
      iterations: this.iteration,
      elapsed: Date.now() - this.startTime,
      summary,
      filesChanged: files ? files.split('\n').filter(Boolean) : [],
      nextSteps
    };
  }

  displayProgress(mins, secs) {
    const progress = `[Auto ${chalk.cyan('●')}] Step ${this.iteration}/${this.maxIterations} • ${mins}m ${secs}s elapsed`;
    process.stdout.write(`\r${chalk.dim(progress)}`);
  }

  displayCompletionReport(task, result) {
    const elapsedMins = Math.floor(result.elapsed / 60000);
    const elapsedSecs = Math.floor((result.elapsed % 60000) / 1000);

    const files = result.filesChanged || [];
    const created = files.filter(f => !f.startsWith('~'));
    const modified = files.filter(f => f.startsWith('~'));

    console.log(chalk.green(`
╭─ ✅ Task Complete ${'─'.repeat(40)}╮
│
│  ${chalk.bold('Task:')} ${task}
│  ${chalk.bold('Duration:')} ${elapsedMins}m ${elapsedSecs}s • ${chalk.bold('Iterations:')} ${result.iterations}
│
│  ${chalk.bold('Files Changed:')} ${files.length}
${created.length > 0 ? `│   ${chalk.green('Created:')} ${created.length}\n│    ${created.map(f => '+ ' + f).join('\n│    ')}` : ''}
${modified.length > 0 ? `│   ${chalk.yellow('Modified:')} ${modified.length}\n│    ${modified.map(f => '~ ' + f.replace('~ ', '')).join('\n│    ')}` : ''}
│
│  ${chalk.dim('[d] View diff  [s] Save report  [c] Continue')}
╰${'─'.repeat(56)}╯
    `));
  }

  async promptConfirmation(prompt) {
    // Use main REPL's readline instance if available to avoid input duplication
    if (global.__red_rl) {
      return new Promise((resolve) => {
        global.__red_rl.question(chalk.cyan(`${prompt} [y/n]: `), (answer) => {
          resolve(answer.toLowerCase().startsWith('y'));
        });
      });
    }
    // Fallback: create new interface only if no global instance
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan(`${prompt} [y/n]: `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  stop() {
    this.isRunning = false;
  }

  getStats() {
    return {
      iterations: this.iteration,
      elapsed: Date.now() - this.startTime,
      toolCalls: this.toolCallHistory.length,
      filesChanged: this.filesChanged.size
    };
  }
}

export default AutoAgent;
