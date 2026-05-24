import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import chalk from 'chalk';

const CLIENT_INFO = { name: 'red-cli', version: '0.2.0' };
const REQUEST_TIMEOUT = 30_000;

class McpServerHandle {
  constructor(config) {
    this.name = config.name;
    this.config = config;
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.connected = false;
  }

  async connect() {
    const { command, args = [], env = {} } = this.config;

    this.transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env, ...env }
    });

    this.client = new Client(CLIENT_INFO, { capabilities: {} });
    await this.client.connect(this.transport);

    const result = await this.client.listTools();
    this.tools = (result.tools || []).map(t => ({
      ...t,
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }));
    this.connected = true;

    return this.tools;
  }

  async disconnect() {
    try {
      if (this.client) await this.client.close();
    } catch {}
    this.connected = false;
    this.client = null;
    this.transport = null;
  }

  async callTool(toolName, args) {
    if (!this.client || !this.connected) {
      throw new Error(`MCP server "${this.name}" is not connected`);
    }
    const result = await this.client.callTool({ name: toolName, arguments: args });
    return result;
  }
}

export class McpManager {
  constructor(serverConfigs = []) {
    this.servers = new Map();
    this._toolIndex = [];

    for (const cfg of serverConfigs) {
      if (!cfg.name || !cfg.command) {
        console.warn(chalk.yellow(`  ⚠️  Skipping MCP server config: missing name or command`));
        continue;
      }
      this.servers.set(cfg.name, new McpServerHandle(cfg));
    }
  }

  get size() {
    return this.servers.size;
  }

  async connectAll() {
    const results = [];

    for (const [name, handle] of this.servers) {
      try {
        console.log(chalk.dim(`  🔌 Connecting to MCP server: ${name}...`));
        const tools = await handle.connect();
        console.log(chalk.dim(`  ✓ MCP server "${name}" connected (${tools.length} tools)`));
        results.push({ name, tools, success: true });
      } catch (err) {
        console.warn(chalk.yellow(`  ⚠️  Failed to connect MCP server "${name}": ${err.message}`));
        this.servers.delete(name);
        results.push({ name, error: err.message, success: false });
      }
    }

    this._rebuildToolIndex();
    return results;
  }

  async disconnectAll() {
    for (const [, handle] of this.servers) {
      await handle.disconnect();
    }
    this.servers.clear();
    this._toolIndex = [];
  }

  listTools() {
    return this._toolIndex;
  }

  async callTool(toolName, args = {}) {
    const entry = this._toolIndex.find(t => t.name === toolName);
    let handle = entry ? this.servers.get(entry.serverName) : null;

    if (!handle) {
      for (const [, h] of this.servers) {
        if (h.connected) { handle = h; break; }
      }
    }
    if (!handle) {
      throw new Error(`MCP tool "${toolName}" not found and no connected MCP server available`);
    }

    const result = await handle.callTool(toolName, args);

    const content = result.content || [];
    const isError = result.isError || false;

    const textParts = [];
    for (const item of content) {
      if (item.type === 'text') {
        textParts.push(item.text);
      } else if (item.type === 'resource') {
        textParts.push(JSON.stringify(item.resource, null, 2));
      }
    }
    const text = textParts.join('\n');

    return { output: text, isError };
  }

  async reload(serverConfigs) {
    await this.disconnectAll();
    for (const cfg of serverConfigs) {
      if (!cfg.name || !cfg.command) continue;
      this.servers.set(cfg.name, new McpServerHandle(cfg));
    }
    return this.connectAll();
  }

  getToolNames() {
    return this._toolIndex.map(t => t.name);
  }

  _rebuildToolIndex() {
    const index = [];
    for (const [serverName, handle] of this.servers) {
      for (const tool of handle.tools) {
        index.push({
          serverName,
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || { type: 'object', properties: {} }
        });
      }
    }
    this._toolIndex = index;
  }
}
