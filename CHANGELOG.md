# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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