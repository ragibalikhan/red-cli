# Red CLI

> An open-source **agentic AI coding assistant** and **security testing platform** for the terminal.

[![npm](https://img.shields.io/npm/v/red-cli)](https://www.npmjs.com/package/red-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

Combines the power of **7 AI providers** and **40+ models** with autonomous execution modes, comprehensive security tools, and smart project awareness — all from your terminal.

[Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Models](#supported-models) · [Commands](#command-reference) · [Security](#security-testing-platform) · [Configuration](#configuration)

---

## What is Red CLI?

Red CLI is a terminal-native AI assistant that brings enterprise-grade coding capabilities and penetration testing tools to your command line. Whether you need to build applications, run security audits, or automate complex tasks — Red has you covered.

---

## Features

### 🤖 Multi-Provider AI Support (7 Providers, 40+ Models)

| Provider | Models | Pricing |
|----------|--------|---------|
| **Anthropic** | Claude Sonnet 4, Opus 4, Haiku 4 | From $1/Mtok |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo | From $0.15/Mtok |
| **Google Gemini** | Gemini 2.5 Pro/Flash/Flash-Lite, 2.0 Flash | Free tier + from $0.175/Mtok |
| **OpenCode Zen** | GPT-5 series, Qwen, DeepSeek | **Free models available** |
| **NVIDIA** | GLM-5.1, DeepSeek-V4, Kimi, Llama, Nemotron | API pricing |
| **Ollama** | Llama3, Codestral, Mistral, Phi3 | Free (local) |
| **OpenRouter** | Any OpenRouter model | Varies |

---

### 🛡️ Security Testing Platform

Full penetration testing toolkit built-in:

- **Reconnaissance** — Passive/active recon, port scanning, technology detection
- **Vulnerability Scanning** — OWASP Top 10, SANS Top 25, PCI-DSS, NIST CSF
- **Exploitation** — XSS, SQL Injection, LFI, SSRF, Command Injection, CORS testing
- **Accessibility Audits** — VPAT/WCAG 2.1/508 compliance checking
- **Secret Scanning** — Detect API keys, tokens, and credentials in code
- **Bug Finding** — Logic bugs, security bugs, reliability issues
- **CVE Lookup** — Real-time CVE database queries
- **Scope Management** — Authorized target tracking for compliance

**Security Commands**: `/pentest`, `/scan`, `/recon`, `/exploit`, `/secrets`, `/bugs`, `/vpat`, `/cve`

---

### ⚡ Autonomous Execution

**Auto Mode** — Let Red complete complex tasks autonomously:
- Built-in task planner
- Loop detection & safety guardrails
- Progress tracking
- Intelligent completion detection

**Plan Mode** — Generate structured step-by-step plans before execution

---

### 🧠 Memory & Learning

- **Global Memory** — Remember preferences across sessions
- **Project Memory** — Store architecture decisions and patterns
- **Auto-learning** — Learns from your code patterns automatically

---

### 📋 Task Queue

- Queue multiple tasks for sequential or parallel execution
- Security task auto-detection
- Failure handling: retry, skip, or abort

---

### 💾 Checkpoints & Rollback

- Create snapshots before risky operations
- Git stash integration
- One-command rollback to any previous state

---

### 🎯 Modes

| Mode | Description |
|------|-------------|
| `code` | Default. Full tool access for development. |
| `review` | Read-only code analysis, no writes. |
| `ask` | Pure Q&A with no side effects. |
| `devops` | Shell, git, and docker focused. |
| `docs` | Documentation writing. |
| `commit` | One-shot commit message generation. |

---

### 🛠️ Built-in Tools (16+)

| Tool | Description |
|------|-------------|
| `bash` | Shell commands with safety & live output |
| `read_file` / `write_file` | File operations |
| `search_files` | Regex search across files |
| `edit_file` | Surgical find-and-replace |
| `git` | Safe git operations |
| `http_request` | API testing |
| `run_tests` | Auto-detect and run test suites |
| `code_analysis` | ESLint, Pylint integration |
| `remember` / `recall` | Persistent memory |
| + more | ... |

---

### 🔒 Safety Features

- Destructive command confirmation
- Workspace enforcement
- Configurable blocked commands list
- Scope-based authorization for pentest targets
- Auto checkpoints before autonomous mode runs
- Risk classification for all shell commands

---

### 💡 Smart Project Context

Auto-detects your project:
- **Language** — Node.js, Python, Go, Rust, and more
- **Framework** — React, Next.js, Django, FastAPI, and more
- **Test runner** — Jest, Vitest, pytest
- **Package manager** — npm, yarn, poetry

---

## Installation

**Prerequisites:** Node.js 18+, API key for at least one provider.

```bash
npm install -g red-cli
```

Or from source:

```bash
git clone https://github.com/ragibalikhan/red-cli.git
cd red-cli && npm install && npm link
```

---

## Quick Start

```bash
# Interactive REPL
red

# One-shot question
red "explain this function"

# Autonomous task execution
red --auto "build a REST API with auth"

# Security scan
red security scan target.com

# Full penetration test
red security pentest example.com

# Use a specific model
red --model gemini-2.5-flash "write tests"

# Review mode (read-only)
red --mode review "review this code"
```

---

## Supported Models

### Anthropic

| Model | Context | Pricing |
|-------|---------|---------|
| claude-sonnet-4-20250729 | 200K | $3/$15 per Mtok |
| claude-opus-4-20250729 | 200K | $15/$75 per Mtok |
| claude-haiku-4-20250729 | 200K | $1/$5 per Mtok |

### OpenAI

| Model | Context | Pricing |
|-------|---------|---------|
| gpt-4o | 128K | $5/$15 per Mtok |
| gpt-4o-mini | 128K | $0.15/$0.60 per Mtok |
| gpt-4-turbo | 128K | $10/$30 per Mtok |

### Google Gemini

| Model | Context | Pricing |
|-------|---------|---------|
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
|-------|---------|---------|
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

---

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

---

## Command Reference

### General

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

### Security

| Command | Description |
|---------|-------------|
| `/pentest <target>` | Full penetration test |
| `/scan <target>` | Vulnerability scan |
| `/recon <target>` | Reconnaissance |
| `/exploit <target>` | Exploitation testing |
| `/secrets` | Scan for leaked secrets |
| `/bugs` | Find logic/security bugs |
| `/vpat` | WCAG/508 accessibility audit |
| `/cve <id>` | CVE lookup |

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
| `/memory set <key> <value>` | Set a project memory |
| `/memory forget <key>` | Delete a memory |

### Diagnostics

| Command | Description |
|---------|-------------|
| `/doctor` | Run Red Doctor diagnostics |
| `/usage` | Show usage statistics |
| `/tokens` | Show current session tokens |

---

## CLI Options

```
red [options] [message]

Options:
  --version              Show version
  --model <name>         Set model
  --mode <name>          Set mode
  --provider <name>      Set provider
  --effort <level>       Set effort level (high/medium/low/min)
  --no-tools             Disable tools (ask mode)
  --auto                 Run in autonomous mode
  --max-iter <n>         Max iterations for auto mode

Commands:
  red config get <key>   Get a config value
  red config set <key>   Set a config value
  red doctor             Run diagnostics
  red queue add <task>   Add task to queue
  red queue run          Run all queued tasks
  red security <cmd>     Security testing commands
```

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for security policy and responsible disclosure.

## License

MIT — Star this repo if you find it useful! ⭐
