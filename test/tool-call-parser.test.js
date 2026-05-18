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
});
