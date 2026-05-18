import { parseToolCallsFromText } from '../tool-call-parser.js';

export class BaseProvider {
  constructor(config) {
    this.config = config;
    this.model = config.model;
    this.maxTokens = config.maxTokens || 4096;
    this.apiKey = config.apiKey;
    this.supportsNativeTools = false;
  }

  async sendMessage(messages, tools = []) {
    throw new Error('Not implemented');
  }

  async *streamMessage(messages, tools = []) {
    throw new Error('Not implemented');
  }

  formatTools(tools) {
    throw new Error('Not implemented');
  }

  extractToolCalls(nativeToolCalls = [], text = '') {
    return nativeToolCalls.length > 0 ? nativeToolCalls : parseToolCallsFromText(text);
  }

  formatMessages(messages) {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return msg;
      }
      if (Array.isArray(msg.content)) {
        const formatted = [];
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            formatted.push({
              type: 'tool_call',
              id: block.id,
              name: block.name,
              arguments: block.input
            });
          } else if (block.type === 'tool_result') {
            formatted.push({
              type: 'tool_result',
              tool_call_id: block.tool_use_id,
              content: block.content
            });
          }
        }
        return { ...msg, content: formatted };
      }
      return msg;
    });
  }
}

export default BaseProvider;
