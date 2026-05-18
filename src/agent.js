import { getToolDefinitions, executeTool } from './tools.js';
import { loadConfig, getDefaultSystemPrompt, PROVIDERS, normalizeProviderModel } from './config.js';
import { getModeTools, getModePromptAddon } from './modes.js';
import { PROVIDER_CLASSES } from './providers/index.js';
import { renderClaudeResponse, renderToolCall, renderToolResult, renderError, renderSuccess } from './renderer.js';
import { createTokenManager, getModelLimits, estimateTokens, calculateMessageTokens } from './token-manager.js';
import { parseToolCallsFromText, getTextToolCallPrompt, getTextToolSchemaPrompt } from './tool-call-parser.js';
import ora from 'ora';
import chalk from 'chalk';

export class Agent {
  constructor(config, analytics = null) {
    this.config = config;
    this.mode = config.mode || 'code';

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
    this._initPromise = this.initProvider();
  }

  static getEffortMaxTokens(effort) {
    const map = { high: 8096, medium: 4096, low: 2048, min: 1024 };
    return map[effort] || 8096;
  }

  async initProvider() {
    const providerKey = this.config.provider || 'anthropic';
    const providerFactory = PROVIDER_CLASSES[providerKey];

    if (!providerFactory) {
      throw new Error(`Unknown provider: ${providerKey}`);
    }

    const ProviderClass = await providerFactory();

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

  async run(userMessage, isOneShot = false, options = {}) {
    await this.ensureReady();

    this.messages.push({ role: 'user', content: userMessage });
    this.abortController = new AbortController();
    const signal = options.signal || this.abortController.signal;

    const spinner = ora({ text: 'Thinking...', spinner: 'dots' }).start();

    try {
      await this.runLoop(spinner, { signal });
    } catch (err) {
      spinner.stop();
      if (err.name === 'AbortError' || /abort(ed)?/i.test(err.message || '')) {
        console.log(chalk.yellow('\n  Chat interrupted.'));
      } else {
        console.error(renderError(err.message));
        throw err;
      }
    } finally {
      this.abortController = null;
    }

    if (!isOneShot) spinner.stop();
  }

  async runLoop(spinner, options = {}) {
    const modeTools = getModeTools(this.tools, this.mode);
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
    const trimmedMessages = this.tokenManager.trimMessages(this.messages, systemPrompt);
    const allMessages = [systemMessage, ...trimmedMessages];

    // Log context usage if getting large
    const contextStats = this.tokenManager.getStats(allMessages);
    if (contextStats.percent > 80) {
      console.log(chalk.dim(`  📊 Context: ${contextStats.percent}% used (${contextStats.used}/${contextStats.limit})`));
    }

    // Estimate input tokens
    const inputTokens = calculateMessageTokens(allMessages);
    let hasOutputStarted = false;
    let accumulatedText = '';

    try {
      for await (const chunk of this.provider.streamMessage(allMessages, requestTools, { signal: options.signal })) {
        if (chunk.type === 'text') {
          accumulatedText += chunk.content;
          if (nativeToolsSupported && !hasOutputStarted) {
            hasOutputStarted = true;
            spinner.stop();
            process.stdout.write('\n');
          }
          if (nativeToolsSupported) {
            process.stdout.write(chalk.white(chunk.content));
          }
        } else if (chunk.type === 'done') {
          const responseText = chunk.text ?? accumulatedText;
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
          const outputTokens = estimateTokens(responseText || '');
          this.tokenCount += outputTokens;

          // Update analytics with token usage
          if (this.analytics) {
            this.analytics.addTokens(inputTokens, outputTokens);
          }

          if (toolUses.length > 0) {
            if (toolDepth >= maxToolRounds) {
              if (responseText && nativeToolsSupported) {
                this.messages.push({ role: 'assistant', content: responseText });
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
              content: assistantContent
            });

            await this.handleToolCalls(toolUses, modeTools, spinner);
            if (spinner && !spinner.isSpinning) {
              spinner.start('Thinking...');
            }
            await this.runLoop(spinner, { ...options, toolDepth: toolDepth + 1, maxToolRounds });
            return;
          }

          // Save assistant response into conversation history so follow-up questions keep context.
          this.messages.push({ role: 'assistant', content: responseText || '' });
          return;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError' || /abort(ed)?/i.test(err.message || '')) {
        if (spinner && spinner.isSpinning) spinner.stop();
        return;
      }
      throw err;
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
        console.log(renderError(result.error));
      } else {
        console.log(renderToolCall(toolUse.name, toolUse.input));

        try {
          result = await executeTool(toolUse.name, toolUse.input || {}, {
            workingDirectory: process.cwd(),
            onConfirm: this.onConfirm
          });
        } catch (err) {
          result = { error: err.message || String(err) };
        }

        console.log(renderToolResult(result));
        console.log('');
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

    // Reinitialize provider to ensure the new model and provider are used
    this._initPromise = this.initProvider();
    console.log(renderSuccess(`Switched to model: ${this.model}`));
  }

  setMode(modeName) {
    this.mode = modeName;
    this.config.mode = modeName;
    console.log(renderSuccess(`Switched to mode: ${modeName}`));
  }

  getStats() {
    return {
      tokens: this.tokenCount,
      toolCalls: this.toolCallCount,
      messages: this.messages.length
    };
  }
}
