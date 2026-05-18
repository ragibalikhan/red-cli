import chalk from 'chalk';

// Model token limits
const MODEL_LIMITS = {
  // OpenAI
  'gpt-4o': { context: 128000, maxOutput: 16384 },
  'gpt-4o-mini': { context: 128000, maxOutput: 16384 },
  'gpt-4-turbo': { context: 128000, maxOutput: 4096 },
  'gpt-4': { context: 8192, maxOutput: 4096 },
  'gpt-3.5-turbo': { context: 16385, maxOutput: 4096 },

  // Anthropic
  'claude-sonnet-4-20250729': { context: 200000, maxOutput: 8192 },
  'claude-opus-4-20250729': { context: 200000, maxOutput: 8192 },
  'claude-haiku-4-20250729': { context: 200000, maxOutput: 8192 },
  'claude-3-5-sonnet-20241022': { context: 200000, maxOutput: 8192 },

  // Gemini 2.5 (stable)
  'gemini-2.5-pro': { context: 1000000, maxOutput: 65536 },
  'gemini-2.5-flash': { context: 1000000, maxOutput: 65536 },
  'gemini-2.5-flash-lite': { context: 1000000, maxOutput: 65536 },
  // Gemini 2.0
  'gemini-2.0-flash': { context: 1000000, maxOutput: 8192 },
  'gemini-2.0-flash-exp': { context: 1000000, maxOutput: 8192 },
  // Gemini 1.5
  'gemini-1.5-pro': { context: 200000, maxOutput: 8192 },
  'gemini-1.5-flash': { context: 1000000, maxOutput: 8192 },

  // OpenCode Zen models
  'minimax-m2.5-free': { context: 200000, maxOutput: 8192 },
  'deepseek-v4-flash-free': { context: 200000, maxOutput: 8192 },
  'nemotron-3-super-free': { context: 200000, maxOutput: 8192 },
  'qwen3.6-plus-free': { context: 262000, maxOutput: 8192 },
  'glm-5-free': { context: 1000000, maxOutput: 16384 },
  'gpt-5.1-codex-mini': { context: 200000, maxOutput: 8192 },
  'gpt-5.2': { context: 200000, maxOutput: 8192 },
  'gpt-5.1-codex': { context: 200000, maxOutput: 8192 },
  'qwen3-coder-480b': { context: 262000, maxOutput: 8192 },

  // NVIDIA
  'z-ai/glm-5.1': { context: 1000000, maxOutput: 8192 },
  'deepseek-ai/deepseek-r1': { context: 64000, maxOutput: 8192 },
  'deepseek-ai/deepseek-v3': { context: 64000, maxOutput: 8192 },

  // Ollama (typically small)
  'llama3': { context: 8192, maxOutput: 4096 },
  'llama3.1': { context: 128000, maxOutput: 4096 },

  // Default fallback
  'default': { context: 32000, maxOutput: 4096 }
};

// Get model limits
export function getModelLimits(modelName) {
  // Try exact match first
  if (MODEL_LIMITS[modelName]) {
    return MODEL_LIMITS[modelName];
  }

  // Try prefix match
  for (const [key, value] of Object.entries(MODEL_LIMITS)) {
    if (modelName.includes(key) || key.includes(modelName.split('/').pop())) {
      return value;
    }
  }

  return MODEL_LIMITS.default;
}

// Estimate tokens (rough: ~4 chars per token)
export function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text === 'object') {
    text = JSON.stringify(text);
  }
  return Math.ceil(text.length / 4);
}

// Calculate total tokens in messages
export function calculateMessageTokens(messages) {
  let total = 0;

  for (const msg of messages) {
    // Role token overhead
    total += 4;

    // Content
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += estimateTokens(block.text);
        } else if (block.type === 'tool_use') {
          total += estimateTokens(block.name) + estimateTokens(JSON.stringify(block.input));
        } else if (block.type === 'tool_result') {
          total += estimateTokens(block.content);
        }
      }
    }

    // Per-message overhead
    total += 3;
  }

  return total;
}

// Smart context manager - keeps conversation under token limit
export class TokenManager {
  constructor(modelName) {
    this.modelName = modelName;
    this.limits = getModelLimits(modelName);
    this.systemPromptTokens = 0;
    this.toolsTokens = 0;
  }

  // Set system prompt token count
  setSystemPrompt(prompt) {
    this.systemPromptTokens = estimateTokens(prompt);
  }

  // Set tools token count
  setToolsTokens(toolDefs) {
    this.toolsTokens = estimateTokens(JSON.stringify(toolDefs));
  }

  // Get safe max tokens for completion
  getMaxOutputTokens() {
    return this.limits.maxOutput;
  }

  // Trim messages to fit within context limit
  // Strategy: Keep system, tools, and most recent messages
  trimMessages(messages, systemPrompt = '') {
    const contextLimit = this.limits.context;
    const reservedTokens = this.systemPromptTokens + this.toolsTokens + 1000; // buffer
    const availableForMessages = contextLimit - reservedTokens;

    if (availableForMessages <= 0) {
      console.log(chalk.yellow(`  ⚠️  Model context too small for system prompt + tools`));
      return messages.slice(-2); // Just keep last 2
    }

    // Calculate current tokens
    const currentTokens = calculateMessageTokens(messages);

    if (currentTokens <= availableForMessages) {
      return messages; // Fits, no trimming needed
    }

    console.log(chalk.dim(`  📊 Context: ${currentTokens} tokens, trimming to ${availableForMessages}...`));

    // Strategy: Keep recent messages, drop old ones
    // Keep at least: last user message + last assistant message
    const trimmed = [];
    let tokensUsed = 0;

    // Go through messages from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = calculateMessageTokens([msg]);

      if (tokensUsed + msgTokens <= availableForMessages) {
        trimmed.unshift(msg);
        tokensUsed += msgTokens;
      } else {
        // Stop when we hit limit
        break;
      }
    }

    // Ensure we have user message
    if (trimmed.length > 0 && trimmed[0].role !== 'user') {
      // Find the first user message
      const firstUserIndex = trimmed.findIndex(m => m.role === 'user');
      if (firstUserIndex > 0) {
        trimmed.splice(0, firstUserIndex);
      }
    }

    return trimmed;
  }

  // Check and warn about token limits
  validateConfig(config) {
    const maxTokens = config.maxTokens || 8096;

    if (maxTokens > this.limits.maxOutput) {
      console.log(chalk.yellow(`\n  ⚠️  Model ${this.modelName} supports max ${this.limits.maxOutput} output tokens.`));
      console.log(chalk.dim(`  Reducing maxTokens from ${maxTokens} to ${this.limits.maxOutput}\n`));
      config.maxTokens = this.limits.maxOutput;
    }

    return config;
  }

  // Get context usage stats
  getStats(messages) {
    const total = calculateMessageTokens(messages);
    const limit = this.limits.context;
    const percent = Math.round((total / limit) * 100);

    return {
      used: total,
      limit,
      percent,
      remaining: Math.max(0, limit - total)
    };
  }
}

// Create token manager for a model
export function createTokenManager(modelName) {
  return new TokenManager(modelName);
}

// Check if model supports specific feature
export function modelSupports(modelName, feature) {
  const limits = getModelLimits(modelName);

  switch (feature) {
    case 'streaming':
      return true; // Most models support streaming
    case 'tools':
      // Ollama models may not support tools well
      return !modelName.startsWith('llama');
    case 'largeContext':
      return limits.context >= 100000;
    case 'highOutput':
      return limits.maxOutput >= 8192;
    default:
      return true;
  }
}

export default {
  getModelLimits,
  estimateTokens,
  calculateMessageTokens,
  TokenManager,
  createTokenManager,
  modelSupports
};