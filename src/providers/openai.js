import OpenAI from 'openai';
import chalk from 'chalk';
import { BaseProvider } from './base.js';

const OPENAI_MODEL_TOKEN_LIMITS = {
  'gpt-4-turbo': 4096,
  'gpt-4-turbo-0613': 4096,
  'gpt-4-turbo-preview': 4096,
  'gpt-4-turbo-1106-preview': 4096,
  'gpt-3.5-turbo': 4096,
  'gpt-3.5-turbo-0613': 4096,
  'gpt-3.5-turbo-16k': 16384,
  'gpt-3.5-turbo-16k-0613': 16384,
  'gpt-4o-mini': 4096,
  'gpt-4o': 8192,
  'gpt-4': 8192,
  'gpt-4-0613': 8192,
  'gpt-4-32k': 32768,
};

function getOpenAIModelLimit(model) {
  if (!model) return null;
  const name = model.toLowerCase();
  for (const prefix of Object.keys(OPENAI_MODEL_TOKEN_LIMITS)) {
    if (name.startsWith(prefix)) {
      return OPENAI_MODEL_TOKEN_LIMITS[prefix];
    }
  }
  return null;
}

function getOpenAIRequestMaxTokens(model, requested) {
  const limit = getOpenAIModelLimit(model);
  return limit ? Math.min(requested, limit) : requested;
}

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = true;
    const limit = getOpenAIModelLimit(this.model);
    if (limit && this.maxTokens > limit) {
      console.warn(chalk.yellow(`\n[WARNING] OpenAI model ${this.model} supports at most ${limit} completion tokens. ` +
        `Configured maxTokens=${this.maxTokens} will be reduced to ${limit}.\n`));
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1'
    });
  }

  formatTools(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  formatMessages(messages) {
    const result = [];
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        if (msg.role === 'system') {
          result.push(msg);
        } else {
          const formatted = { role: msg.role, content: msg.content };
          if (msg.reasoning_content) formatted.reasoning_content = msg.reasoning_content;
          result.push(formatted);
        }
        continue;
      }
      if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');
        const toolUseBlocks = msg.content.filter(block => block.type === 'tool_use');
        const toolResultBlocks = msg.content.filter(block => block.type === 'tool_result');

        if (toolUseBlocks.length > 0) {
          result.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolUseBlocks.map(block => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {})
              }
            }))
          });
        } else if (text) {
          result.push({ role: msg.role, content: text });
        }

        for (const block of toolResultBlocks) {
          result.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: block.content
          });
        }

        if (toolUseBlocks.length === 0 && toolResultBlocks.length === 0 && !text) {
          result.push({ role: msg.role, content: '' });
        }
        continue;
      }
      result.push(msg);
    }
    return result;
  }

  parseToolCall(tc) {
    let input = {};
    try {
      input = JSON.parse(tc.function?.arguments || '{}');
    } catch (err) {
      input = { error: `Invalid tool arguments JSON: ${err.message}`, raw: tc.function?.arguments || '' };
    }

    return {
      id: tc.id,
      name: tc.function?.name,
      input
    };
  }

  mergeToolCallDelta(toolCallsByIndex, toolCallDelta) {
    const index = toolCallDelta.index ?? toolCallsByIndex.length;
    const existing = toolCallsByIndex[index] || {
      id: undefined,
      type: 'function',
      function: { name: '', arguments: '' }
    };

    if (toolCallDelta.id) {
      existing.id = toolCallDelta.id;
    }
    if (toolCallDelta.type) {
      existing.type = toolCallDelta.type;
    }
    if (toolCallDelta.function?.name) {
      existing.function.name += toolCallDelta.function.name;
    }
    if (toolCallDelta.function?.arguments) {
      existing.function.arguments += toolCallDelta.function.arguments;
    }

    toolCallsByIndex[index] = existing;
  }

  async *streamMessage(messages, tools = [], options = {}) {
    const formattedMessages = this.formatMessages(messages);
    const flatMessages = formattedMessages.flat();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: flatMessages,
      max_tokens: getOpenAIRequestMaxTokens(this.model, this.maxTokens),
      stream: true,
      stream_options: { include_usage: true },
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    }, {
      signal: options.signal
    });

    let accumulatedContent = '';
    const toolCallsByIndex = [];
    let accumulatedReasoning = '';

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.reasoning_content) {
        accumulatedReasoning += delta.reasoning_content;
      }

      if (delta.content) {
        accumulatedContent += delta.content;
        yield { type: 'text', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          this.mergeToolCallDelta(toolCallsByIndex, tc);
        }
      }
    }

     const parsedToolCalls = toolCallsByIndex
       .filter(tc => tc?.function?.name)
       .map(tc => this.parseToolCall(tc));

     yield { type: 'done', text: accumulatedContent, reasoningContent: accumulatedReasoning || undefined, toolUses: this.extractToolCalls(parsedToolCalls, accumulatedContent) };

     // Get final usage from OpenAI
     const finalResponse = await response;
     const usage = finalResponse.usage;
     
     yield { 
       type: 'usage', 
       usage: {
         inputTokens: usage.prompt_tokens,
         outputTokens: usage.completion_tokens,
         cacheCreationInputTokens: usage.prompt_tokens_details?.cached_tokens || 0,
         cacheReadInputTokens: 0 // OpenAI doesn't separate cache read/write in the same way
       }
     };
  }

  async sendMessage(messages, tools = [], options = {}) {
    const formattedMessages = this.formatMessages(messages);
    const flatMessages = formattedMessages.flat();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: flatMessages,
      max_tokens: getOpenAIRequestMaxTokens(this.model, this.maxTokens),
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    }, {
      signal: options.signal
    });

    const message = response.choices[0].message;
    const toolCalls = message.tool_calls || [];

    return {
      content: message.content || '',
      toolUses: this.extractToolCalls(toolCalls.map(tc => this.parseToolCall(tc)), message.content || ''),
      stopReason: response.choices[0].finish_reason
    };
  }
}

export default OpenAIProvider;
