# Codex-Style Red Team Architecture

Goal: make Red CLI feel like Codex CLI, but specialized for authorized red teaming.

## Product Shape

- Terminal-first agent loop
- Fast REPL with slash commands
- One-shot task mode
- Plan mode
- Auto mode with approvals
- Session resume, history, checkpoints
- Tool execution with confirmation gates
- Security workflows as first-class commands

## Core Layers

### 1. CLI Router

Responsibilities:
- Parse flags and subcommands
- Normalize provider/model selection
- Route to REPL, one-shot, auto, doctor, queue, security, config

Target outcome:
- `red`, `red "task"`, `red --auto "task"`, `red security scan host`, `red doctor --fix` all behave predictably

### 2. Agent Runtime

Responsibilities:
- Maintain message history
- Build system prompt
- Trim context
- Stream model output
- Dispatch tool calls
- Track tokens and tool usage

Target outcome:
- Same execution model regardless of provider
- Native tools when available, text tool-call fallback when not

### 3. Tool Layer

Responsibilities:
- Bash
- Read/write/edit files
- Search/list
- Test and analysis helpers
- Git helpers
- Memory and clipboard

Target outcome:
- Tools are provider-agnostic and guarded by policy
- Shell commands go through one command runner with confirmation and workspace checks

### 4. UI Layer

Responsibilities:
- Welcome/banner
- Prompt/status bar
- Slash menu
- Session picker
- Model picker
- Keybindings

Target outcome:
- A Codex-like terminal UX: dense, fast, low-friction, with clear current state

### 5. Safety Layer

Responsibilities:
- Command classification
- Approval prompts
- Workspace boundary checks
- Dangerous operation blocking
- Security-target handling

Target outcome:
- Red-team workflows are explicit and auditable
- Non-authorized destructive actions do not run silently

### 6. Security Domain

Responsibilities:
- Recon
- Vuln scan
- Secret scan
- Bug scan
- CVE lookup
- VPAT
- Reporting
- Memory of scans and findings

Target outcome:
- Security commands feel like a dedicated subproduct, not an add-on

## Recommended Module Split

- `src/cli/`
  - argument parsing
  - command routing
  - subcommand handlers
- `src/runtime/`
  - agent loop
  - provider bridge
  - tool dispatch
  - token policy
- `src/ui/`
  - prompt, banner, selectors, status
- `src/policy/`
  - approvals
  - command risk
  - workspace restrictions
- `src/security/`
  - keep current domain modules, but isolate all red-team workflows here

## Red-Team Differentiators

- Security mode as a dedicated mode, not just a command alias
- Target scoping
- Authorization prompts for external targets
- Scan memory and follow-up chaining
- Report generation after every substantive security session
- Optional attack-chain orchestration for authorized testing only

## Implementation Order

1. Clean CLI dispatch and flag parsing
2. Split agent runtime from REPL/UI
3. Centralize approval policy
4. Normalize provider adapters
5. Reduce security-module startup side effects
6. Add real tests around parser, policy, and command routing
7. Build Codex-like terminal polish on top

## Practical Constraint

Keep offensive capability behind explicit security commands and approval gates. The UX can be Codex-like; the operating model should stay deliberate and controlled.
