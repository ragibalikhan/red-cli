import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base.js';

export class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = true;
    this.client = new Anthropic({
      apiKey: this.apiKey
    });
  }

  formatTools(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    }));
  }

  formatRequestMessages(messages) {
    const requestMessages = [];
    let system = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n\n' : '') + msg.content;
        continue;
      }

      if (typeof msg.content === 'string') {
        requestMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
        continue;
      }

      if (Array.isArray(msg.content)) {
        const content = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            content.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input || {}
            });
          } else if (block.type === 'tool_result') {
            content.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: block.content
            });
          }
        }

        requestMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content
        });
      }
    }

    return { system, messages: requestMessages };
  }

  formatMessages(messages) {
    return this.formatRequestMessages(messages).messages;
  }

  buildCreateParams(messages, tools = []) {
    const formatted = this.formatRequestMessages(messages);
    const params = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: formatted.messages,
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    };

    if (formatted.system) {
      params.system = formatted.system;
    }

    return params;
  }

  async *streamMessage(messages, tools = [], options = {}) {
    const response = await this.client.messages.stream(
      this.buildCreateParams(messages, tools),
      { signal: options.signal }
    );

    let toolUseBlocks = [];
    let accumulatedText = '';
    const jsonBuffers = {};

    for await (const chunk of response) {
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          accumulatedText += chunk.delta.text;
          yield { type: 'text', content: chunk.delta.text };
        } else if (chunk.delta.type === 'input_json_delta') {
          const currentTool = toolUseBlocks[toolUseBlocks.length - 1];
          if (currentTool) {
            jsonBuffers[currentTool.id] = (jsonBuffers[currentTool.id] || '') + chunk.delta.partial_json;
          }
        }
      } else if (chunk.type === 'content_block_start') {
        if (chunk.content_block.type === 'tool_use') {
          toolUseBlocks.push({
            name: chunk.content_block.name,
            input: {},
            id: chunk.content_block.id
          });
        }
      }
    }

     toolUseBlocks = toolUseBlocks.map(block => {
       const json = jsonBuffers[block.id];
       if (!json) return block;

       try {
         return { ...block, input: JSON.parse(json) };
       } catch (err) {
         return { ...block, input: { error: `Invalid tool input JSON: ${err.message}`, raw: json } };
       }
     });

     yield { type: 'done', text: accumulatedText, toolUses: this.extractToolCalls(toolUseBlocks, accumulatedText) };

     const finalMessage = await response.finalMessage();
      const usage = finalMessage.usage;
      yield {
        type: 'usage',
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
          cacheReadInputTokens: usage.cache_read_input_tokens || 0
        }
      };
     yield { type: 'stop_reason', reason: finalMessage.stop_reason };
  }

  async sendMessage(messages, tools = [], options = {}) {
    const response = await this.client.messages.create(
      this.buildCreateParams(messages, tools),
      { signal: options.signal }
    );

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content: text,
      toolUses: this.extractToolCalls(response.content.filter(c => c.type === 'tool_use'), text),
      stopReason: response.stop_reason
    };
  }
}

export default AnthropicProvider;
