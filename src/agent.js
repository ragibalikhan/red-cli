import { getToolDefinitions, executeTool } from './tools.js';
import { loadConfig, getDefaultSystemPrompt, PROVIDERS, normalizeProviderModel } from './config.js';
import { getModeTools, getModePromptAddon } from './modes.js';
import { detectMode } from './mode-detector.js';
import { PROVIDER_CLASSES } from './providers/index.js';
import { renderClaudeResponse, renderToolCall, renderToolResult, renderError, renderSuccess } from './renderer.js';
import { createTokenManager, getModelLimits, estimateTokens, calculateMessageTokens } from './token-manager.js';
import { parseToolCallsFromText, getTextToolCallPrompt, getTextToolSchemaPrompt } from './tool-call-parser.js';
import { createMemory } from './memory.js';
import { EventEmitter } from 'events';
import ora from 'ora';
import chalk from 'chalk';

export class Agent extends EventEmitter {
  constructor(config, analytics = null) {
    super();
    this.config = config;
    this.mode = config.mode || 'recon';

    // Initialize token manager with model-specific limits
    this.tokenManager = createTokenManager(config.model || 'gpt-4o');

    // Validate and adjust max tokens
    this.maxTokens = config.maxTokens || Agent.getEffortMaxTokens(config.effort);
    this.maxTokens = Math.min(this.maxTokens, this.tokenManager.getMaxOutputTokens());

    this.tools = getToolDefinitions();
    this.messages = [];
    this.onConfirm = null;
    this.provider = null;
    this.tokenCount = 0;
    this.toolCallCount = 0;
    this.analytics = analytics;
    this.memory = createMemory();
    this._mcpManager = null;
    this._initPromise = this.initProvider();
    this._consecutiveProviderErrors = 0;
  }

  static getEffortMaxTokens(effort) {
    const map = { high: 8096, medium: 4096, low: 2048, min: 1024 };
    return map[effort] || 8096;
  }

  static _clipToolResult(result, contextWindow) {
    const maxTokens = Math.min(Math.max(Math.round(contextWindow * 0.1), 2000), 20000);

    if (typeof result === 'string') {
      const approximateTokens = Math.ceil(result.length / 4);
      if (approximateTokens <= maxTokens) return result;
      const charsPerToken = 4;
      const maxChars = maxTokens * charsPerToken;
      const headChars = Math.floor(maxChars * 0.6);
      const tailChars = Math.floor(maxChars * 0.3);

      const head = result.slice(0, headChars);
      const tail = result.slice(-tailChars);
      const truncated = Math.ceil((result.length - headChars - tailChars) / 4);
      return `${head}\n\n[... ${truncated} tokens truncated ...]\n\n${tail}`;
    }

    if (typeof result === 'object' && result !== null) {
      const str = JSON.stringify(result, null, 2);
      if (str.length <= maxTokens * 4) return result;
      return { error: `Tool output too large (${str.length} chars, max ${maxTokens * 4})`, truncated: true };
    }

    return result;
  }

  async initProvider() {
    if (this.provider) return;

    const providerKey = this.config.provider || 'anthropic';
    const providerFactory = PROVIDER_CLASSES[providerKey];

    if (!providerFactory) {
      throw new Error(`Unknown provider: ${providerKey}`);
    }

    const ProviderClass = await providerFactory();

    // Allow tests or subclasses to override the provider before init completes
    if (this.provider) return;

    const providerConfig = {
      ...this.config,
      apiKey: this.config.apiKeys?.[providerKey] || this.config.apiKey
    };

    if (this.config.baseUrl) {
      providerConfig.baseUrl = this.config.baseUrl;
    }

    this.provider = new ProviderClass(providerConfig);
    this.model = this.config.model;
  }

  async ensureReady() {
    await this._initPromise;
  }

  setConfirmCallback(callback) {
    this.onConfirm = callback;
  }

  attachMcpManager(mcpManager) {
    this._mcpManager = mcpManager;
    const mcpTools = mcpManager.listTools().map(t => ({
      name: `mcp__${t.name}`,
      description: t.description || `MCP tool from "${t.serverName}"`,
      input_schema: t.inputSchema,
      mcpServer: t.serverName
    }));
    this.tools = [...this.tools, ...mcpTools];
  }

    async run(userMessage, isOneShot = false, options = {}) {
        // Handle /compact command
        if (userMessage.trim() === '/compact') {
            await this.handleCompact();
            return;
        }

        await this.ensureReady();

        // Auto-detect intent and switch mode
        const detected = detectMode(userMessage);
        if (detected && detected !== this.mode) {
          const oldMode = this.mode;
          this.setMode(detected);
          console.log(chalk.dim(`  🔄 Detected intent — switched ${oldMode} → ${detected}\n`));
        }

        this.messages.push({ role: 'user', content: userMessage });
        this.abortController = new AbortController();
        const signal = options.signal || this.abortController.signal;

        // Use no-op spinner when running silently (e.g., from Ink REPL which renders its own UI)
        const isSilent = this.config.silent === true;
        let spinner;
        if (isSilent) {
          spinner = { text: '', isSpinning: false };
          spinner.start = () => spinner;
          spinner.stop = () => spinner;
          spinner.succeed = () => spinner;
          spinner.fail = () => spinner;
        } else {
          spinner = ora({ text: chalk.dim(`Thinking... ${this.mode} mode`), spinner: 'dots' }).start();
        }
        const spinnerStart = Date.now();
        const msgCount = this.messages.length;
        const spinnerTimer = isSilent ? null : setInterval(() => {
          const elapsed = ((Date.now() - spinnerStart) / 1000).toFixed(1);
          spinner.text = chalk.dim(`Thinking... ${elapsed}s │ ${this.mode} │ ${msgCount} msgs`);
        }, 100);

        try {
            await this.runLoop(spinner, { signal });
        } catch (err) {
            if (spinnerTimer) clearInterval(spinnerTimer);
            if (spinner && spinner.isSpinning) spinner.stop();
            if (err.name === 'AbortError' || /abort(ed)?/i.test(err.message || '')) {
                return;
            }
            const errorText = `Provider error: ${err.message}`;
            this.messages.push({ role: 'assistant', content: errorText });
            process.stdout.write('\n' + chalk.red(errorText) + '\n');
        } finally {
            if (spinnerTimer) clearInterval(spinnerTimer);
            if (!isOneShot && spinner && spinner.isSpinning) spinner.stop();
            this.abortController = null;
        }
    }

  async runLoop(spinner, options = {}) {
    const modeTools = this.config.noTools ? [] : getModeTools(this.tools, this.mode);
    const nativeToolsSupported = this.provider?.supportsNativeTools === true;
    const requestTools = nativeToolsSupported ? modeTools : [];
    const toolDepth = options.toolDepth || 0;
    const maxToolRounds = options.maxToolRounds || this.config.maxToolRounds || 8;
    const systemPrompt = this.buildSystemPrompt(modeTools);

    // Configure token manager
    this.tokenManager.setSystemPrompt(systemPrompt);
    this.tokenManager.setToolsTokens(requestTools);

    const systemMessage = { role: 'system', content: systemPrompt };

    // Smart context trimming - keep conversation under token limit
    const trimmedMessages = await this.tokenManager.trimMessages(this.messages, systemPrompt);
    const allMessages = [systemMessage, ...trimmedMessages];

    // Log context usage if getting large
    const contextStats = this.tokenManager.getStats(allMessages);
    if (contextStats.percent > 80) {
      console.log(chalk.dim(`  📊 Context: ${contextStats.percent}% used (${contextStats.used}/${contextStats.limit})`));
    }

    // Auto-compact if context exceeds 90% to prevent provider timeouts
    if (contextStats.percent > 90 && toolDepth === 0 && this.messages.length > 4) {
      console.log(chalk.yellow('\n  ⚠️  Context nearly full. Auto-compacting before call...\n'));
      await this.handleCompact();
      // Rebuild messages after compact
      const trimmedMessages2 = await this.tokenManager.trimMessages(this.messages, systemPrompt);
      const allMessages2 = [systemMessage, ...trimmedMessages2];
      const contextStats2 = this.tokenManager.getStats(allMessages2);
      if (contextStats2.percent > 80) {
        console.log(chalk.dim(`  📊 Context after compact: ${contextStats2.percent}% used (${contextStats2.used}/${contextStats2.limit})`));
      }
    }

    // Reset trimmedMessages and allMessages after potential compact
    const trimmedMessagesFinal = await this.tokenManager.trimMessages(this.messages, systemPrompt);
    const allMessagesFinal = [systemMessage, ...trimmedMessagesFinal];

    // Estimate input tokens
    const inputTokens = await calculateMessageTokens(allMessagesFinal);
    let hasOutputStarted = false;
    let accumulatedText = '';
    let providerUsage = null;

    try {
      for await (const chunk of this.provider.streamMessage(allMessagesFinal, requestTools, { signal: options.signal })) {
        if (chunk.type === 'text') {
          accumulatedText += chunk.content;
          this.emit('chunk', chunk.content);
          if (nativeToolsSupported && !hasOutputStarted) {
            hasOutputStarted = true;
            spinner.stop();
            if (!this.config.silent) process.stdout.write('\n');
          }
          if (nativeToolsSupported && !this.config.silent) {
            process.stdout.write(chalk.white(chunk.content));
          }
        } else if (chunk.type === 'usage') {
          providerUsage = chunk.usage;
        } else if (chunk.type === 'done') {
          this._consecutiveProviderErrors = 0;
          const responseText = chunk.text ?? accumulatedText;
          const reasoningContent = chunk.reasoningContent;
          let toolUses = chunk.toolUses || [];

          if (!nativeToolsSupported && toolUses.length === 0) {
            toolUses = parseToolCallsFromText(responseText);
          }

          if (!hasOutputStarted) {
            spinner.stop();
          }

          if (!nativeToolsSupported && toolUses.length === 0 && responseText) {
            process.stdout.write('\n' + chalk.white(responseText));
          }

          console.log('\n');
          const outputTokens = await estimateTokens(responseText || '');
          this.tokenCount += outputTokens;

          if (this.analytics) {
            if (providerUsage) {
              this.analytics.addProviderUsage(providerUsage);
            } else {
              this.analytics.addTokens(inputTokens, outputTokens);
            }
          }

          if (toolUses.length > 0) {
            // Tool call loop guard: if same tool calls repeat, stop
            const sig = toolUses.map(t => `${t.name}:${JSON.stringify(t.input || {})}`).join('|');
            if (this._lastToolSig && this._lastToolSig === sig) {
              console.log(chalk.yellow('\n  ⚠️  Tool call loop detected (same tools as previous round). Stopping.\n'));
              if (responseText && nativeToolsSupported) {
                this.messages.push({ role: 'assistant', content: responseText, ...(reasoningContent && { reasoning_content: reasoningContent }) });
              }
              this._lastToolSig = null;
              return;
            }
            this._lastToolSig = sig;

            if (toolDepth >= maxToolRounds) {
              if (responseText && nativeToolsSupported) {
                this.messages.push({ role: 'assistant', content: responseText, ...(reasoningContent && { reasoning_content: reasoningContent }) });
              }
              console.log(renderError(`Stopped after ${maxToolRounds} tool rounds to avoid an infinite loop.`));
              return;
            }

            toolUses = toolUses.map((toolUse, index) => ({
              ...toolUse,
              id: toolUse.id || `call_${Date.now()}_${index}`,
              input: toolUse.input || {}
            }));

            const assistantContent = [];
            if (nativeToolsSupported && responseText.trim()) {
              assistantContent.push({ type: 'text', text: responseText });
            }
            assistantContent.push(...toolUses.map(toolUse => ({
              type: 'tool_use',
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input
            })));

            this.messages.push({
              role: 'assistant',
              content: assistantContent,
              ...(reasoningContent && { reasoning_content: reasoningContent })
            });

            await this.handleToolCalls(toolUses, modeTools, spinner);
            if (spinner && !spinner.isSpinning) {
              spinner.start('Thinking...');
            }
            await this.runLoop(spinner, { ...options, toolDepth: toolDepth + 1, maxToolRounds });
            return;
          }

          // Dedup guard: detect repetitive responses and stop
          if (responseText && responseText.length > 100) {
            const lastN = this.messages.filter(m => m.role === 'assistant').slice(-3);
            const repeats = lastN.filter(m =>
              typeof m.content === 'string' && m.content.length > 100 &&
              m.content.substring(0, 80) === responseText.substring(0, 80)
            ).length;
            if (repeats >= 2) {
              console.log(chalk.yellow('\n  ⚠️  Detected repetitive response. Stopping to avoid loop.\n'));
              this.messages.push({ role: 'assistant', content: responseText || '', ...(reasoningContent && { reasoning_content: reasoningContent }) });
              return;
            }
          }

          // Save assistant response into conversation history so follow-up questions keep context.
          this.messages.push({ role: 'assistant', content: responseText || '', ...(reasoningContent && { reasoning_content: reasoningContent }) });
          this.emit('done', { text: responseText, usage: providerUsage });
          return;
        }
      }
    } catch (err) {
      if (spinner && spinner.isSpinning) spinner.stop();
      if (err.name === 'AbortError' || /abort(ed)?/i.test(err.message || '')) {
        return;
      }

      const statusCode = err.message.match(/\d{3}/)?.[0];
      const isAuthError = statusCode === '401' || statusCode === '403';

      // Don't retry auth/permission errors — they won't resolve
      if (isAuthError) {
        console.log(chalk.red(`\n  ✗ Permission denied (${statusCode}). Check model access in your provider's console.`));
        console.log(chalk.dim(`  ${err.message.slice(0, 200)}\n`));
        this.messages.push({ role: 'assistant', content: `Permission error (${statusCode}). Check your API key and model access.` });
        this._consecutiveProviderErrors = 0;
        return;
      }

      this._consecutiveProviderErrors++;
      if (this._consecutiveProviderErrors >= 3) {
        console.log(chalk.red(`\n  ✗ ${this._consecutiveProviderErrors} consecutive provider errors. Stopping.`));
        console.log(chalk.yellow('  💡 Tip: Check your API key, network, or run /compact to reduce context.\n'));
        this.messages.push({ role: 'assistant', content: `Stopped after ${this._consecutiveProviderErrors} consecutive provider errors.` });
        this._consecutiveProviderErrors = 0;
        return;
      }
      console.log(chalk.yellow(`\n  ⚠️  Provider error (${this._consecutiveProviderErrors}/3): ${err.message}`));

      // Compact if context is large before retry to prevent compounding timeouts
      if (this.messages.length > 4 && this.tokenManager) {
        const systemMsg = { role: 'system', content: this.buildSystemPrompt(getModeTools(this.tools, this.mode)) };
        const allM = [systemMsg, ...this.messages];
        const ctxStats = this.tokenManager.getStats(allM);
        if (ctxStats.percent > 70) {
          console.log(chalk.dim('  📦 Auto-compacting before retry...'));
          await this.handleCompact();
        }
      }

      console.log(chalk.dim('  Retrying...\n'));
      await this.runLoop(spinner, { ...options, toolDepth: 0 });
    }
  }

  async handleToolCalls(toolUses, availableTools, spinner) {
    const toolMap = {};
    for (const t of availableTools) {
      toolMap[t.name] = t;
    }

    const toolResults = [];

    for (const [index, toolUse] of toolUses.entries()) {
      const toolUseId = toolUse.id || `call_${Date.now()}_${index}`;
      const toolDef = toolMap[toolUse.name];
      let result;

      if (!toolDef) {
        result = { error: `Tool not available in ${this.mode} mode: ${toolUse.name}` };
        this.emit('toolCall', { name: toolUse.name, input: toolUse.input, error: true });
        if (!this.config.silent) console.log(renderError(result.error));
      } else {
        this.emit('toolCall', { name: toolUse.name, input: toolUse.input });
        if (!this.config.silent) console.log(renderToolCall(toolUse.name, toolUse.input));

        try {
          result = await executeTool(toolUse.name, toolUse.input || {}, {
            workingDirectory: process.cwd(),
            onConfirm: this.onConfirm,
            mcpManager: this._mcpManager
          });
        } catch (err) {
          result = { error: err.message || String(err) };
        }

        this.emit('toolResult', { name: toolUse.name, result });
        if (!this.config.silent) console.log(renderToolResult(result));
        if (!this.config.silent) console.log('');
      }

      this.toolCallCount++;
      if (this.analytics) {
        this.analytics.addToolCall(toolUse.name);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        name: toolUse.name,
        content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      });
    }

    if (toolResults.length > 0) {
      this.messages.push({
        role: 'user',
        content: toolResults
      });
    }
  }

    buildSystemPrompt(modeTools = getModeTools(this.tools, this.mode)) {
     let prompt = this.config.systemPrompt || getDefaultSystemPrompt();
     prompt = prompt.replace('{cwd}', process.cwd());
     prompt = prompt.replace('{mode}', this.mode.toUpperCase());

     const modeAddon = getModePromptAddon(this.mode);
     if (modeAddon) {
       prompt += '\n\n' + modeAddon;
     }

     if (modeTools.length > 0) {
       const toolList = modeTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
       prompt += `\n\nAvailable tools:\n${toolList}`;

       if (this.provider?.supportsNativeTools !== true) {
         prompt += `\n\n${getTextToolCallPrompt()}\n\n${getTextToolSchemaPrompt(modeTools)}`;
       }
     }

      // Append memory (strip ANSI codes), safe if memory is missing or throws
      try {
        const memoryPrompt = this.memory?.toPrompt() || '';
        const strippedMemoryPrompt = memoryPrompt.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        if (strippedMemoryPrompt.trim()) {
          prompt += '\n\n' + strippedMemoryPrompt;
        }
      } catch {}

      return prompt;
   }

  clearHistory() {
    this.messages = [];
    this.tokenCount = 0;
    this.toolCallCount = 0;
  }

  getHistory() {
    return this.messages;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  switchModel(modelName) {
    const newConfig = { ...this.config, model: modelName };
    normalizeProviderModel(newConfig);

    this.model = newConfig.model;
    this.config.model = newConfig.model;
    this.config.provider = newConfig.provider;

    // Reset provider so initProvider creates a fresh one
    this.provider = null;
    this._initPromise = this.initProvider();
  }

  setMode(modeName) {
    this.mode = modeName;
    this.config.mode = modeName;
    console.log(renderSuccess(`Switched to mode: ${modeName}`));
  }

   /**
   * Handle the /compact command - summarizes conversation to save tokens
   */
   async handleCompact() {
     if (this.messages.length === 0) {
       console.log(chalk.yellow('  ⚠️  No conversation to compact'));
       return;
     }

     // Show compacting message
     const spinner = ora({ text: 'Compacting conversation...', spinner: 'dots' }).start();

     try {
       // Build a summarization prompt
       const summaryPrompt = `
You are an expert conversation summarizer. Create a concise summary of the conversation history 
focusing on: Objectives, Key Decisions, Files Touched, and Open Questions.

Format your response as:

**Objectives**
- [Main goals and tasks discussed]

**Key Decisions**  
- [Important technical decisions made]

**Files Touched**
- [List of files that were read, modified, or created]

**Open Questions**
- [Unresolved issues or questions for follow-up]

Be concise but comprehensive. Focus on information that would be useful for continuing the conversation.
`;

       // Prepare messages for summarization (excluding system messages to save tokens)
       const userMessages = this.messages.filter(m => m.role !== 'system');

       // Create a temporary agent for summarization (to avoid polluting main conversation)
       const summaryAgentConfig = {
         ...this.config,
         model: this.config.model,
         temperature: 0.3, // Lower temperature for more focused summarization
         maxTokens: 1024   // Limit summary length
       };

       const { Agent: SummaryAgent } = await import('../src/agent.js');
       const summaryAgent = new SummaryAgent(summaryAgentConfig, this.analytics);

       // Get summary from the model
       let summaryText = '';
       for await (const chunk of summaryAgent.provider.streamMessage(
         [
           { role: 'system', content: summaryPrompt },
           ...userMessages.map(m => ({ role: m.role, content: m.content }))
         ],
         [], // No tools needed for summarization
         {}
       )) {
         if (chunk.type === 'text') {
           summaryText += chunk.content;
         }
       }

       // Extract token counts before and after
       const beforeTokens = await calculateMessageTokens(this.messages, this.config.model);
       const afterMessages = [
         { role: 'system', content: this.buildSystemPrompt() },
         { role: 'assistant', content: `Conversation compacted. Summary: ${summaryText}` },
         { role: 'user', content: '(Continuing conversation...)' }
       ];
       const afterTokens = await calculateMessageTokens(afterMessages, this.config.model);
       const tokensSaved = beforeTokens - afterTokens;
       const savingsPercent = beforeTokens > 0 ? Math.round((tokensSaved / beforeTokens) * 100) : 0;

       // Create a decision-category memory entry for the summary
       this.memory.remember(`compact_${Date.now()}`, {
         type: 'decision',
         content: summaryText,
         timestamp: new Date().toISOString(),
         model: this.config.model
       });

       // Replace conversation history with summary + seed message
       this.messages = [
         { role: 'system', content: this.buildSystemPrompt() },
         { role: 'assistant', content: `Conversation compacted. Summary: ${summaryText}` },
         { role: 'user', content: '(Continuing conversation...)' }
       ];

       // Update token count
       this.tokenCount = afterTokens;

       spinner.succeed(`  ✓ Conversation compacted! Saved ~${tokensSaved} tokens (${savingsPercent}% reduction)`);
       
       // Log the summary for user visibility
       console.log(chalk.dim(`\n📋 Summary:\n${summaryText}\n`));
     } catch (err) {
       spinner.fail('  ✗ Failed to compact conversation');
       console.error(chalk.red(`  Error: ${err.message}`));
       // Don't throw - just continue with original conversation
     }
   }

   getStats() {
     return {
       tokens: this.tokenCount,
       toolCalls: this.toolCallCount,
       messages: this.messages.length
     };
   }
}
