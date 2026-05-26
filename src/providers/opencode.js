import OpenAI from 'openai';
import chalk from 'chalk';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://opencode.ai/zen/v1';

export class OpenCodeProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = true;
  }

  getClient() {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: BASE_URL
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
          // Preserve reasoning_content for DeepSeek thinking mode
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

    if (toolCallDelta.id) existing.id = toolCallDelta.id;
    if (toolCallDelta.type) existing.type = toolCallDelta.type;
    if (toolCallDelta.function?.name) existing.function.name += toolCallDelta.function.name;
    if (toolCallDelta.function?.arguments) existing.function.arguments += toolCallDelta.function.arguments;

    toolCallsByIndex[index] = existing;
  }

  async *streamMessage(messages, tools = [], options = {}) {
    const formattedMessages = this.formatMessages(messages);
    const flatMessages = formattedMessages.flat();
    const client = this.getClient();

    const params = {
      model: this.model,
      messages: flatMessages,
      max_tokens: this.maxTokens,
      stream: true,
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    };

    const response = await client.chat.completions.create(params, {
      signal: options.signal
    });

    let accumulatedContent = '';
    let accumulatedReasoning = '';
    const toolCallsByIndex = [];

    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta;
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

    yield { type: 'done', text: accumulatedContent, reasoningContent: accumulatedReasoning || undefined, toolUses: this.extractToolCalls(parsedToolCalls, accumulatedContent), usage: { outputTokens: accumulatedContent.length / 4 } };
  }

  async sendMessage(messages, tools = [], options = {}) {
    const formattedMessages = this.formatMessages(messages);
    const flatMessages = formattedMessages.flat();
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: this.model,
      messages: flatMessages,
      max_tokens: this.maxTokens,
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    }, {
      signal: options.signal
    });

    if (!response?.choices || response.choices.length === 0) {
      throw new Error('OpenCode API returned no choices');
    }

    const message = response.choices[0].message;
    const toolCalls = message.tool_calls || [];

    return {
      content: message.content || '',
      toolUses: this.extractToolCalls(toolCalls.map(tc => this.parseToolCall(tc)), message.content || ''),
      stopReason: response.choices[0].finish_reason
    };
  }
}

export default OpenCodeProvider;