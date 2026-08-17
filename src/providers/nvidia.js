import BaseProvider from './base.js';
import { parseToolCallsFromText } from '../tool-call-parser.js';

export default class NVIDIAProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = false; // NVIDIA models output tool calls as text, not native API
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
    this.apiKey = config.apiKeys?.nvidia || config.apiKeys?.openrouter;
  }

  // Added sendMessage for AutoAgent compatibility
  async sendMessage(messages, tools = [], options = {}) {
    const prompt = messages.map((message) => {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
      return `${message.role}: ${content}`;
    }).join('\n\n');

    const response = await this.complete(prompt, {
      tools: tools.length > 0,
      signal: options.signal
    });

    const toolUses = parseToolCallsFromText(response.content);

    return {
      content: response.content,
      toolUses,
      usage: response.usage
    };
  }

  async complete(prompt, options = {}) {
    const model = options.model || this.model || 'z-ai/glm-5.1';

    const body = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: false
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: options.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Try fallback endpoints on 404
      if (response.status === 404) {
        const fallbackEndpoints = [
          'https://api.nvidia.com/v1',
          'https://openrouter.ai/api/v1'
        ];
        for (const fallbackUrl of fallbackEndpoints) {
          try {
            const fallbackResponse = await fetch(`${fallbackUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body),
              signal: options.signal
            });
            if (fallbackResponse.ok) {
              const data = await fallbackResponse.json();
              this.baseUrl = fallbackUrl;
              return {
                content: data.choices[0].message.content,
                reasoningContent: data.choices[0].message.reasoning_content || null,
                usage: {
                  inputTokens: data.usage?.prompt_tokens || 0,
                  outputTokens: data.usage?.completion_tokens || 0,
                  totalTokens: data.usage?.total_tokens || 0
                },
                model: model
              };
            }
          } catch {}
        }
      }
      throw new Error(`NVIDIA API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const message = data.choices[0].message;

    return {
      content: message.content,
      reasoningContent: message.reasoning_content || null,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      model: model
    };
  }

  async *streamMessage(messages, tools = [], options = {}) {
    // NVIDIA API is OpenAI-compatible — send proper chat messages with tools
    const formattedMessages = messages.map(msg => {
      if (typeof msg.content === 'string') return { role: msg.role, content: msg.content };
      if (Array.isArray(msg.content)) {
        // Handle tool_result blocks
        const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          // Return tool results as separate messages
          return toolResults.map(tr => ({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content }));
        }
        const toolUses = msg.content.filter(b => b.type === 'tool_use');
        if (toolUses.length > 0) {
          return { role: 'assistant', content: text || null, tool_calls: toolUses.map(tu => ({ id: tu.id, type: 'function', function: { name: tu.name, arguments: JSON.stringify(tu.input || {}) } })) };
        }
        return { role: msg.role, content: text || JSON.stringify(msg.content) };
      }
      return { role: msg.role, content: JSON.stringify(msg.content) };
    }).flat();

    const body = {
      model: this.model || 'z-ai/glm-5.1',
      messages: formattedMessages,
      max_tokens: this.maxTokens || 4096,
      stream: true,
      ...(tools.length > 0 && { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) })
    };

    let accumulatedText = '';
    let accumulatedReasoning = '';
    const toolCallsByIndex = [];

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NVIDIA API error: ${response.status} - ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.reasoning_content) accumulatedReasoning += delta.reasoning_content;
            if (delta.content) {
              accumulatedText += delta.content;
              yield { type: 'text', content: delta.content };
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? toolCallsByIndex.length;
                if (!toolCallsByIndex[idx]) toolCallsByIndex[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                if (tc.id) toolCallsByIndex[idx].id = tc.id;
                if (tc.function?.name) toolCallsByIndex[idx].function.name += tc.function.name;
                if (tc.function?.arguments) toolCallsByIndex[idx].function.arguments += tc.function.arguments;
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error(`NVIDIA stream error: ${err.message}. Falling back to non-stream completion.`);
      const prompt = formattedMessages.map(m => `${m.role}: ${m.content || ''}`).join('\n\n');
      try {
        const res = await this.complete(prompt, { model: this.model });
        const fallbackToolUses = parseToolCallsFromText(res.content);
        yield { type: 'done', text: res.content, toolUses: fallbackToolUses, reasoningContent: res.reasoningContent };
        return;
      } catch (e) {
        throw new Error(`NVIDIA API error: ${e.message}`);
      }
    }

    // Parse tool calls
    const parsedToolCalls = toolCallsByIndex
      .filter(tc => tc?.function?.name)
      .map(tc => {
        let input = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch {}
        return { id: tc.id || `call_${Date.now()}`, name: tc.function.name, input };
      });

    yield { type: 'done', text: accumulatedText, toolUses: parsedToolCalls, reasoningContent: accumulatedReasoning || undefined };
  }

  async *streamComplete(prompt, options = {}) {
    const model = options.model || this.model || 'z-ai/glm-5.1';

    const body = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: options.signal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA API error: ${response.status} - ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let usage = { inputTokens: 0, outputTokens: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (delta?.reasoning_content) {
              yield { reasoningContent: delta.reasoning_content, content: null, done: false };
            }
            if (delta?.content) {
              yield { content: delta.content, reasoningContent: null, done: false };
            }
          } catch {}
        }
      }
    }

    yield { done: true, usage };
  }
}