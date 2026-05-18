# Contributing to Red CLI

Thank you for your interest in contributing to Red CLI!

## Development Setup

```bash
git clone https://github.com/red-cli/red-cli.git
cd red-cli
npm install
npm link
```

## Project Structure

```
red-cli/
├── bin/
│   └── red.js          # CLI entry point
├── src/
│   ├── agent.js        # Core agentic loop
│   ├── autoagent.js    # Autonomous agent mode
│   ├── config.js       # Configuration loading
│   ├── modes.js       # Mode system
│   ├── repl.js         # Interactive REPL
│   ├── renderer.js    # Terminal UI
│   ├── token-manager.js # Token tracking
│   ├── analytics.js   # Usage analytics
│   ├── tools.js       # Tool definitions
│   ├── doctor.js      # Diagnostics
│   ├── providers/     # AI provider implementations
│   │   ├── base.js
│   │   ├── anthropic.js
│   │   ├── openai.js
│   │   ├── gemini.js
│   │   ├── nvidia.js
│   │   ├── opencode.js
│   │   └── ollama.js
│   └── ui/             # UI components
│       └── model-selector.js
├── test/               # Test files
├── docs/               # Documentation
├── package.json
└── README.md
```

## How to Add a New Provider

1. Create `src/providers/<provider>.js`
2. Extend `BaseProvider` class
3. Implement `streamMessage()` and `sendMessage()` methods
4. Add to `src/providers/index.js`:
   - PROVIDER_CLASSES
   - PROVIDER_MODELS
5. Add to `src/config.js` PROVIDERS constant
6. Add model limits to `src/token-manager.js`
7. Add pricing to `src/analytics.js` (if applicable)

Example provider structure:

```javascript
import OpenAI from 'openai';
import { BaseProvider } from './base.js';

export class MyProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.supportsNativeTools = true;
    this.client = new OpenAI({ apiKey: this.apiKey });
  }

  async *streamMessage(messages, tools = [], options = {}) {
    // Implementation
  }

  async sendMessage(messages, tools = [], options = {}) {
    // Implementation
  }
}
```

## How to Add a New Tool

1. Add tool definition to `getToolDefinitions()` in `src/tools.js`
2. Implement execution logic in `executeTool()` switch

Example tool definition:

```javascript
{
  name: 'my_tool',
  description: 'What the tool does',
  input_schema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: 'Description' }
    },
    required: ['param']
  }
}
```

## Adding to Model Selector UI

Edit `src/ui/model-selector.js` SELECTABLE_MODELS array to add new models to the interactive selector.

## Code Style

- Use ESM (import/export)
- Use async/await over callbacks
- Meaningful variable names
- Brief inline comments for non-obvious logic
- Run `npm run lint` before committing

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # Lint check
```

## Pull Request Guidelines

1. Keep PRs focused (one feature/fix per PR)
2. Add tests for new functionality
3. Update documentation if needed
4. Ensure `npm test` and `npm run lint` pass
5. Write clear commit messages

## Commit Messages

Use conventional commits:

- `feat: add new feature`
- `fix: resolve issue`
- `docs: update documentation`
- `refactor: restructure code`
- `test: add tests`
- `chore: maintenance`

## Questions?

Open an issue for discussion before starting major changes.