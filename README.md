# Red CLI

An open-source agentic AI coding assistant for the terminal.

[![npm](https://img.shields.io/npm/v/red-cli)](https://www.npmjs.com/package/red-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

## Overview

Red CLI is a powerful Node.js CLI tool that brings AI-assisted coding directly to your terminal. With support for multiple AI providers including Anthropic, OpenAI, Google Gemini, NVIDIA, OpenCode Zen, Ollama, and OpenRouter, autonomous execution modes, smart project awareness, and advanced tooling, Red is like having a senior developer by your side.

## Features

### Multi-Provider AI Support

| Provider | Description |
|----------|-------------|
| **Anthropic** | Claude Sonnet 4, Opus 4, Haiku 4 |
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-4o Mini |
| **Google Gemini** | Gemini 2.5 Pro/Flash/Flash-Lite, Gemini 2.0 Flash |
| **OpenCode Zen** | Free & paid models including GPT-5 series, Qwen, DeepSeek |
| **NVIDIA** | Hosted open source models (GLM-5.1, DeepSeek-V4, Kimi, Qwen, Llama, etc.) |
| **Ollama** | Local models (Llama3, Codestral, Mistral, etc.) |
| **OpenRouter** | Any model via OpenRouter API |

### Plan & Auto Mode

- **Plan Mode**: Auto-generate structured plans for complex tasks
- **Auto Agent Mode**: Fully autonomous execution with safety guardrails
- **Step-by-Step**: Execute plans one step at a time with confirmation

### Task Management

- **Task Queue**: Run multiple tasks sequentially or in batch
- **Checkpoints**: Create snapshots before major changes
- **Rollback**: Revert to previous checkpoint if something goes wrong

### Smart Context

- **Project Detection**: Auto-detect Node.js, Python, Go, Rust, etc.
- **Framework Recognition**: Express, Next.js, Django, FastAPI, etc.
- **Tool Awareness**: Know your test runner, linter, and package manager

### Memory System

- **Global Memory**: Remember your coding preferences across sessions
- **Project Memory**: Store architecture decisions and project patterns

### Developer Tools

- **Red Doctor**: Diagnose setup issues and verify configuration
- **Usage Analytics**: Track tokens, costs, and tool usage
- **Diff Review**: Preview file changes before applying

## Installation

### Prerequisites

- Node.js 18+
- API key for at least one provider

### Quick Install

```bash
npm install -g red-cli
```

Or from source:

```bash
git clone https://github.com/red-cli/red-cli.git
cd red-cli
npm install
npm link
```

## Quick Start

```bash
# Interactive REPL
red

# One-shot command
red "list all JS files"

# Auto-agent mode (autonomous execution)
red --auto "build a todo app with tests"

# Run with specific model
red --model gemini-2.5-flash "write a function"

# Review mode (read-only)
red --mode review "review this code"
```

## Supported Models

### Anthropic
| Model | Context | Pricing |
|-------|--------|---------|
| claude-sonnet-4-20250729 | 200K | $3/$15 per Mtok |
| claude-opus-4-20250729 | 200K | $15/$75 per Mtok |
| claude-haiku-4-20250729 | 200K | $1/$5 per Mtok |

### OpenAI
| Model | Context | Pricing |
|-------|--------|---------|
| gpt-4o | 128K | $5/$15 per Mtok |
| gpt-4o-mini | 128K | $0.15/$0.60 per Mtok |
| gpt-4-turbo | 128K | $10/$30 per Mtok |

### Google Gemini
| Model | Context | Pricing |
|-------|--------|---------|
| gemini-2.5-pro | 1M | $1.25/$5 per Mtok |
| gemini-2.5-flash | 1M | $0.35/$0.70 per Mtok |
| gemini-2.5-flash-lite | 1M | $0.175/$0.35 per Mtok |
| gemini-2.0-flash | 1M | Free tier |

### OpenCode Zen (Free Models)
| Model | Context |
|-------|---------|
| minimax-m2.5-free | 200K |
| deepseek-v4-flash-free | 200K |
| nemotron-3-super-free | 200K |

### OpenCode Zen (Paid Models)
| Model | Context | Pricing |
|-------|--------|---------|
| qwen3.6-plus-free | 262K | Free (limited) |
| glm-5-free | 1M | Free (limited) |
| qwen3-coder-480b | 262K | $0.45/$1.50 per Mtok |
| gpt-5.1-codex-mini | 200K | $0.25/$2 per Mtok |
| gpt-5.1-codex | 200K | $1.07/$8.50 per Mtok |
| gpt-5.2 | 200K | $1.75/$14 per Mtok |

### NVIDIA Hosted Models
| Model | Provider | Context |
|-------|----------|---------|
| GLM-5.1 | Z.ai | 1M |
| DeepSeek-V4 Pro | DeepSeek | 64K |
| DeepSeek-V4 Flash | DeepSeek | 64K |
| Kimi K2.6 | Moonshot | 256K |
| Qwen3 Coder 480B | Qwen | 256K |
| Llama 3.3 70B | Meta | 128K |

## Configuration

### Interactive Setup

```bash
red doctor
red doctor --fix
```

### Config File

Create `~/.red/config.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250729",
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-...",
    "gemini": "...",
    "openrouter": "sk-or-...",
    "nvidia": "nvapi-...",
    "opencode": "sk-..."
  },
  "mode": "code",
  "effort": "high"
}
```

### Environment Variables

```bash
# Linux/macOS
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
export NVIDIA_API_KEY="nvapi-..."
export OPENCODE_API_KEY="sk-..."

# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

## Command Reference

### Basic Commands
| Command | Description |
|---------|-------------|
| `/exit`, `/quit` | Exit the CLI |
| `/clear` | Clear conversation history |
| `/history` | Show last 10 messages |
| `/help` | Show all commands |

### Provider & Model
| Command | Description |
|---------|-------------|
| `/model` | Open model selector UI |
| `/provider <name>` | Switch provider |
| `/mode <name>` | Switch mode |
| `/effort <level>` | Set effort (high/medium/low/min) |

### Plan & Auto Mode
| Command | Description |
|---------|-------------|
| `/plan <task>` | Create and execute a plan |
| `/run <task>` | Run directly without planning |
| `/auto <task>` | Run in autonomous mode |

### Task Queue
| Command | Description |
|---------|-------------|
| `/queue add <task>` | Add task to queue |
| `/queue run` | Run all queued tasks |
| `/queue list` | Show queued tasks |
| `/queue clear` | Clear queue |

### Checkpoints
| Command | Description |
|---------|-------------|
| `/checkpoint` | Create a checkpoint |
| `/checkpoints` | List all checkpoints |
| `/rollback` | Rollback to last checkpoint |

### Memory
| Command | Description |
|---------|-------------|
| `/memory` | Show all memories |
| `/memory set <key> <value>` | Set project memory |
| `/memory forget <key>` | Delete a memory |

### Diagnostics
| Command | Description |
|---------|-------------|
| `/doctor` | Run Red Doctor diagnostics |
| `/usage` | Show usage statistics |
| `/tokens` | Show current session tokens |

## Modes

| Mode | Description |
|------|-------------|
| `code` | Default. Full tool access. |
| `review` | Read-only. Reviews code, no writes. |
| `ask` | No tools. Pure Q&A mode. |
| `devops` | Shell, git, docker focused. |
| `docs` | Documentation focused. |
| `commit` | One-shot commit message generation. |

## Tools

Red provides these tools:

- **bash**: Execute shell commands with safety
- **read_file**: Read file contents
- **write_file**: Write content to files
- **list_directory**: List directory contents
- **search_files**: Search across files
- **edit_file**: Surgical find-and-replace
- **code_analysis**: Run static analysis
- **run_tests**: Detect and run test suites
- **git**: Safe git operations
- **http_request**: Make HTTP requests
- **remember/recall**: Persistent memory

## CLI Options

```bash
red [options] [message]

Options:
  --version              Show version
  --model <name>        Set model
  --mode <name>         Set mode
  --provider <name>     Set provider
  --effort <level>      Set effort level
  --no-tools            Disable tools (ask mode)
  --auto                Run in autonomous mode
  --max-iter <n>        Max iterations for auto mode

Commands:
  red config get <key>   Get config value
  red config set <key>   Set config value
  red doctor             Run diagnostics
  red queue add <task>   Add task to queue
  red queue run           Run all tasks
```

## Safety

- Destructive commands require confirmation
- Auto mode pauses before: npm installs, git push, external HTTP requests
- Checkpoints created automatically before auto-agent runs
- Blocked commands list configurable

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for security policy and best practices.

## License

MIT