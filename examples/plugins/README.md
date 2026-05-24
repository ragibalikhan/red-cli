# Red CLI Plugin System

Plugins extend Red CLI with custom slash commands, tools, and lifecycle hooks.

## Quick Start

1. Create a `.js` or `.mjs` file in `~/.red/plugins/`

2. Export a `commands` array:

```js
export const commands = [
  {
    name: '/hello',
    aliases: ['/hi'],
    description: 'Say hello',
    run() {
      console.log('Hello from plugin!');
    }
  }
];
```

## Plugin Contract

Each plugin module can export:

| Export      | Type     | Required | Description |
|-------------|----------|----------|-------------|
| `commands`  | `Array`  | No       | Slash command definitions |
| `tools`     | `Array`  | No       | Tool definitions for autonomous use |
| `init`      | `Function` | No     | Called once at load with `{ pluginManager }` |

### Command Definition

```js
{
  name: '/mycommand',           // Slash command name (required)
  aliases: ['/mc', '/myc'],     // Optional aliases
  description: 'Does something', // Short description for /help
  args: [                        // Optional argument specs
    { name: 'input', required: true, description: 'Input value' }
  ],
  run(...args) {                // Called with space-separated args
    // Your logic here
  }
}
```

### Tool Definition

```js
{
  name: 'my_tool',                // Tool name (snake_case)
  description: 'Does something',   // Description for the model
  input_schema: {                  // JSON Schema for arguments
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input value' }
    },
    required: ['input']
  },
  async execute(input) {           // Called with parsed input object
    return { output: 'result' };
    // or { error: 'message' } on failure
  }
}
```

### Init Hook

```js
export async function init(ctx) {
  // ctx.pluginManager — access other plugins or register dynamic things
  // Called once per session at plugin load time
}
```

## Plugin Commands Take Precedence

Plugin commands with the same name as built-in commands override them.

## Installed Plugin Tools

Tools exported by plugins are automatically merged into the tool set available
to the AI model during conversations.

## Boilerplate

```js
// ~/.red/plugins/my-plugin.mjs
export const commands = [
  {
    name: '/ping',
    aliases: ['/p'],
    description: 'Responds with pong',
    run() {
      console.log('pong');
    }
  }
];

export const tools = [
  {
    name: 'ping_check',
    description: 'Check if a host responds to ping',
    input_schema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host to ping' }
      },
      required: ['host']
    },
    async execute(input) {
      return { output: `pong from ${input.host}` };
    }
  }
];

export async function init(ctx) {
  // Optional setup
}
```
