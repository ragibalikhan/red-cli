import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, terminal: false });

const TOOLS = [
  {
    name: 'greet',
    description: 'Greet a person by name',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    }
  },
  {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    }
  }
];

let initialized = false;
let requestId = 0;

function sendResponse(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const id = msg.id;

  switch (msg.method) {
    case 'initialize':
      initialized = true;
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-mcp', version: '1.0.0' }
      });
      break;

    case 'notifications/initialized':
      break;

    case 'tools/list':
      if (!initialized) { sendError(id, -32000, 'Not initialized'); break; }
      sendResponse(id, { tools: TOOLS });
      break;

    case 'tools/call': {
      if (!initialized) { sendError(id, -32000, 'Not initialized'); break; }
      const { name, arguments: args } = msg.params || {};
      if (name === 'greet') {
        sendResponse(id, { content: [{ type: 'text', text: `Hello, ${args?.name || 'world'}!` }] });
      } else if (name === 'add') {
        const sum = (args?.a || 0) + (args?.b || 0);
        sendResponse(id, { content: [{ type: 'text', text: `${sum}` }] });
      } else {
        sendResponse(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
      }
      break;
    }

    case 'shutdown':
      sendResponse(id, {});
      process.exit(0);
      break;

    default:
      sendError(id, -32601, `Method not found: ${msg.method}`);
  }
});
