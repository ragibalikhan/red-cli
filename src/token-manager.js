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
  'deepseek-ai/deepseek-v4-pro': { context: 64000, maxOutput: 8192 },
  'deepseek-ai/deepseek-v4-flash': { context: 64000, maxOutput: 8192 },
  'moonshotai/kimi-k2.6': { context: 256000, maxOutput: 8192 },
  'qwen/qwen3-coder-480b-a35b-instruct': { context: 256000, maxOutput: 8192 },
  'qwen/qwen3-next-80b-a3b-instruct': { context: 256000, maxOutput: 8192 },
  'minimaxai/minimax-m2.7': { context: 200000, maxOutput: 8192 },
  'minimaxai/minimax-m2.5': { context: 200000, maxOutput: 8192 },
  'meta/llama-3.3-70b-instruct': { context: 128000, maxOutput: 8192 },
  'mistralai/mixtral-8x7b-instruct': { context: 32000, maxOutput: 4096 },
  'nvidia/llama-3.1-nemotron-ultra-253b-v1': { context: 128000, maxOutput: 8192 },
  'nvidia/llama-3.3-nemotron-super-49b-v1.5': { context: 128000, maxOutput: 8192 },
  'nvidia/nvidia-nemotron-nano-9b-v2': { context: 128000, maxOutput: 8192 },

  // Ollama (typically small)
  'llama3': { context: 8192, maxOutput: 4096 },
  'llama3.1': { context: 128000, maxOutput: 4096 },

  // Default fallback
  'default': { context: 32000, maxOutput: 4096 }
};

// Tokenizer instances (lazy loaded)
let gptTokenizer = null;
let anthropicTokenizer = null;

// Get model limits
export function getModelLimits(modelName) {
  if (!modelName) return MODEL_LIMITS.default;

  // Try exact match first
  if (MODEL_LIMITS[modelName]) {
    return MODEL_LIMITS[modelName];
  }

  const nameLower = modelName.toLowerCase();
  const shortName = modelName.split('/').pop()?.toLowerCase() || '';

  // Try prefix/substring match
  for (const [key, value] of Object.entries(MODEL_LIMITS)) {
    const keyLower = key.toLowerCase();
    if (nameLower.includes(keyLower) || keyLower.includes(shortName)) {
      return value;
    }
  }

  // Broader match: check each part of the model name against keys
  const parts = nameLower.split(/[/\-_ ]/);
  for (const part of parts) {
    if (part.length < 3) continue;
    for (const [key, value] of Object.entries(MODEL_LIMITS)) {
      if (key.toLowerCase().includes(part)) {
        return value;
      }
    }
  }

  return MODEL_LIMITS.default;
}

// Initialize tokenizers with fallback
async function initializeTokenizers() {
  try {
    if (!gptTokenizer) {
      const gptTokenizerModule = await import('gpt-tokenizer');
      // gpt-tokenizer exports a default instance that we can use directly
      gptTokenizer = gptTokenizerModule.default;
      if (process.env.DEBUG === 'true') console.log(chalk.dim('  🔧 GPT tokenizer loaded'));
    }
    
    if (!anthropicTokenizer) {
      const anthropicTokenizerModule = await import('@anthropic-ai/tokenizer');
      // @anthropic-ai/tokenizer exports a default object with getTokenizer method
      const { getTokenizer } = anthropicTokenizerModule.default;
      anthropicTokenizer = getTokenizer();
      if (process.env.DEBUG === 'true') console.log(chalk.dim('  🔧 Anthropic tokenizer loaded'));
    }
  } catch (error) {
    console.warn(chalk.yellow('  ⚠️  Failed to load tokenizers, falling back to heuristic estimation'));
    console.warn(chalk.yellow('     Error:', error.message));
    // Keep as null to trigger fallback
  }
}

// Estimate tokens with exact counting for supported models
export async function estimateTokens(text, model = 'default') {
  if (!text) return 0;
  if (typeof text === 'object') {
    text = JSON.stringify(text);
  }

  // Try to use exact tokenizers for OpenAI and Anthropic models
  try {
    await initializeTokenizers();
    
    // OpenAI models (using o200k_base for GPT-4o/5.x, cl100k_base for older)
    if (model.startsWith('gpt-4o') || model.startsWith('gpt-5')) {
      if (gptTokenizer) {
        const tokens = gptTokenizer.encode(text).length;
        if (process.env.DEBUG === 'true') console.log(chalk.dim(`  🔢 OpenAI tokens for '${text.substring(0, 20)}...': ${tokens}`));
        return tokens;
      }
    } else if (model.startsWith('gpt-') || model.startsWith('text-')) {
      // Legacy OpenAI models - use cl100k_base encoding
      // For simplicity, we'll use the same tokenizer but note it's an approximation
      if (gptTokenizer) {
        const tokens = gptTokenizer.encode(text).length;
        if (process.env.DEBUG === 'true') console.log(chalk.dim(`  🔢 Legacy OpenAI tokens for '${text.substring(0, 20)}...': ${tokens}`));
        return tokens;
      }
    } 
    // Anthropic models
    else if (model.startsWith('claude-')) {
      if (anthropicTokenizer) {
        const tokens = anthropicTokenizer.encode(text).length;
        if (process.env.DEBUG === 'true') console.log(chalk.dim(`  🔢 Anthropic tokens for '${text.substring(0, 20)}...': ${tokens}`));
        return tokens;
      }
    }
    // For known model families (Gemini/Ollama/etc), use approximation
    else if (
      model.startsWith('gemini-') || 
      model.startsWith('llama') ||
      model.includes('/') ||  // Providers like 'deepseek-ai/deepseek-v3'
      model.includes('-free') // OpenCode Zen models
    ) {
      if (gptTokenizer) {
        const tokens = gptTokenizer.encode(text).length;
        if (process.env.DEBUG === 'true') console.log(chalk.dim(`  🔢 Approximation tokens for '${text.substring(0, 20)}...': ${tokens}`));
        return tokens;
      }
    }
    // For completely unknown models, fall back to heuristic
    else {
      // Will fall through to heuristic below
    }
  } catch (error) {
    console.warn(chalk.yellow(`  ⚠️  Tokenizer error: ${error.message}`));
    // Fall through to heuristic below
  }

  // Graceful fallback to old heuristic
  const fallback = Math.ceil(text.length / 4);
  if (process.env.DEBUG === 'true') console.log(chalk.dim(`  🔢 Fallback tokens for '${text.substring(0, 20)}...': ${fallback}`));
  return fallback;
}

// Synchronous version for backward compatibility (uses heuristic)
export function estimateTokensSync(text) {
  if (!text) return 0;
  if (typeof text === 'object') {
    text = JSON.stringify(text);
  }
  return Math.ceil(text.length / 4);
}

// Calculate total tokens in messages
export async function calculateMessageTokens(messages, model = 'default') {
  let total = 0;

  for (const msg of messages) {
    // Role token overhead
    total += 4;

    // Content
    if (typeof msg.content === 'string') {
      total += await estimateTokens(msg.content, model);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += await estimateTokens(block.text, model);
        } else if (block.type === 'tool_use') {
          total += await estimateTokens(block.name, model) + await estimateTokens(JSON.stringify(block.input), model);
        } else if (block.type === 'tool_result') {
          total += await estimateTokens(block.content, model);
        }
      }
    }

    // Per-message overhead
    total += 3;
  }

  return total;
}

// Synchronous version for backward compatibility
export function calculateMessageTokensSync(messages) {
  let total = 0;

  for (const msg of messages) {
    // Role token overhead
    total += 4;

    // Content
    if (typeof msg.content === 'string') {
      total += estimateTokensSync(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += estimateTokensSync(block.text);
        } else if (block.type === 'tool_use') {
          total += estimateTokensSync(block.name) + estimateTokensSync(JSON.stringify(block.input));
        } else if (block.type === 'tool_result') {
          total += estimateTokensSync(block.content);
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
  async setSystemPrompt(prompt) {
    this.systemPromptTokens = await estimateTokens(prompt, this.modelName);
  }

  // Set tools token count
  async setToolsTokens(toolDefs) {
    this.toolsTokens = await estimateTokens(JSON.stringify(toolDefs), this.modelName);
  }

  // Get safe max tokens for completion
  getMaxOutputTokens() {
    return this.limits.maxOutput;
  }

  // Trim messages to fit within context limit
  // Strategy: Keep system, tools, and most recent messages
  async trimMessages(messages, systemPrompt = '') {
    const contextLimit = this.limits.context;
    const reservedTokens = this.systemPromptTokens + this.toolsTokens + 1000; // buffer
    const availableForMessages = contextLimit - reservedTokens;

    if (availableForMessages <= 0) {
      console.log(chalk.yellow(`  ⚠️  Model context too small for system prompt + tools`));
      return messages.slice(-2); // Just keep last 2
    }

    // Calculate current tokens
    const currentTokens = await calculateMessageTokens(messages, this.modelName);

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
      const msgTokens = await calculateMessageTokens([msg], this.modelName);

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
  async getStats(messages) {
    const total = await calculateMessageTokens(messages, this.modelName);
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
  estimateTokensSync,
  calculateMessageTokens,
  calculateMessageTokensSync,
  TokenManager,
  createTokenManager,
  modelSupports
};