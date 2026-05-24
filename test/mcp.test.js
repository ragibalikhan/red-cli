import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'url';

const MOCK_SERVER = fileURLToPath(new URL('./fixtures/mock-mcp-server.mjs', import.meta.url));

describe('MCP Manager', () => {
  let McpManager;

  beforeAll(async () => {
    const mod = await import('../src/mcp.js');
    McpManager = mod.McpManager;
  });

  it('creates an empty manager', () => {
    const mgr = new McpManager();
    expect(mgr.size).toBe(0);
    expect(mgr.listTools()).toEqual([]);
  });

  it('skips invalid server configs', () => {
    const mgr = new McpManager([
      { name: 'no-command' },
      { command: 'no-name' },
      {}
    ]);
    expect(mgr.size).toBe(0);
  });

  it('connects to a mock MCP server and discovers tools', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    const results = await mgr.connectAll();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].name).toBe('test-server');
    expect(mgr.size).toBe(1);

    const tools = mgr.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('greet');
    expect(tools[0].serverName).toBe('test-server');
    expect(tools[1].name).toBe('add');
    expect(tools[1].serverName).toBe('test-server');

    await mgr.disconnectAll();
  });

  it('calls a tool and returns text result', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();

    const result = await mgr.callTool('greet', { name: 'Alice' });
    expect(result.output).toBe('Hello, Alice!');
    expect(result.isError).toBe(false);

    await mgr.disconnectAll();
  });

  it('calls a numeric tool', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();

    const result = await mgr.callTool('add', { a: 3, b: 4 });
    expect(result.output).toBe('7');
    expect(result.isError).toBe(false);

    await mgr.disconnectAll();
  });

  it('returns isError for unknown tool sent to server', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();

    const result = await mgr.callTool('nonexistent');
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');

    await mgr.disconnectAll();
  });

  it('throws when calling tool from disconnected server', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await expect(mgr.callTool('greet', { name: 'Bob' })).rejects.toThrow('not found');
  });

  it('reloads servers', async () => {
    const mgr = new McpManager();
    const results = await mgr.reload([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(mgr.listTools()).toHaveLength(2);
    await mgr.disconnectAll();
  });

  it('reports connection failure gracefully', async () => {
    const mgr = new McpManager([
      { name: 'fail-server', command: 'node', args: ['does-not-exist.js'] }
    ]);
    const results = await mgr.connectAll();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBeTruthy();
    expect(mgr.size).toBe(0); // deleted from map on failure
  });

  it('getToolNames returns flat names', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();
    const names = mgr.getToolNames();
    expect(names).toEqual(['greet', 'add']);
    await mgr.disconnectAll();
  });
});

describe('MCP-Agent Integration', () => {
  let McpManager;
  let Agent;

  beforeAll(async () => {
    const mcp = await import('../src/mcp.js');
    McpManager = mcp.McpManager;
    const agentMod = await import('../src/agent.js');
    Agent = agentMod.Agent;
  });

  it('attachMcpManager adds MCP tools to agent', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();

    const agent = new Agent({ model: 'gpt-4o', provider: 'openai', apiKey: 'test' });
    await agent.ensureReady();

    const builtinCount = agent.tools.length;
    agent.attachMcpManager(mgr);

    expect(agent.tools.length).toBe(builtinCount + 2);
    expect(agent.tools[builtinCount].name).toBe('mcp__greet');
    expect(agent.tools[builtinCount + 1].name).toBe('mcp__add');

    await mgr.disconnectAll();
  });

  it('executeTool dispatches MCP tools correctly', async () => {
    const mgr = new McpManager([
      { name: 'test-server', command: 'node', args: [MOCK_SERVER] }
    ]);
    await mgr.connectAll();

    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('mcp__greet', { name: 'Bob' }, { mcpManager: mgr });
    expect(result.output).toBe('Hello, Bob!');

    await mgr.disconnectAll();
  });

  it('executeTool returns error when no MCP manager', async () => {
    const { executeTool } = await import('../src/tools.js');
    const result = await executeTool('mcp__greet', { name: 'Bob' }, {});
    expect(result.error).toBe('MCP manager not available');
  });
});
