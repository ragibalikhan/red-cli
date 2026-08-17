import { describe, expect, it } from 'vitest';
import { parseToolCallsFromText } from '../src/tool-call-parser.js';

describe('parseToolCallsFromText', () => {
  it('parses a tool_calls JSON object', () => {
    const calls = parseToolCallsFromText(JSON.stringify({
      tool_calls: [
        {
          name: 'bash',
          input: { command: 'pwd' }
        }
      ]
    }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: 'bash',
      input: { command: 'pwd' }
    });
  });

  it('parses a fenced single tool call', () => {
    const calls = parseToolCallsFromText(`\`\`\`json
{"tool":"read_file","arguments":{"path":"package.json"}}
\`\`\``);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: 'read_file',
      input: { path: 'package.json' }
    });
  });

  it('returns an empty list for normal prose', () => {
    expect(parseToolCallsFromText('No tool needed.')).toEqual([]);
  });

  it('parses malformed nested tool_calls JSON from models', () => {
    const text = 'I\'ll test the tools. {"tool_calls":[{"name":"bash","input":{"command":"echo test"}},{"tool_calls":[{"name":"list_directory","input":{"path":"/tmp"}},{"tool_calls":[{"name":"recall","input":{}}]}';
    const calls = parseToolCallsFromText(text);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].name).toBe('bash');
    expect(calls[0].input.command).toBe('echo test');
    expect(calls[1].name).toBe('list_directory');
  });

  it('parses tool calls embedded in prose', () => {
    const text = 'Let me check that. {"tool_calls":[{"name":"bash","input":{"command":"ls -la"}}]} Done.';
    const calls = parseToolCallsFromText(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('bash');
    expect(calls[0].input.command).toBe('ls -la');
  });
});
