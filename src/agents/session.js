import { EventEmitter } from 'events';
import { getToolDefinitions, executeTool } from '../tools.js';
import { getModeTools } from '../modes.js';
import { createTokenManager } from '../token-manager.js';
import { parseToolCallsFromText, getTextToolCallPrompt, getTextToolSchemaPrompt, hasToolCallPatterns } from '../tool-call-parser.js';
import chalk from 'chalk';

/**
 * ChildSession — runs a subagent with restricted tools and its own context.
 * Inspired by opencode's subagent architecture: fresh session, filtered tools,
 * returns result to parent.
 */
export class ChildSession extends EventEmitter {
  /**
   * @param {import('./registry.js').AgentConfig} agentConfig
   * @param {Object} providerConfig - Provider config (api key, model, etc.)
   * @param {Object} options
   */
  constructor(agentConfig, providerConfig, options = {}) {
    super();
    this.agent = agentConfig;
    this.config = providerConfig;
    this.messages = [];
    this.maxSteps = agentConfig.maxSteps || 25;
    this.result = null;
    this.error = null;

    // Get all tools, then filter by agent's allowed list
    const allTools = getToolDefinitions();
    this.tools = allTools.filter(t =>
      agentConfig.tools.includes('*') || agentConfig.tools.includes(t.name)
    );

    // Token manager for context management
    this.tokenManager = createTokenManager(providerConfig.model || 'gpt-4o');
  }

  /**
   * Run the subagent with a given prompt.
   * Returns the final text result.
   * @param {string} prompt - Task description
   * @param {Object} options - { signal, onChunk, onToolCall, onToolResult }
   * @returns {Promise<string>} Final result text
   */
  async run(prompt, options = {}) {
    const { signal, onChunk, onToolCall, onToolResult } = options;

    // Initialize provider for this child session
    await this._initProvider();

    // Build messages with agent's system prompt
    this.messages = [
      { role: 'system', content: this.agent.systemPrompt },
      { role: 'user', content: prompt },
    ];

    this.emit('start', { name: this.agent.name, prompt });

    try {
      await this._runLoop(signal, { onChunk, onToolCall, onToolResult });
      this.emit('done', { name: this.agent.name, result: this.result });
      return this.result || '(no result)';
    } catch (err) {
      this.error = err.message;
      this.emit('error', { name: this.agent.name, error: err.message });
      return `Error: ${err.message}`;
    }
  }

  /**
   * Initialize provider for this child session
   */
  async _initProvider() {
    const { PROVIDER_CLASSES } = await import('../providers/index.js');
    const providerKey = this.config.provider || 'anthropic';
    const ProviderClass = await PROVIDER_CLASSES[providerKey]();

    const providerConfig = {
      ...this.config,
      apiKey: this.config.apiKeys?.[providerKey] || this.config.apiKey,
    };

    this.provider = new ProviderClass(providerConfig);
  }

  /**
   * Core execution loop — same as Agent.runLoop but simplified
   */
  async _runLoop(signal, options = {}) {
    const { onChunk, onToolCall, onToolResult } = options;
    const nativeToolsSupported = this.provider?.supportsNativeTools === true;
    const requestTools = nativeToolsSupported ? this.tools : [];

    // Build system prompt — add text tool-call instructions when native tools not supported
    let systemPrompt = this.agent.systemPrompt;
    if (!nativeToolsSupported && this.tools.length > 0) {
      systemPrompt += `\n\n${getTextToolCallPrompt()}\n\n${getTextToolSchemaPrompt(this.tools)}`;
    }
    this.tokenManager.setSystemPrompt(systemPrompt);
    this.tokenManager.setToolsTokens(requestTools);

    const systemMessage = { role: 'system', content: systemPrompt };
    const trimmedMessages = await this.tokenManager.trimMessages(this.messages, systemPrompt);
    const allMessages = [systemMessage, ...trimmedMessages];

    // Send to provider
    const stream = this.provider.streamMessage(allMessages, requestTools, { signal });

    let accumulatedText = '';
    const toolCallsByIndex = [];

    for await (const chunk of stream) {
      if (signal?.aborted) break;

      if (chunk.type === 'text') {
        accumulatedText += chunk.content;
        if (onChunk) onChunk(chunk.content);
      }

      if (chunk.type === 'toolUse' && chunk.toolUses?.length > 0) {
        // Process tool calls
        for (const toolUse of chunk.toolUses) {
          if (onToolCall) onToolCall({ name: toolUse.name, input: toolUse.input });

          let result;
          try {
            result = await executeTool(toolUse.name, toolUse.input || {}, {
              workingDirectory: process.cwd(),
            });
          } catch (err) {
            result = { error: err.message };
          }

          if (onToolResult) onToolResult({ name: toolUse.name, result });

          // Add tool call and result to messages
          this.messages.push({
            role: 'assistant',
            content: accumulatedText || undefined,
            tool_use: [{ id: toolUse.id, name: toolUse.name, input: toolUse.input }],
          });
          this.messages.push({
            role: 'user',
            tool_result: [{ tool_use_id: toolUse.id, content: JSON.stringify(result) }],
          });

          accumulatedText = '';
        }

        // Continue loop with tool results
        return this._runLoop(signal, options);
      }

      if (chunk.type === 'done') {
        let toolUses = chunk.toolUses || [];
        if (toolUses.length === 0 && !nativeToolsSupported) {
          toolUses = parseToolCallsFromText(chunk.text || accumulatedText);
          if (toolUses.length === 0 && hasToolCallPatterns(chunk.text || accumulatedText || '')) {
            const retryCount = this._textRetryCount || 0;
            if (retryCount < 2) {
              this._textRetryCount = retryCount + 1;
              console.error(`[ChildSession] [RETRY] Tool-call-like patterns detected but parsing failed. Re-prompting (attempt ${this._textRetryCount + 1})...`);
              this.messages.push({ role: 'assistant', content: chunk.text || accumulatedText || '' });
              this.messages.push({ role: 'user', content: 'Your response was not valid tool-call JSON. Output ONLY the JSON object like: {"tool_calls":[{"name":"bash","input":{"command":"ls"}}]}. No other text. Try again.' });
              return this._runLoop(signal, options);
            }
            console.error('[ChildSession] Tool-call-like patterns detected but parsing failed after retries. Displaying as text.');
          }
          if (toolUses.length > 0) {
            this._textRetryCount = 0;
          }
        }
        if (toolUses.length > 0) {
          for (const toolUse of toolUses) {
            if (onToolCall) onToolCall({ name: toolUse.name, input: toolUse.input });

            let result;
            try {
              result = await executeTool(toolUse.name, toolUse.input || {}, {
                workingDirectory: process.cwd(),
              });
            } catch (err) {
              result = { error: err.message };
            }

            if (onToolResult) onToolResult({ name: toolUse.name, result });

            this.messages.push({
              role: 'assistant',
              content: chunk.text || undefined,
              tool_use: [{ id: toolUse.id, name: toolUse.name, input: toolUse.input }],
            });
            this.messages.push({
              role: 'user',
              tool_result: [{ tool_use_id: toolUse.id, content: JSON.stringify(result) }],
            });
          }
          return this._runLoop(signal, options);
        }

        this.result = chunk.text || accumulatedText;
        return;
      }
    }
  }
}

/**
 * Parse @agent mentions from user input.
 * Returns { agentName, prompt } or null.
 * Example: "@recon scan example.com" → { agent: "recon", prompt: "scan example.com" }
 */
export function parseAgentMention(text) {
  const match = text.match(/^@(\w+)\s+(.+)$/s);
  if (match) {
    return { agent: match[1], prompt: match[2] };
  }
  return null;
}
