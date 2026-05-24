# Red CLI — Cybersecurity CLI

> An open-source **autonomous cybersecurity testing platform** for the terminal. Find vulnerabilities, exploit them, and prove impact.

[![npm](https://img.shields.io/npm/v/red-cli)](https://www.npmjs.com/package/red-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)

Combines **7 AI providers** and **40+ models** with autonomous penetration testing, vulnerability scanning, exploitation tooling, and smart intent detection — all from your terminal.

[Features](#features) · [Installation](#installation) · [Quick Start](#quick-start) · [Modes](#modes) · [Commands](#command-reference) · [Configuration](#configuration)

---

## What is Red CLI?

Red CLI is a terminal-native AI penetration testing assistant. It auto-detects your intent from plain English — type "scan example.com" and it switches to scan mode, runs nmap, looks up CVEs, and reports findings. Type "exploit that SQLi" and it generates payloads and tests them.

---

## Features

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

Auto-detection example: `"scan example.com for open ports"` → automatically switches to `scan` mode.

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

# Look up CVEs for a component
red "cve search nginx 1.18"

# Subdomain enumeration
red "find subdomains for example.com"

# Generate a pentest report
red "generate report of findings"

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

### General

| Command | Description |
|---------|-------------|
| `/exit`, `/quit` | Exit the CLI |
| `/clear` | Clear conversation history |
| `/history` | Show last 10 messages |
| `/help` | Show all commands |
| `/mode <name>` | Switch mode (recon/scan/exploit/report/osint/audit) |
| `/model` | Open model selector UI |
| `/provider <name>` | Switch AI provider |

### Security Testing

| Command | Description |
|---------|-------------|
| `/pentest <target>` | Full autonomous penetration test |
| `/scan <target>` | Vulnerability scan |
| `/recon <target>` | Reconnaissance & enumeration |
| `/exploit <type> <target>` | Quick exploitation (xss, sqli, lfi, ports, etc.) |
| `/cve <CVE-ID>` | Look up a specific CVE |
| `/cves <component> [version]` | Search CVEs for a component |
| `/secrets [path]` | Scan for leaked secrets |
| `/bugs [path]` | Find logic/security bugs |
| `/report` | Generate penetration test report |
| `/scope add <target>` | Authorize a target for testing |
| `/targets` | List all scanned targets |
| `/tech` | Show discovered technologies |
| `/continue <target>` | Continue from previous scan |

### Planning & Auto

| Command | Description |
|---------|-------------|
| `/plan <task>` | Create and execute a plan |
| `/run <task>` | Run directly without planning |
| `/auto <task>` | Run in autonomous mode |
| `/goal <condition>` | Run with goal-based completion |

### Utilities

| Command | Description |
|---------|-------------|
| `/doctor` | Run diagnostics |
| `/usage` | Show usage statistics |
| `/tokens` | Show current session tokens |
| `/install-tools` | Install security tools (nmap, nikto, etc.) |
| `/compact` | Compact conversation to save tokens |
| `/parallel task1 \| task2` | Run tasks in parallel |
| `/memory` | Show all memories |
| `/save [file]` | Save session to file |
| `/resume` | Resume a previous session |
| `/plugins` | List installed plugins |

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
  "provider": "openai",
  "model": "gpt-4o",
  "mode": "recon",
  "apiKeys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-...",
    "gemini": "...",
    "nvidia": "nvapi-...",
    "opencode": "sk-..."
  },
  "effort": "high",
  "mcpServers": []
}
```

### Environment Variables

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
export NVIDIA_API_KEY="nvapi-..."
export OPENCODE_API_KEY="sk-..."
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
  --effort <level>       Set effort level (high/medium/low/min)
  --no-tools             Disable tools (ask mode)
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
