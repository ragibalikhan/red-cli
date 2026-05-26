import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { estimateTokens, estimateTokensSync, calculateMessageTokens, calculateMessageTokensSync } from '../src/token-manager.js';

describe('Token Manager', () => {
  const testSentence = 'The quick brown fox jumps over the lazy dog.';

  beforeEach(() => {
    // Reset tokenizer instances before each test
    vi.resetModules();
  });

  describe('estimateTokens', () => {
    it('should return exact count for OpenAI models', async () => {
      const openaiTokens = await estimateTokens(testSentence, 'gpt-4o');
      expect(openaiTokens).toBe(10);
    });

    it('should return exact count for Anthropic models', async () => {
      const anthropicTokens = await estimateTokens(testSentence, 'claude-sonnet-4-6');
      expect(anthropicTokens).toBe(10);
    });

    it('should fallback to heuristic for unknown models', async () => {
      const unknownTokens = await estimateTokens(testSentence, 'unknown-model');
      // Heuristic: ceil(43 / 4) = ceil(10.75) = 11
      expect(unknownTokens).toBe(11);
    });

    it('should handle empty string', async () => {
      const emptyTokens = await estimateTokens('', 'gpt-4o');
      expect(emptyTokens).toBe(0);
    });

    it('should handle object input', async () => {
      const obj = { hello: 'world' };
      const objTokens = await estimateTokens(obj, 'gpt-4o');
      // Should be same as estimating the JSON string
      const jsonStr = JSON.stringify(obj);
      const expected = await estimateTokens(jsonStr, 'gpt-4o');
      expect(objTokens).toBe(expected);
    });
  });

  describe('estimateTokensSync', () => {
    it('should use heuristic for all models', () => {
      const openaiTokens = estimateTokensSync(testSentence);
      expect(openaiTokens).toBe(11); // ceil(43/4) = 11

      const anthropicTokens = estimateTokensSync(testSentence);
      expect(anthropicTokens).toBe(11);
    });
  });

  describe('calculateMessageTokens', () => {
    it('should calculate tokens for a simple message', async () => {
      const messages = [
        { role: 'user', content: testSentence }
      ];
      const tokens = await calculateMessageTokens(messages, 'gpt-4o');
      // Role overhead (4) + content tokens (10) + message overhead (3) = 17
      expect(tokens).toBe(17);
    });

    it('should calculate tokens for multiple messages', async () => {
      const messages = [
        { role: 'user', content: testSentence },
        { role: 'assistant', content: testSentence }
      ];
      const tokens = await calculateMessageTokens(messages, 'gpt-4o');
      // Each message: 4 (role) + 10 (content) + 3 (overhead) = 17
      // Total: 17 * 2 = 34
      expect(tokens).toBe(34);
    });
  });

  describe('calculateMessageTokensSync', () => {
    it('should calculate tokens using heuristic', () => {
      const messages = [
        { role: 'user', content: testSentence }
      ];
      const tokens = calculateMessageTokensSync(messages);
      // Role overhead (4) + content tokens (11) + message overhead (3) = 18
      expect(tokens).toBe(18);
    });
  });
});