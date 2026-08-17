/**
 * Task Tool — spawns subagents for delegated work.
 * The parent agent calls this tool to invoke a specialized subagent.
 * Results flow back as tool output.
 */
import { ChildSession } from './session.js';
import { getAgent } from './registry.js';

/**
 * Create a task tool instance bound to the parent agent's config.
 * @param {Object} parentConfig - Parent agent's provider config
 * @param {Object} options - { onSubagentStart, onSubagentDone, onSubagentError }
 * @returns {Object} Tool definition
 */
export function createTaskTool(parentConfig, options = {}) {
  const { onSubagentStart, onSubagentDone, onSubagentError, onSubagentToolCall, onSubagentToolResult } = options;

  return {
    name: 'task',
    description: `Delegate a task to a specialized subagent. Available agents:
- recon: Reconnaissance and enumeration
- exploit: Exploit development and testing
- audit: Code and security audit
- report: Finding correlation and report generation
- pentest: Penetration testing execution

Use this tool to parallelize work. Spawn multiple agents for independent tasks.`,
    input_schema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['recon', 'exploit', 'audit', 'report', 'pentest'],
          description: 'Which subagent to invoke',
        },
        prompt: {
          type: 'string',
          description: 'Task description for the subagent. Be specific about what to do and what target.',
        },
      },
      required: ['agent', 'prompt'],
    },
    execute: async (input, context) => {
      const { agent: agentName, prompt } = input;

      // Look up agent config
      const agentConfig = getAgent(agentName);
      if (!agentConfig) {
        return { error: `Unknown agent: ${agentName}. Available: recon, exploit, audit, report, pentest` };
      }

      // Create child session
      const child = new ChildSession(agentConfig, parentConfig);

      // Wire up events
      if (onSubagentStart) {
        child.on('start', onSubagentStart);
      }
      if (onSubagentDone) {
        child.on('done', onSubagentDone);
      }
      if (onSubagentError) {
        child.on('error', onSubagentError);
      }

      // Run the subagent
      try {
        const result = await child.run(prompt, {
          signal: context?.signal,
          onToolCall: onSubagentToolCall ? (tool) => onSubagentToolCall({ ...tool, agentName }) : undefined,
          onToolResult: onSubagentToolResult ? (tool) => onSubagentToolResult({ ...tool, agentName }) : undefined,
        });
        return result;
      } catch (err) {
        return { error: `Subagent "${agentName}" failed: ${err.message}` };
      }
    },
  };
}

/**
 * Create parallel task tool — spawns multiple subagents concurrently.
 * @param {Object} parentConfig
 * @param {Object} options
 * @returns {Object}
 */
export function createParallelTaskTool(parentConfig, options = {}) {
  const { onSubagentStart, onSubagentDone, onSubagentError, onSubagentToolCall, onSubagentToolResult } = options;

  return {
    name: 'parallel_task',
    description: `Spawn multiple subagents in parallel for independent tasks.
Each task runs concurrently. Returns all results when all complete.

Example: Run recon and exploit simultaneously on a target.`,
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: {
                type: 'string',
                enum: ['recon', 'exploit', 'audit', 'report', 'pentest'],
              },
              prompt: { type: 'string' },
            },
            required: ['agent', 'prompt'],
          },
          description: 'List of tasks to run in parallel',
        },
      },
      required: ['tasks'],
    },
    execute: async (input, context) => {
      const { tasks } = input;

      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { error: 'No tasks provided' };
      }

      // Spawn all subagents in parallel
      const promises = tasks.map(async (task) => {
        const agentConfig = getAgent(task.agent);
        if (!agentConfig) {
          return { agent: task.agent, error: `Unknown agent: ${task.agent}` };
        }

        const child = new ChildSession(agentConfig, parentConfig);

        if (onSubagentStart) child.on('start', onSubagentStart);
        if (onSubagentDone) child.on('done', onSubagentDone);
        if (onSubagentError) child.on('error', onSubagentError);

        try {
          const result = await child.run(task.prompt, {
            signal: context?.signal,
            onToolCall: onSubagentToolCall ? (tool) => onSubagentToolCall({ ...tool, agentName: task.agent }) : undefined,
            onToolResult: onSubagentToolResult ? (tool) => onSubagentToolResult({ ...tool, agentName: task.agent }) : undefined,
          });
          return { agent: task.agent, result };
        } catch (err) {
          return { agent: task.agent, error: err.message };
        }
      });

      const results = await Promise.all(promises);

      // Format results
      const output = results.map(r => {
        if (r.error) {
          return `[${r.agent}] ERROR: ${r.error}`;
        }
        return `[${r.agent}] ${r.result}`;
      }).join('\n\n');

      return output;
    },
  };
}
