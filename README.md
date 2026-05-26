# Red CLI — Autonomous Red Team Platform

> An open-source **autonomous cybersecurity testing platform** for the terminal. Find vulnerabilities, exploit them, and prove impact.

[![npm](https://img.shields.io/npm/v/red-cli)](https://www.npmjs.com/package/red-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

Combines **8 AI providers** and **40+ models** with autonomous penetration testing, vulnerability scanning, exploitation tooling, and smart intent detection — all from your terminal.

[Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Modes](#modes) · [Commands](#command-reference) · [Configuration](#configuration)

---

## What is Red CLI?

Red CLI is a terminal-native AI penetration testing assistant with a modern **React/Ink-based UI**. It auto-detects your intent from plain English — type "scan example.com" and it switches to scan mode, runs nmap, looks up CVEs, and reports findings. Type "exploit that SQLi" and it generates payloads and tests them.

---

## Features

### 🖥️ Modern Terminal UI (Ink-powered)

- **Instant slash menu** — type `/` to open a live searchable command menu
- **Mode-colored prompt** — visual feedback for current security mode
- **Live streaming** — see AI tokens as they arrive
- **Tool call cards** — risk-colored indicators (🟢 read, 🟡 write, 🔴 shell/exploit)
- **Thinking indicator** — elapsed time, mode, message count

### 🛡️ Cybersecurity-Focused Modes

Intent-based mode auto-detection — just describe what you want to do:

| Mode | Purpose |
|------|---------|
| `recon` | **Default.** Reconnaissance, enumeration, port scanning, subdomain discovery, fingerprinting |
| `scan` | Vulnerability scanning, CVE lookup, nmap/nuclei/nikto analysis |
| `exploit` | Exploitation, payload generation (XSS/SQLi/LFI/SSRF/CMDi), PoC verification |
| `report` | Penetration test report generation with evidence and remediation |
| `osint` | Passive OSINT — web search, DNS lookups, public data only |
| `audit` | Security code audit — read-only source code vulnerability analysis |

### 🤖 Multi-Provider AI Support (8 Providers, 40+ Models)

| Provider | Models | Pricing |
|----------|--------|---------|
| **AWS Bedrock** | Claude Opus 4.7, Haiku 4.5 | AWS pricing |
| **Anthropic** | Claude Sonnet 4, Opus 4, Haiku 4 | From $1/Mtok |
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4 Turbo | From $0.15/Mtok |
| **Google Gemini** | Gemini 2.5 Pro/Flash/Flash-Lite, 2.0 Flash | Free tier + from $0.175/Mtok |
| **OpenCode Zen** | GPT-5 series, Qwen, DeepSeek | **Free models available** |
| **NVIDIA** | GLM-5.1, DeepSeek-V4, Kimi, Llama, Nemotron | API pricing |
| **Ollama** | Llama3, Codestral, Mistral, Phi3 | Free (local) |
| **OpenRouter** | Any OpenRouter model | Varies |

### 🔍 Built-in Security Tools (25+)

| Tool | Description |
|------|-------------|
| `port_scan` | Nmap-based port/service scanning (quick/full/service modes) |
| `dns_lookup` | DNS record resolution (A, AAAA, MX, NS, TXT, CNAME) |
| `cve_search` | CVE database lookup via NVD API + GitHub Advisory fallback |
| `payload_gen` | Payload generation for XSS, SQLi, LFI, SSRF, CMDi, SSTI |
| `fingerprint` | HTTP technology fingerprinting (server, cookies, JS frameworks) |
| `subdomain_enum` | DNS brute force subdomain discovery |
| `bash` | Shell commands with risk classification and safety confirmation |
| `web_search` | DuckDuckGo web search |
| `web_fetch` | URL content extraction |
| `install_tool` | Auto-install security tools (nmap, nikto, subfinder, etc.) |
| `exploit` | Quick exploitation testing (XSS, SQLi, LFI, ports, brute) |

### 🧠 Autonomous Execution

**Auto Mode** (`/auto`) — Let Red complete complex pentest tasks autonomously:
- Built-in task planner
- Loop detection & safety guardrails
- Progress tracking
- Goal-based completion detection

### 💾 Memory & Learning

- **Global Memory** — Remember findings across sessions
- **Project Memory** — Store scan results and exploit chains
- **Auto-learning** — Learns from your testing patterns

### 🔒 Safety Features

- Scope-based target authorization (`/scope add example.com`)
- Destructive command confirmation
- Workspace enforcement
- Configurable blocked commands
- Risk classification for all shell commands

---

## Installation

**Prerequisites:** Node.js 18+, API key for at least one provider.

```bash
npm install -g redai-cli
```

Or from source:

```bash
git clone https://github.com/ragibalikhan/red-cli.git
cd red-cli && npm install && npm link
```

---

## Quick Start

```bash
# Interactive REPL (starts in recon mode)
red

# Scan a target for vulnerabilities
red "scan example.com for open ports"

# Full autonomous penetration test
red --auto "pentest https://target.com"

# Generate XSS payloads
red "generate xss payloads"

# Use a specific model
red --model gemini-2.5-flash "scan example.com"
```

---

## Modes

Red auto-detects your intent from your input — but you can also switch manually:

| Command | Switches to |
|---------|-------------|
| `/mode recon` | Reconnaissance & enumeration |
| `/mode scan` | Vulnerability scanning |
| `/mode exploit` | Exploitation & payloads |
| `/mode report` | Report generation |
| `/mode osint` | Passive OSINT only |
| `/mode audit` | Code security audit |

---

## Command Reference

Type `/` in the REPL to open the live searchable command menu, or use commands directly:

### Security Testing

| Command | Description |
|---------|-------------|
| `/pentest <target>` | Full autonomous penetration test |
| `/scan <target>` | Vulnerability scan |
| `/recon <target>` | Reconnaissance & enumeration |
| `/exploit <type> <target>` | Quick exploitation (xss, sqli, lfi, ports, etc.) |
| `/cve <CVE-ID>` | Look up a specific CVE |
| `/secrets [path]` | Scan for leaked secrets |
| `/scope add <target>` | Authorize a target for testing |
| `/report` | Generate penetration test report |

### Model & Config

| Command | Description |
|---------|-------------|
| `/model` | Open model selector |
| `/mode <name>` | Switch mode (recon/scan/exploit/report/osint/audit) |
| `/provider <name>` | Switch AI provider |
| `/setkey <provider> <key>` | Save API key |

### Planning & Auto

| Command | Description |
|---------|-------------|
| `/plan <task>` | Create and execute a plan |
| `/auto <task>` | Run in autonomous mode |
| `/goal <condition>` | Run with goal-based completion |

### Utilities

| Command | Description |
|---------|-------------|
| `/doctor` | Run diagnostics |
| `/usage` | Show usage statistics |
| `/tokens` | Show current session tokens |
| `/compact` | Compact conversation to save tokens |
| `/save [file]` | Save session to file |
| `/clear` | Clear conversation |
| `/help` | Show help |

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
  "provider": "bedrock",
  "model": "anthropic.claude-opus-4-7",
  "mode": "recon",
  "awsRegion": "us-east-1",
  "apiKeys": {
    "bedrock": "your-bedrock-api-key",
    "openai": "sk-...",
    "gemini": "...",
    "nvidia": "nvapi-..."
  }
}
```

### AWS Bedrock Setup

1. Get an API key from [AWS Console → Bedrock → API Keys](https://console.aws.amazon.com/bedrock/home#/api-keys)
2. Run: `/setkey bedrock <your-api-key> us-east-1`
3. Select a Bedrock model via `/model`

### Environment Variables

```bash
export AWS_BEDROCK_API_KEY="..."
export AWS_REGION="us-east-1"
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
export NVIDIA_API_KEY="nvapi-..."
```

---

## CLI Options

```
red [options] [message]

Options:
  --version              Show version
  --model <name>         Set model
  --mode <name>          Set mode (recon/scan/exploit/report/osint/audit)
  --provider <name>      Set provider
  --no-tools             Disable tools (chat only)
  --auto                 Run in autonomous mode
  --max-iter <n>         Max iterations for auto mode
```

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for security policy and responsible disclosure.

## License

MIT — Star this repo if you find it useful! ⭐
