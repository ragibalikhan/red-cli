import { BaseProvider } from './base.js';

export class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.supportsNativeTools = true;
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
        result.push(msg);
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
            content: text,
            tool_calls: toolUseBlocks.map(block => ({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: block.input || {}
              }
            }))
          });
        } else if (text) {
          result.push({ role: msg.role, content: text });
        }

        for (const block of toolResultBlocks) {
          result.push({
            role: 'tool',
            content: block.content,
            tool_call_id: block.tool_use_id,
            name: block.name
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

  async *streamMessage(messages, tools = []) {
    try {
      // Check if Ollama is running first
      try {
        const checkResponse = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
        if (!checkResponse.ok) {
          throw new Error('Ollama server not responding');
        }
      } catch (checkErr) {
        throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running? (Run 'ollama serve' in terminal)`);
      }

      const formattedMessages = this.formatMessages(messages);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: formattedMessages,
          stream: true,
          tools: tools.length > 0 ? this.formatTools(tools) : undefined
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let toolUses = [];
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message) {
              if (chunk.message.content) {
                accumulatedText += chunk.message.content;
                yield { type: 'text', content: chunk.message.content };
              }
              if (chunk.message.tool_calls) {
                toolUses = chunk.message.tool_calls.map(tc => ({
                  id: tc.id || `call_${Date.now()}`,
                  name: tc.function.name,
                  input: typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments
                }));
              }
            }
            if (chunk.done) {
              yield { type: 'done', text: accumulatedText, toolUses: this.extractToolCalls(toolUses, accumulatedText) };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      if (err.message.includes('Cannot connect') || err.message.includes('not responding')) {
        throw err;
      }
      throw new Error(`Ollama error: ${err.message}`);
    }
  }

  async sendMessage(messages, tools = []) {
    try {
      // Check if Ollama is running first
      try {
        const checkResponse = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
        if (!checkResponse.ok) {
          throw new Error('Ollama server not responding');
        }
      } catch (checkErr) {
        throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running? (Run 'ollama serve' in terminal)`);
      }

      const formattedMessages = this.formatMessages(messages);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: formattedMessages,
          tools: tools.length > 0 ? this.formatTools(tools) : undefined
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const result = await response.json();
      const message = result.message;

      return {
        content: message.content || '',
        toolUses: this.extractToolCalls((message.tool_calls || []).map(tc => ({
          id: tc.id || `call_${Date.now()}`,
          name: tc.function.name,
          input: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments
        })), message.content || ''),
        stopReason: result.done ? 'stop' : 'tool_use'
      };
    } catch (err) {
      if (err.message.includes('Cannot connect') || err.message.includes('not responding')) {
        throw err;
      }
      throw new Error(`Ollama error: ${err.message}`);
    }
  }
}

export default OllamaProvider;
