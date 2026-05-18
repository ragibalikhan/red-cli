export { BaseProvider } from './base.js';
export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';
export { GeminiProvider } from './gemini.js';
export { OllamaProvider } from './ollama.js';
export { OpenCodeProvider } from './opencode.js';
export { default as NVIDIAProvider } from './nvidia.js';
import { NVIDIA_MODELS } from '../config.js';

export const PROVIDER_CLASSES = {
  anthropic: () => import('./anthropic.js').then(m => m.AnthropicProvider),
  openai: () => import('./openai.js').then(m => m.OpenAIProvider),
  openrouter: () => import('./openai.js').then(m => m.OpenAIProvider),
  gemini: () => import('./gemini.js').then(m => m.GeminiProvider),
  ollama: () => import('./ollama.js').then(m => m.OllamaProvider),
  opencode: () => import('./opencode.js').then(m => m.OpenCodeProvider),
  nvidia: () => import('./nvidia.js').then(m => m.default)
};

export const PROVIDER_MODELS = {
  anthropic: [
    'claude-sonnet-4-20250729',
    'claude-opus-4-20250729',
    'claude-haiku-4-20250729',
    'claude-3-5-sonnet-20241022'
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo'
  ],
  openrouter: [
    'deepseek/deepseek-r1',
    'anthropic/claude-3.5-sonnet',
    'google/gemini-2.0-flash-exp',
    'meta/llama-3.3-70b-instruct'
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash'
  ],
  opencode: [
    'minimax-m2.5-free',
    'deepseek-v4-flash-free',
    'nemotron-3-super-free',
    'qwen3.6-plus-free',
    'glm-5-free',
    'qwen3-coder-480b',
    'gpt-5.1-codex-mini',
    'gpt-5.2',
    'gpt-5.1-codex'
  ],
  ollama: [
    'llama3',
    'llama3.1',
    'codestral',
    'mistral',
    'phi3',
    'qwen2.5-coder'
  ],
  nvidia: NVIDIA_MODELS.map(model => model.id)
};

export function getProviderClass(provider) {
  return PROVIDER_CLASSES[provider];
}

export function getModelsForProvider(provider) {
  return PROVIDER_MODELS[provider] || [];
}

export function providerSupportsNativeTools(provider, model = '') {
  if (provider === 'nvidia') return false;
  if (provider === 'ollama') {
    const modelName = model.toLowerCase();
    if (modelName.includes('llama3') || modelName.includes('qwen') || modelName.includes('mistral')) {
      return true;
    }
    return null;
  }
  return ['anthropic', 'openai', 'openrouter', 'gemini', 'opencode'].includes(provider);
}
