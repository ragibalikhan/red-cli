import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.red');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

function loadEnvFile() {
  // Check multiple locations for .env file
  const envPaths = [
    join(process.cwd(), '.env'),
    join(homedir(), '.red', '.env'),
    join(homedir(), '.env')
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();
            if (key && value) {
              process.env[key] = value;
            }
          }
        }
      } catch {}
    }
  }
}

loadEnvFile();

const DEFAULT_SYSTEM_PROMPT = `You are Red, an autonomous agentic CLI for authorized tasks.

RULES:
- Use tools to execute commands - do NOT describe what to run
- Show actual results, not bash code blocks
- Be concise

AVAILABLE: bash, read_file, write_file, list_directory, search_files, edit_file

MODE: {mode}
CWD: {cwd}`;

export const DEFAULTS = {
  provider: 'openai',
  model: 'gpt-4o',
  maxTokens: 8096,
  effort: 'high',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  mode: 'code',
  theme: 'dark',
  autoConfirmBash: false,
  blockedCommands: ['rm -rf /', 'mkfs', 'dd if='],
  memory: true,
  historySize: 1000,
  streamOutput: true,
  baseUrl: null,
  extraBody: {}
};

export const PROVIDERS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  OPENROUTER: 'openrouter',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  NVIDIA: 'nvidia',
  OPENCODE: 'opencode'
};

export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENCODE_DEFAULT_BASE_URL = 'https://opencode.ai/zen/v1';

export function normalizeProviderModel(config) {
  if (!config || typeof config.model !== 'string') return config;

  const parts = config.model.split('/');
  if (parts.length >= 2) {
    const prefix = parts[0].toLowerCase();
    const modelName = parts.slice(1).join('/');
    const validProviders = Object.values(PROVIDERS);

    if (validProviders.includes(prefix)) {
      config.provider = prefix;
      config.model = modelName;
    }
  }

  // Clear stale provider-specific endpoint state when switching to a provider that does not use it.
  if ([PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI].includes(config.provider)) {
    if ([NVIDIA_DEFAULT_BASE_URL, OPENROUTER_DEFAULT_BASE_URL, OPENCODE_DEFAULT_BASE_URL, 'http://localhost:11434'].includes(config.baseUrl)) {
      console.warn(`\n[WARNING] Saved baseUrl (${config.baseUrl}) looks like a different provider endpoint for provider ${config.provider}. Clearing stale baseUrl for this session.`);
      config.baseUrl = null;
    }
  }

  if (config.provider === PROVIDERS.OPENROUTER && !config.baseUrl) {
    config.baseUrl = process.env.OPENROUTER_API_URL || OPENROUTER_DEFAULT_BASE_URL;
  }

  if (config.provider === PROVIDERS.NVIDIA && !config.baseUrl) {
    config.baseUrl = process.env.NVIDIA_API_URL || NVIDIA_DEFAULT_BASE_URL;
  }

  if (config.provider === PROVIDERS.OLLAMA && !config.baseUrl) {
    config.baseUrl = 'http://localhost:11434';
  }

  if (config.provider === PROVIDERS.OPENCODE && !config.baseUrl) {
    config.baseUrl = process.env.OPENCODE_API_URL || OPENCODE_DEFAULT_BASE_URL;
  }

  return config;
}

// NVIDIA hosted open source models.
// Keep these IDs aligned with https://docs.api.nvidia.com/nim/reference/llm-apis.
export const NVIDIA_MODELS = [
  { id: 'z-ai/glm-5.1', name: 'GLM-5.1', description: 'Z.ai - coding and long-context reasoning', context: '1M' },
  { id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek-V4 Pro', description: 'DeepSeek - advanced reasoning', context: '64K' },
  { id: 'deepseek-ai/deepseek-v4-flash', name: 'DeepSeek-V4 Flash', description: 'DeepSeek - faster general use', context: '64K' },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', description: 'Moonshot - long context and tool use', context: '256K' },
  { id: 'qwen/qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder 480B', description: 'Qwen - code-specialized model', context: '256K' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct', name: 'Qwen3 Next 80B', description: 'Qwen - efficient general model', context: '256K' },
  { id: 'minimaxai/minimax-m2.7', name: 'MiniMax M2.7', description: 'MiniMax - general and multilingual work', context: '200K' },
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Meta - open source flagship', context: '128K' },
  { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', description: 'Mistral - efficient mixture model', context: '32K' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Nemotron Ultra 253B', description: 'NVIDIA - strongest Nemotron model', context: '128K' },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', name: 'Nemotron Super 49B v1.5', description: 'NVIDIA - balanced Nemotron model', context: '128K' },
  { id: 'nvidia/nvidia-nemotron-nano-9b-v2', name: 'Nemotron Nano 9B v2', description: 'NVIDIA - fast lightweight model', context: '128K' }
];

export const NVIDIA_MODEL_ALIASES = {
  'deepseek-ai/deepseek-r1': 'deepseek-ai/deepseek-v4-pro',
  'deepseek-ai/deepseek-v3': 'deepseek-ai/deepseek-v4-flash',
  'qwen/qwen3-coder-next': 'qwen/qwen3-coder-480b-a35b-instruct',
  'minimax/minimax-m2.7': 'minimaxai/minimax-m2.7',
  'nvidia/llama-3.1-nemotron-70b-instruct': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/numina-7b-math-instruct': 'nvidia/nvidia-nemotron-nano-9b-v2'
};

export function normalizeNvidiaModel(model) {
  return NVIDIA_MODEL_ALIASES[model] || model || 'moonshotai/kimi-k2.6';
}

export const MODES = {
  CODE: 'code',
  REVIEW: 'review',
  ASK: 'ask',
  DEVOPS: 'devops',
  DOCS: 'docs',
  COMMIT: 'commit'
};

export const MODE_CONFIGS = {
  code: {
    description: 'Default. Full tool access. Focuses on writing and editing code.',
    tools: 'all',
    promptAddon: ''
  },
  review: {
    description: 'Read-only tools only. Reviews code, suggests improvements, no writes.',
    tools: ['read_file', 'list_directory', 'search_files'],
    promptAddon: 'You are in review mode. Only read files and provide analysis. Do not modify any files.'
  },
  ask: {
    description: 'No tools. Pure Q&A mode. Fast, cheap, no side effects.',
    tools: [],
    promptAddon: 'You are in ask mode. Answer questions concisely. Do not use any tools.'
  },
  devops: {
    description: 'Focused on shell, git, docker, CI. Extra bash permissions.',
    tools: 'all',
    promptAddon: 'You are in devops mode. Focus on shell commands, git operations, docker, and CI/CD tasks.'
  },
  docs: {
    description: 'Focused on writing/improving documentation and README files.',
    tools: ['read_file', 'write_file', 'list_directory', 'search_files'],
    promptAddon: 'You are in documentation mode. Focus on writing and improving documentation, README files, and code comments.'
  },
  commit: {
    description: 'One-shot: reads git diff, writes a conventional commit message, exits.',
    tools: ['git', 'bash'],
    promptAddon: 'You are in commit mode. Read the git diff, write a conventional commit message, and exit.'
  }
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

export function getConfigDir() {
  return CONFIG_DIR;
}

export function loadConfig(cliFlags = {}) {
  const config = {};

  for (const key in DEFAULTS) {
    if (key !== 'blockedCommands') {
      config[key] = DEFAULTS[key];
    } else {
      config[key] = [...DEFAULTS[key]];
    }
  }

  if (existsSync(CONFIG_PATH)) {
    try {
      const globalConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      Object.assign(config, deepMerge(config, globalConfig));
    } catch {}
  }

  const projectConfigPath = join(process.cwd(), '.red.json');
  if (existsSync(projectConfigPath)) {
    try {
      const projectConfig = JSON.parse(readFileSync(projectConfigPath, 'utf-8'));
      Object.assign(config, deepMerge(config, projectConfig));
    } catch {}
  }

  const envKeys = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    nvidia: process.env.NVIDIA_API_KEY,
    opencode: process.env.OPENCODE_API_KEY,
    ollama: null,
    brave: process.env.BRAVE_SEARCH_API_KEY,
    tavily: process.env.TAVILY_API_KEY
  };

  const apiKeys = {};
  for (const [provider, key] of Object.entries(envKeys)) {
    if (key) apiKeys[provider] = key;
  }

  config.apiKeys = { ...config.apiKeys, ...apiKeys };

  if (process.env.ANTHROPIC_API_KEY && !config.apiKeys.anthropic) {
    config.apiKeys.anthropic = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.NVIDIA_API_KEY) {
    config.apiKeys.nvidia = process.env.NVIDIA_API_KEY;
    if (config.provider === 'nvidia' && !config.apiKeys.nvidia) {
      config.apiKeys.nvidia = process.env.NVIDIA_API_KEY;
    }
  }

  Object.assign(config, deepMerge(config, cliFlags));

  normalizeProviderModel(config);

  // NVIDIA uses its own provider (not redirecting to openrouter anymore)
  if (config.provider === 'nvidia' && !config.baseUrl) {
    config.baseUrl = process.env.NVIDIA_API_URL || NVIDIA_DEFAULT_BASE_URL;
  }

  if (config.provider === PROVIDERS.OPENROUTER && !config.baseUrl) {
    config.baseUrl = process.env.OPENROUTER_API_URL || OPENROUTER_DEFAULT_BASE_URL;
  }

  if (config.provider === 'nvidia') {
    config.model = normalizeNvidiaModel(config.model || config.nvidiaModel);
  }

  if (config.provider === PROVIDERS.OLLAMA && !config.baseUrl) {
    config.baseUrl = 'http://localhost:11434';
  }

  if (config.provider === PROVIDERS.OPENCODE && !config.baseUrl) {
    config.baseUrl = process.env.OPENCODE_API_URL || OPENCODE_DEFAULT_BASE_URL;
  }

  return config;
}

export function saveConfig(newConfig) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}

export function getDefaultSystemPrompt() {
  const { cwd } = process;
  return DEFAULT_SYSTEM_PROMPT.replace('{cwd}', cwd);
}

export function getModeConfig(mode) {
  return MODE_CONFIGS[mode] || MODE_CONFIGS.code;
}

export function getBlockedCommands() {
  const config = loadConfig();
  return config.blockedCommands || DEFAULTS.blockedCommands;
}
