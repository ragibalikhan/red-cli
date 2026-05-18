import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './base.js';

export class GeminiProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = true;
    this.client = new GoogleGenerativeAI(this.apiKey);
    this.modelInstance = this.client.getGenerativeModel({
      model: this.model
    });
  }

  formatTools(tools) {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }))
    }];
  }

  formatRequestMessages(messages) {
    const requestMessages = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
        continue;
      }

      if (typeof msg.content === 'string') {
        requestMessages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
        continue;
      }

      if (Array.isArray(msg.content)) {
        const parts = [];
        let role = msg.role === 'assistant' ? 'model' : 'user';

        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'tool_use') {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input
              }
            });
            role = 'model';
          } else if (block.type === 'tool_result') {
            parts.push({
              functionResponse: {
                name: block.name || block.tool_use_id,
                response: { content: block.content }
              }
            });
            role = 'function';
          }
        }

        requestMessages.push({ role, parts });
        continue;
      }

      requestMessages.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content ?? '') }]
      });
    }

    return { systemInstruction, messages: requestMessages };
  }

  formatMessages(messages) {
    return this.formatRequestMessages(messages).messages;
  }

  buildGenerationConfig(messages, tools = []) {
    const formatted = this.formatRequestMessages(messages);
    return {
      contents: formatted.messages,
      systemInstruction: formatted.systemInstruction || undefined,
      generationConfig: {
        temperature: 1,
        maxOutputTokens: this.maxTokens
      },
      tools: tools.length > 0 ? this.formatTools(tools) : undefined
    };
  }

  async *streamMessage(messages, tools = []) {
    try {
      const generationConfig = this.buildGenerationConfig(messages, tools);
      const result = await this.modelInstance.generateContentStream(generationConfig);

      let accumulatedText = '';
      let toolUses = [];

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          accumulatedText += text;
          yield { type: 'text', content: text };
        }

        const functionCalls = chunk.functionCalls?.() || [];
        for (const call of functionCalls) {
          toolUses.push({
            name: call.name,
            input: call.args,
            id: `call_${Date.now()}`
          });
        }
      }

      const response = await this.modelInstance.generateContent(generationConfig);

      const responseFunctionCalls = response.functionCalls?.() || [];
      if (responseFunctionCalls.length > 0) {
        toolUses = responseFunctionCalls.map(fc => ({
          name: fc.name,
          input: fc.args,
          id: `call_${Date.now()}`
        }));
      }

      yield { type: 'done', text: accumulatedText, toolUses: this.extractToolCalls(toolUses, accumulatedText) };
    } catch (err) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes('API_KEY')) {
        throw new Error('Gemini API key invalid or missing. Set GEMINI_API_KEY environment variable.');
      } else if (errorMsg.includes('quota') || errorMsg.includes('rate limit')) {
        throw new Error('Gemini API quota exceeded or rate limited. Try again later.');
      } else {
        throw new Error(`Gemini API error: ${errorMsg}`);
      }
    }
  }

  async sendMessage(messages, tools = []) {
    try {
      const generationConfig = this.buildGenerationConfig(messages, tools);
      const result = await this.modelInstance.generateContent(generationConfig);

      const text = result.text();
      const functionCalls = result.functionCalls?.() || [];

      return {
        content: text,
        toolUses: this.extractToolCalls(functionCalls.map(fc => ({
          name: fc.name,
          input: fc.args,
          id: `call_${Date.now()}`
        })), text),
        stopReason: functionCalls.length > 0 ? 'tool_use' : 'stop'
      };
    } catch (err) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes('API_KEY')) {
        throw new Error('Gemini API key invalid or missing. Set GEMINI_API_KEY environment variable.');
      } else if (errorMsg.includes('quota') || errorMsg.includes('rate limit')) {
        throw new Error('Gemini API quota exceeded or rate limited. Try again later.');
      } else {
        throw new Error(`Gemini API error: ${errorMsg}`);
      }
    }
  }
}

export default GeminiProvider;
