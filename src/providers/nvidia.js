import BaseProvider from './base.js';

export default class NVIDIAProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = 'https://integrate.api.nvidia.com/v1';
    this.apiKey = config.apiKeys?.nvidia || config.apiKeys?.openrouter;
  }

  // Added sendMessage for AutoAgent compatibility
  async sendMessage(messages, tools = [], options = {}) {
    // NVIDIA doesn't support tools directly, so we convert to a single prompt
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

    return {
      content: response.content,
      toolUses: [],
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
    // NVIDIA's API does not support tool objects directly, so we serialize the full conversation
    // into a single prompt to preserve context across turns.
    const prompt = messages.map((message) => {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
      return `${message.role}: ${content}`;
    }).join('\n\n');

    let accumulatedText = '';
    let accumulatedReasoning = '';
    let toolUseBlocks = [];

    try {
      for await (const chunk of this.streamComplete(prompt, {
        model: this.model || 'z-ai/glm-5.1',
        signal: options.signal
      })) {
        if (chunk.reasoningContent) {
          accumulatedReasoning += chunk.reasoningContent;
        }
        if (!chunk.done && chunk.content) {
          accumulatedText += chunk.content;
          yield { type: 'text', content: chunk.content };
        }
      }
    } catch (err) {
      // Streaming can fail in some environments; fall back to non-streaming completion
      console.error(`NVIDIA stream error: ${err.message}. Falling back to non-stream completion.`);
      try {
        const res = await this.complete(prompt, { model: this.model });
        const finalContent = res.reasoningContent 
          ? `Thinking: ${res.reasoningContent}\n\nAnswer: ${res.content}` 
          : res.content;
        yield { type: 'done', text: finalContent, toolUses: [] };
        return;
      } catch (e) {
        throw new Error(`NVIDIA API error: ${e.message}`);
      }
    }

    const finalContent = accumulatedReasoning 
      ? `Thinking: ${accumulatedReasoning}\n\nAnswer: ${accumulatedText}` 
      : accumulatedText;
    yield { type: 'done', text: finalContent, toolUses: toolUseBlocks };
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