import { describe, it, expect } from 'vitest';

describe('web_search', () => {
  it('returns results for a valid query', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_search', { query: 'hello world' });
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]).toHaveProperty('title');
    expect(result.results[0]).toHaveProperty('url');
  });

  it('respects max_results', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_search', { query: 'test', max_results: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('returns error for empty query', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_search', { query: '' });
    expect(result.error).toBeDefined();
  });
});

describe('web_fetch', () => {
  it('fetches and extracts text from a URL', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_fetch', { url: 'https://example.com' });
    expect(result.content).toBeDefined();
    expect(result.content).toContain('Example');
    expect(result.status).toBe(200);
  });

  it('rejects localhost URLs', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_fetch', { url: 'http://localhost:3000' });
    expect(result.error).toContain('localhost');
  });

  it('rejects missing URL', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_fetch', { url: '' });
    expect(result.error).toBeDefined();
  });

  it('respects max_length', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('web_fetch', { url: 'https://example.com', max_length: 50 });
    expect(result.content.length).toBeLessThanOrEqual(70);
  });
});
