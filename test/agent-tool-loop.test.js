import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '../src/agent.js';

class FakeProvider {
  constructor() {
    this.supportsNativeTools = true;
    this.calls = [];
  }

  async *streamMessage(messages, tools) {
    this.calls.push({ messages, tools });

    if (this.calls.length === 1) {
      yield {
        type: 'done',
        text: '',
        toolUses: [
          {
            id: 'call_read',
            name: 'read_file',
            input: { path: 'package.json' }
          }
        ]
      };
      return;
    }

    yield { type: 'text', content: 'done' };
    yield { type: 'done', text: 'done', toolUses: [] };
  }
}

function makeSilentSpinner() {
  return {
    isSpinning: true,
    start: vi.fn(function start() {
      this.isSpinning = true;
      return this;
    }),
    stop: vi.fn(function stop() {
      this.isSpinning = false;
      return this;
    })
  };
}

describe('Agent tool loop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('feeds tool results back to the provider before final response', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const agent = new Agent({
      provider: 'openai',
      model: 'gpt-4o',
      maxTokens: 1024,
      mode: 'recon',
      apiKeys: {}
    });
    const fakeProvider = new FakeProvider();

    agent._initPromise = Promise.resolve();
    agent.provider = fakeProvider;
    agent.messages.push({ role: 'user', content: 'read package' });

    await agent.runLoop(makeSilentSpinner());

    expect(fakeProvider.calls).toHaveLength(2);

    const secondCallMessages = fakeProvider.calls[1].messages;
    expect(secondCallMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_read',
              name: 'read_file',
              input: { path: 'package.json' }
            }
          ]
        }),
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'tool_result',
              tool_use_id: 'call_read',
              name: 'read_file'
            })
          ]
        })
      ])
    );

    expect(agent.messages.at(-1)).toEqual({ role: 'assistant', content: 'done' });
    expect(agent.toolCallCount).toBe(1);
  });

  it('uses text tool-call fallback when native tools are unavailable', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const agent = new Agent({
      provider: 'nvidia',
      model: 'fake',
      maxTokens: 1024,
      mode: 'recon',
      apiKeys: {}
    });
    const fakeProvider = new FakeProvider();
    fakeProvider.supportsNativeTools = false;
    fakeProvider.streamMessage = async function *streamMessage(messages, tools) {
      this.calls.push({ messages, tools });

      if (this.calls.length === 1) {
        yield {
          type: 'done',
          text: JSON.stringify({
            tool_calls: [
              { id: 'text_read', name: 'read_file', input: { path: 'package.json' } }
            ]
          }),
          toolUses: []
        };
        return;
      }

      yield { type: 'done', text: 'fallback done', toolUses: [] };
    };

    agent._initPromise = Promise.resolve();
    agent.provider = fakeProvider;
    agent.messages.push({ role: 'user', content: 'read package' });

    await agent.runLoop(makeSilentSpinner());

    expect(fakeProvider.calls).toHaveLength(2);
    expect(fakeProvider.calls[0].tools).toEqual([]);
    expect(fakeProvider.calls[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'text_read',
              name: 'read_file',
              input: { path: 'package.json' }
            }
          ]
        })
      ])
    );
    expect(agent.messages.at(-1)).toEqual({ role: 'assistant', content: 'fallback done' });
  });
});
