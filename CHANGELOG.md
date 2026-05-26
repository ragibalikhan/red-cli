# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.4.2] - 2026-05-26

### Added

- **AWS Bedrock Provider**: Use Anthropic Claude models via AWS Bedrock API with simple API key auth
- **React/Ink Terminal UI**: Full TUI rewrite using React + Ink for Claude Code-style experience
  - Instant `/` slash menu with live fuzzy search
  - Mode-colored prompt (recon=cyan, scan=yellow, exploit=red, etc.)
  - Live streaming text — tokens appear as they arrive
  - Tool call cards with risk-colored indicators (🟢 read, 🟡 write, 🔴 shell)
  - Thinking indicator with elapsed time, mode, message count
  - Static scrollback for message history
  - Status footer (provider, messages, tool calls)
- **Ink-based Model Selector**: Arrow-key navigation, no TTY conflicts
- **DeepSeek Thinking Mode Support**: Properly captures and preserves `reasoning_content` across all OpenAI-compatible providers
- **Mode Validation**: Warning when invalid mode is used, with valid mode suggestions
- **Argument Hints**: Commands show usage when called without required args
- **Fuzzy Command Suggestions**: Unknown `/` commands suggest closest matches

### Changed

- Default mode changed from `code` to `recon` (security-focused)
- Replaced 8 stale persona commands with 6 proper security mode commands
- Help text updated to show correct modes and providers
- Error handling: 401/403 errors stop immediately instead of retrying uselessly
- `--no-tools` flag properly disables tools without fake mode
- `switchModel()` now properly resets provider (fixes stale model bug)
- Agent uses EventEmitter for streaming events (chunk, toolCall, toolResult, done)

### Fixed

- `readline.emitKeypressEvents` was consuming stdin before readline could process it
- Duplicate "Thinking..." spinners (ora + Ink)
- Model selector text leaking into readline buffer
- Slash menu not rendering in interactive mode
- `reasoning_content` error with DeepSeek thinking models after tool calls
- Provider status indicators not showing configured keys in welcome screen
- Separator line rendering as `─  ─  ─` instead of solid line

## [0.3.0] - 2025-05-18

### Added

- **OpenCode Zen Provider**: Support for OpenCode Zen models including free models (MiniMax M2.5, DeepSeek V4 Flash, Nemotron 3 Super)
- **Google Gemini 2.5 Models**: Added gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
- **Interactive Model Selector**: Beautiful TUI for switching between 33+ models
- **Optimized Token Usage**: Reduced system prompt size for cost efficiency

### Changed

- Enhanced model selector with proper ANSI clearing
- Updated provider list with better organization

### Fixed

- OpenCode provider endpoint handling
- NVIDIA provider reasoning_content handling for thinking models
- Model selector UI duplication issue

## [0.2.0] - 2025-05-15

### Added

- **Multi-Provider Support**: Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, NVIDIA
- **Modes System**: code, review, ask, devops, docs, commit
- **New Tools**: code_analysis, run_tests, explain_error, find_and_replace_all, create_file_tree, git, http_request, clipboard, remember, recall
- **Enhanced Slash Commands**: /add, /drop, /context, /undo, /retry, /copy, /save, /load, /tokens, /compact, /diff, /snapshot, /web
- **Configuration System**: Layered config (global + project level), CLI flags
- **Theme Support**: dark, light, minimal themes
- **Token Usage Display**: Progress bar and cost estimation

### Changed

- Refactored agent to use provider abstraction layer
- Enhanced renderer with beautiful TUI and themes

### Fixed

- Config loading priority (env > file > defaults)
- Tool execution error handling

## [0.1.0] - 2025-01-15

### Added

- Initial release with Anthropic Claude support
- Basic tools: bash, read_file, write_file, list_directory, search_files, edit_file
- Interactive REPL with history
- Configuration system

### Fixed

- API key detection
- Streaming response handling