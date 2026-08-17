import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { render, Box, Text, Static, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import { CommandRegistry } from '../commands/registry.js';
import { NVIDIA_MODELS } from '../config.js';
import { MarkdownRenderer, InlineMarkdown } from './markdown-renderer.js';
import { ToolCards, getToolStatusText } from './tool-card.js';
import { StatusBar } from './status-bar-ink.js';
import { normalizePaste, pasteSummary } from './paste-utils.js';
import { ErrorBoundary } from './error-boundary.js';

const e = React.createElement;
const registry = new CommandRegistry();

// Model list - mirrors src/ui/model-selector.js
const SELECTABLE_MODELS = [
  { label: 'Sonnet 4.6', model: 'claude-sonnet-4-6', provider: 'anthropic', desc: 'Balanced · $3/$15 per Mtok' },
  { label: 'Opus 4.7', model: 'claude-opus-4-7', provider: 'anthropic', desc: 'Most powerful · $15/$75 per Mtok' },
  { label: 'Opus 4.7 (Bedrock)', model: 'anthropic.claude-opus-4-7', provider: 'bedrock', desc: 'AWS Bedrock · Most powerful' },
  { label: 'Haiku 4.5 (Bedrock)', model: 'anthropic.claude-haiku-4-5', provider: 'bedrock', desc: 'AWS Bedrock · Fast & cheap' },
  { label: 'GPT-4o', model: 'gpt-4o', provider: 'openai', desc: 'OpenAI · $5/$15 per Mtok' },
  { label: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro', provider: 'gemini', desc: 'Google · 1M context' },
  { label: 'Gemini 2.5 Flash', model: 'gemini-2.5-flash', provider: 'gemini', desc: 'Google · Fast' },
  // OpenCode Zen — Free models
  { label: 'DeepSeek V4 Flash Free', model: 'deepseek-v4-flash-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'MiMo V2.5 Free', model: 'mimo-v2.5-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'Big Pickle Free', model: 'big-pickle', provider: 'opencode', desc: 'OpenCode Zen · Free stealth model' },
  { label: 'Hy3 Free', model: 'hy3-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'Laguna S 2.1 Free', model: 'laguna-s-2.1-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'Nemotron 3 Ultra Free', model: 'nemotron-3-ultra-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'Nemotron 3.5 Lightning Free', model: 'nemotron-3.5-lightning-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'ollama/llama3', model: 'llama3', provider: 'ollama', desc: 'Local · No internet' },
  ...NVIDIA_MODELS.map(m => ({ label: `${m.name} (NVIDIA)`, model: m.id, provider: 'nvidia', desc: m.description }))
];

// Mode color mapping
const MODE_COLORS = {
  recon: 'cyan',
  scan: 'yellow',
  exploit: 'red',
  report: 'green',
  osint: 'blue',
  audit: 'magenta'
};

/**
 * Ink-based model selector
 */
function ModelSelector({ currentModel, onSelect, onCancel }) {
  const initialIdx = Math.max(0, SELECTABLE_MODELS.findIndex(m => m.model === currentModel));
  const [selectedIndex, setSelectedIndex] = useState(initialIdx);

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.return) {
      onSelect(SELECTABLE_MODELS[selectedIndex]);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(Math.min(SELECTABLE_MODELS.length - 1, selectedIndex + 1));
      return;
    }
  });

  const visibleCount = 12;
  const startIdx = Math.max(0, Math.min(selectedIndex - 6, SELECTABLE_MODELS.length - visibleCount));
  const endIdx = Math.min(SELECTABLE_MODELS.length, startIdx + visibleCount);

  return e(Box, { flexDirection: 'column', marginTop: 1 },
    e(Text, { bold: true, color: 'red' }, '  Select model'),
    e(Text, { dimColor: true }, '  ↑↓ navigate · ⏎ select · esc cancel'),
    e(Box, { marginTop: 1 }),
    ...SELECTABLE_MODELS.slice(startIdx, endIdx).map((m, i) => {
      const idx = startIdx + i;
      const isSelected = idx === selectedIndex;
      const isCurrent = m.model === currentModel;
      return e(Box, { key: m.model },
        e(Text, { color: isSelected ? 'cyan' : undefined, bold: isSelected },
          isSelected ? '  ❯ ' : '    ',
          m.label,
          isCurrent ? ' ✓' : ''
        ),
        e(Text, { dimColor: true }, ` — ${m.desc}`)
      );
    })
  );
}

/**
 * Slash menu component - shows when user types '/'
 */
function SlashMenu({ query, onSelect, onCancel }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on query
  const filterText = query.startsWith('/') ? query.slice(1) : query;
  const filtered = filterText
    ? registry.search(filterText)
    : registry.getAll();

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const visibleCount = Math.min(10, filtered.length);
  const startIdx = Math.max(0, Math.min(selectedIndex - 4, filtered.length - visibleCount));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex].name);
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(Math.min(filtered.length - 1, selectedIndex + 1));
      return;
    }
  });

  if (filtered.length === 0) {
    return e(Box, { flexDirection: 'column', marginTop: 1 },
      e(Text, { dimColor: true }, '  No matching commands. Press Esc to cancel.')
    );
  }

  return e(Box, { flexDirection: 'column', marginTop: 1 },
    e(Box, null, e(Text, { color: 'red' }, '  Command Menu '), e(Text, { dimColor: true }, '(↑↓ navigate · ⏎ select · esc cancel)')),
    ...filtered.slice(startIdx, startIdx + visibleCount).map((cmd, i) => {
      const idx = startIdx + i;
      const isSelected = idx === selectedIndex;
      const aliases = cmd.aliases?.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      return e(Box, { key: cmd.name },
        e(Text, { color: isSelected ? 'cyan' : undefined, bold: isSelected },
          isSelected ? '  ❯ ' : '    ',
          cmd.icon || ' ',
          ' ',
          cmd.name
        ),
        e(Text, { dimColor: true }, aliases, ' — ', (cmd.description || '').slice(0, 50))
      );
    })
  );
}

/**
 * Multi-line input component
 * Enter adds newlines, Escape or Ctrl+Enter submits
 */
function MultiLineInput({ value, onChange, onSubmit, placeholder, focus }) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useInput((input, key) => {
    if (!focus) return;

    // Escape to submit
    if (key.escape) {
      onSubmit(value);
      return;
    }
    // Ctrl+Enter to submit
    if (key.ctrl && key.return) {
      onSubmit(value);
      return;
    }
    // Enter to insert newline
    if (key.return) {
      const newValue = value.slice(0, cursorOffset) + '\n' + value.slice(cursorOffset);
      setCursorOffset(cursorOffset + 1);
      onChange(newValue);
      return;
    }
    // Backspace
    if (key.backspace && cursorOffset > 0) {
      const newValue = value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
      setCursorOffset(cursorOffset - 1);
      onChange(newValue);
      return;
    }
    // Delete
    if (key.delete && cursorOffset < value.length) {
      const newValue = value.slice(0, cursorOffset) + value.slice(cursorOffset + 1);
      onChange(newValue);
      return;
    }
    // Arrow keys
    if (key.leftArrow && cursorOffset > 0) {
      setCursorOffset(cursorOffset - 1);
      return;
    }
    if (key.rightArrow && cursorOffset < value.length) {
      setCursorOffset(cursorOffset + 1);
      return;
    }
    // Home/End
    if (key.name === 'home') {
      const lastNewline = value.lastIndexOf('\n', cursorOffset - 1);
      setCursorOffset(lastNewline + 1);
      return;
    }
    if (key.name === 'end') {
      const nextNewline = value.indexOf('\n', cursorOffset);
      setCursorOffset(nextNewline === -1 ? value.length : nextNewline);
      return;
    }
    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      const newValue = value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
      setCursorOffset(cursorOffset + input.length);
      onChange(newValue);
    }
  }, { isActive: focus });

  // Render with cursor
  const displayValue = useMemo(() => {
    if (!focus || !value) return value || '';
    const before = value.slice(0, cursorOffset);
    const atCursor = value[cursorOffset] || ' ';
    const after = value.slice(cursorOffset + 1);
    return before + chalk.inverse(atCursor) + after;
  }, [value, cursorOffset, focus]);

  const display = value || placeholder
    ? (value ? displayValue : chalk.grey(placeholder || ''))
    : chalk.inverse(' ');

  return e(Text, null, display);
}

/**
 * Main REPL App
 */
function RedApp({ config, agent, handleCommand, runAgent, onExit }) {
  const [input, setInput] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [elapsed, setElapsed] = useState('0');
  const [mode, setMode] = useState(agent.mode || 'recon');
  const [model, setModel] = useState(config.model);
  const [history, setHistory] = useState([]);
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState([]); // { id, name, input, result?, ts }
  const [toolStatus, setToolStatus] = useState(null); // { name, input, subagent } or null
  const [subagents, setSubagents] = useState([]); // { name, prompt, status, result? }
  const [inputHistory, setInputHistory] = useState([]); // command history for Up/Down
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 = current input
  const [pendingInput, setPendingInput] = useState(''); // saved input when navigating history
  const [multilineMode, setMultilineMode] = useState(false); // multi-line input mode
  const streamBufferRef = useRef('');
  const streamTimerRef = useRef(null);
  const pendingTextSegmentsRef = useRef([]);
  const streamTextRef = useRef('');
  const pasteBufferRef = useRef('');
  const lastInputChangeRef = useRef(0);
  const shiftHeldRef = useRef(false);
  const _toolCallIdRef = useRef(0);
  const { exit } = useApp();

  // Helper to push a message to history (becomes Static)
  const pushHistory = (role, content) => {
    setHistory(h => {
      const next = [...h, { role, content, ts: Date.now() }];
      // Cap history at 500 messages to prevent unbounded growth
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  };

  // Subscribe to agent events
  useEffect(() => {
    // Throttled chunk handler — buffer tokens, flush every 50ms
    const onChunk = (text) => {
      streamBufferRef.current += text;
      if (!streamTimerRef.current) {
        streamTimerRef.current = setTimeout(() => {
          const buffered = streamBufferRef.current;
          streamBufferRef.current = '';
          streamTimerRef.current = null;
          if (buffered) {
            setStreamText(s => {
              const next = s + buffered;
              streamTextRef.current = next;
              return next;
            });
          }
        }, 50);
      }
    };
    const onToolCall = ({ name, input: toolInput }) => {
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
      }
      const buffered = streamBufferRef.current;
      streamBufferRef.current = '';
      if (buffered.trim()) {
        pendingTextSegmentsRef.current.push(buffered.trim());
      }
      // Reset stream state so each round starts fresh — intermediate text
      // was already displayed live and doesn't need to persist in history
      setStreamText('');
      streamTextRef.current = '';
      const id = ++_toolCallIdRef.current;
      setActiveTools(t => [...t, { id, name, input: toolInput, ts: Date.now(), startedAt: Date.now() }]);
    };
    const onToolResult = ({ name, result }) => {
      setActiveTools(t => {
        // Match by name + find the most recent unfinished tool with that name
        const idx = t.findLastIndex(tc => tc.name === name && !tc.result);
        if (idx === -1) return t;
        const next = [...t];
        next[idx] = { ...next[idx], result };
        return next;
      });
    };
    const onDone = ({ text }) => {
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
      }
      const buffered = streamBufferRef.current;
      streamBufferRef.current = '';

      // Use done event text as primary source — it's per-round (just this round's text)
      // streamTextRef may have stale data from earlier rounds, so prefer done event
      let combinedText = '';
      if (text && text.trim()) {
        combinedText = text.trim();
      }
      // Include any buffered text not yet flushed (last chunk before done)
      if (buffered.trim() && !combinedText.includes(buffered.trim())) {
        combinedText = combinedText ? `${combinedText}\n${buffered.trim()}` : buffered.trim();
      }
      // Fallback: use streamTextRef if done event had no text (e.g. NVIDIA non-stream)
      if (!combinedText && streamTextRef.current.trim()) {
        combinedText = streamTextRef.current.trim();
      }
      streamTextRef.current = '';
      // Last fallback: pendingTextSegments
      if (!combinedText && pendingTextSegmentsRef.current.length > 0) {
        combinedText = pendingTextSegmentsRef.current.join('\n');
      }
      pendingTextSegmentsRef.current = [];

      const pendingEntries = [];
      if (combinedText) {
        pendingEntries.push({ role: 'assistant', content: combinedText });
      }
      setActiveTools(currentTools => {
        for (const tc of currentTools) {
          pendingEntries.push({ role: 'tool', content: `${tc.name}: ${typeof tc.result === 'string' ? tc.result.slice(0, 200) : JSON.stringify(tc.result || {}).slice(0, 200)}` });
        }
        return [];
      });
      setStreamText('');
      if (pendingEntries.length > 0) {
        const now = Date.now();
        setHistory(h => {
          const next = [...h, ...pendingEntries.map((e, i) => ({ ...e, ts: now + i }))];
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
      }
    };

    agent.on('chunk', onChunk);
    agent.on('toolCall', onToolCall);
    agent.on('toolResult', onToolResult);
    agent.on('done', onDone);

    // Listen for model changes (fallback activation)
    const onModelChange = (newModel) => {
      setModel(newModel);
    };
    agent.on('modelChange', onModelChange);

    // Subagent activity events
    const onSubagentStart = ({ name, prompt }) => {
      setSubagents(prev => [...prev, { name, prompt, status: 'running', startTime: Date.now() }]);
    };
    const onSubagentDone = ({ name, result, elapsed }) => {
      setSubagents(prev => prev.map(a =>
        a.name === name ? { ...a, status: 'done', result, elapsed } : a
      ));
      // Clear after 5 seconds
      setTimeout(() => {
        setSubagents(prev => prev.filter(a => a.name !== name));
      }, 5000);
    };
    const onSubagentError = ({ name, error }) => {
      setSubagents(prev => prev.map(a =>
        a.name === name ? { ...a, status: 'error', error } : a
      ));
    };
    agent.on('subagentStart', onSubagentStart);
    agent.on('subagentDone', onSubagentDone);
    agent.on('subagentError', onSubagentError);

    const onToolStatus = (status) => {
      setToolStatus(status);
    };
    agent.on('toolStatus', onToolStatus);

    return () => {
      agent.off('chunk', onChunk);
      agent.off('toolCall', onToolCall);
      agent.off('toolResult', onToolResult);
      agent.off('done', onDone);
      agent.off('modelChange', onModelChange);
      agent.off('subagentStart', onSubagentStart);
      agent.off('subagentDone', onSubagentDone);
      agent.off('subagentError', onSubagentError);
      agent.off('toolStatus', onToolStatus);
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, []);

  // Update elapsed timer while thinking
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => {
      setElapsed(((Date.now() - thinkingStartTime) / 1000).toFixed(1));
    }, 500);
    return () => clearInterval(timer);
  }, [thinking, thinkingStartTime]);

  // Show menu when input starts with '/' (unless it contains a space = command with args)
  useEffect(() => {
    if (input.startsWith('/') && !input.includes(' ') && !showMenu) {
      setShowMenu(true);
    } else if (showMenu && (input.includes(' ') || !input.startsWith('/'))) {
      // Dismiss menu when user types a space (full command) or clears the slash
      setShowMenu(false);
    }
  }, [input, showMenu]);

  // Handle Ctrl+C, Ctrl+D, ESC, and Shift tracking for multi-line input
  useInput((_ch, key) => {
    // Track Shift state for multi-line input
    shiftHeldRef.current = key.shift || false;

    // ESC key — close menus, clear input, or exit
    if (key.name === 'escape' || key.escape) {
      if (showMenu) {
        setShowMenu(false);
        setInput('');
        return;
      }
      if (showModelSelector) {
        setShowModelSelector(false);
        return;
      }
      if (thinking) {
        // Interrupt running agent
        agent.abort();
        setThinking(false);
        setStreamText('');
        streamTextRef.current = '';
        pushHistory('error', '(interrupted)');
        return;
      }
      // Clear input if there's text, otherwise exit
      if (input) {
        setInput('');
        pasteBufferRef.current = '';
        return;
      }
      onExit?.();
      exit();
      return;
    }

    // Ctrl+C — interrupt or exit
    if (key.ctrl && key.name === 'c') {
      if (thinking) {
        agent.abort();
        setThinking(false);
        setStreamText('');
        streamTextRef.current = '';
        pushHistory('error', '(interrupted)');
        return;
      }
      // If input has text, clear it
      if (input) {
        setInput('');
        return;
      }
      onExit?.();
      exit();
      return;
    }

    // Ctrl+D — exit
    if (key.ctrl && key.name === 'd') {
      if (thinking) {
        agent.abort();
        setThinking(false);
        setStreamText('');
        streamTextRef.current = '';
        pushHistory('error', '(interrupted)');
        return;
      }
      onExit?.();
      exit();
      return;
    }
    // Input history navigation with Up/Down arrows
    if (!showMenu && !showModelSelector && !thinking) {
      if (key.upArrow) {
        if (inputHistory.length === 0) return;
        if (historyIndex === -1) {
          // Save current input before navigating
          setPendingInput(input);
          setHistoryIndex(inputHistory.length - 1);
          setInput(inputHistory[inputHistory.length - 1]);
        } else if (historyIndex > 0) {
          setHistoryIndex(historyIndex - 1);
          setInput(inputHistory[historyIndex - 1]);
        }
      } else if (key.downArrow) {
        if (historyIndex === -1) return;
        if (historyIndex < inputHistory.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setInput(inputHistory[historyIndex + 1]);
        } else {
          // Restore original input
          setHistoryIndex(-1);
          setInput(pendingInput);
        }
      }
    }
  }, { isActive: !showMenu && !showModelSelector });

  const handleSubmit = useCallback(async (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');
    setHistoryIndex(-1);
    setPendingInput('');

    // Save to input history for Up/Down navigation
    setInputHistory(h => {
      const filtered = h.filter(item => item !== trimmed);
      return [...filtered, trimmed].slice(-100); // keep last 100 commands
    });

    // Show what the user submitted in scrollback
    pushHistory('user', trimmed);

    if (trimmed === '/model') {
      setShowModelSelector(true);
      return;
    }
    if (trimmed === '/multiline') {
      setMultilineMode(m => !m);
      pushHistory('assistant', multilineMode ? 'Multi-line mode: OFF' : 'Multi-line mode: ON — Enter adds newlines, Esc/Ctrl+Enter to submit');
      return;
    }

    if (trimmed.startsWith('/')) {
      try {
        await handleCommand(trimmed, (text, role = 'assistant') => pushHistory(role, text));
        setMode(agent.mode);
        setModel(config.model);
      } catch (err) {
        pushHistory('error', err.message);
      }
    } else {
      setThinking(true);
      setThinkingStartTime(Date.now());
      setStreamText('');
      setActiveTools([]);
      pendingTextSegmentsRef.current = [];
      streamTextRef.current = '';
      try {
        await runAgent(trimmed);
      } catch (err) {
        pushHistory('error', err.message);
      } finally {
        setThinking(false);
      }
    }
  }, [agent, config, handleCommand, pushHistory, runAgent]);

  const handleMenuSelect = useCallback(async (commandName) => {
    setInput('');
    setShowMenu(false);
    setHistoryIndex(-1);
    setPendingInput('');

    // Save to input history
    setInputHistory(h => {
      const filtered = h.filter(item => item !== commandName);
      return [...filtered, commandName].slice(-100);
    });

    pushHistory('user', commandName);
    if (commandName === '/model') {
      setShowModelSelector(true);
      return;
    }
    try {
      await handleCommand(commandName, (text, role = 'assistant') => pushHistory(role, text));
      setMode(agent.mode);
      setModel(config.model);
    } catch (err) {
      pushHistory('error', err.message);
    }
  }, [agent, config, handleCommand, pushHistory]);

  const handleMenuCancel = useCallback(() => {
    setInput('');
    setShowMenu(false);
  }, []);

  const handleModelSelect = useCallback(async (selected) => {
    setShowModelSelector(false);
    try {
      await handleCommand(`/model:${selected.provider}:${selected.model}`);
      setModel(selected.model);
    } catch (err) {
      pushHistory('error', err.message);
    }
  }, [agent, config, handleCommand, pushHistory]);

  const handleModelCancel = useCallback(() => {
    setShowModelSelector(false);
  }, []);

  const modeColor = MODE_COLORS[mode] || 'cyan';
  const shortModel = model.replace(/^anthropic\./, '').replace(/^claude-/, 'c-').replace(/-\d{8}.*$/, '');

  if (showModelSelector) {
    return e(ModelSelector, {
      currentModel: model,
      onSelect: handleModelSelect,
      onCancel: handleModelCancel
    });
  }

  return e(Box, { flexDirection: 'column' },
    // Static scrollback - past user/assistant messages
    history.length > 0 && e(Static, { items: history }, (msg, i) => {
      if (msg.role === 'user') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i, marginTop: 1 },
          e(Box, { width: 1, marginRight: 1 },
            e(Text, { color: 'cyan' }, '┃')
          ),
          e(Box, { flexDirection: 'column' },
            e(Text, { color: 'cyan', bold: true }, 'You'),
            e(Text, null, msg.content)
          )
        );
      }
      if (msg.role === 'assistant') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i, marginTop: 1 },
          e(Box, { width: 1, marginRight: 1 },
            e(Text, { color: 'green' }, '┃')
          ),
          e(Box, { flexDirection: 'column' },
            e(Box, null,
              e(Text, { color: 'green', bold: true }, 'Red'),
              e(Text, { dimColor: true }, ` · ${shortModel}`),
              e(Text, { dimColor: true }, ` · ${new Date(msg.ts).toLocaleTimeString()}`)
            ),
            e(InlineMarkdown, { text: msg.content })
          )
        );
      }
      if (msg.role === 'tool') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i },
          e(Box, { width: 1, marginRight: 1 },
            e(Text, { color: 'yellow' }, '┃')
          ),
          e(Text, { color: 'yellow' }, msg.content)
        );
      }
      if (msg.role === 'error') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i },
          e(Box, { width: 1, marginRight: 1 },
            e(Text, { color: 'red' }, '┃')
          ),
          e(Text, { color: 'red' }, msg.content)
        );
      }
      return e(Box, { key: 'h-' + msg.ts + '-' + i });
    }),

    // Live streaming text (markdown rendered)
    streamText && e(Box, { marginTop: 1 },
      e(MarkdownRenderer, { text: streamText, streaming: true })
    ),

    // Tool status line — shows what's currently executing
    toolStatus && e(Box, { marginTop: 1 },
      e(Text, { color: 'yellow', bold: true }, '  ⚡ '),
      toolStatus.subagent && e(Text, { color: 'cyan' }, `[${toolStatus.subagent}] `),
      e(Text, { color: 'yellow', bold: true }, `${toolStatus.name}: `),
      e(Text, null, getToolStatusText(toolStatus.name, toolStatus.input))
    ),

    // Active tool calls (collapsible cards)
    e(ToolCards, { tools: activeTools }),

    // Subagent activity display
    subagents.length > 0 && e(Box, { flexDirection: 'column', marginTop: 1 },
      ...subagents.map((sa, i) => e(Box, { key: `sa-${sa.name}-${i}` },
        e(Text, { color: sa.status === 'done' ? 'green' : sa.status === 'error' ? 'red' : 'cyan' },
          sa.status === 'running' ? '  ◉ ' : sa.status === 'done' ? '  ✓ ' : '  ✗ '
        ),
        e(Text, { bold: true, color: sa.status === 'done' ? 'green' : sa.status === 'error' ? 'red' : 'cyan' },
          `@${sa.name}`
        ),
        e(Text, { dimColor: true }, sa.status === 'running'
          ? ` — ${sa.prompt.slice(0, 50)}${sa.prompt.length > 50 ? '...' : ''}`
          : sa.status === 'done' && sa.elapsed
            ? ` done in ${(sa.elapsed / 1000).toFixed(1)}s`
            : ' failed'
        )
      ))
    ),

    // Prompt + input
    e(Box, { marginTop: thinking || streamText ? 1 : 0 },
      e(Text, { color: modeColor }, '['),
      e(Text, { color: modeColor, bold: true }, mode),
      e(Text, { color: modeColor }, '] '),
      e(Text, { dimColor: true }, shortModel),
      multilineMode && e(Text, { color: 'yellow' }, ' [ML]'),
      e(Text, { color: modeColor, bold: true }, ' ❯ '),
      thinking && !streamText
        ? e(Text, { dimColor: true }, '(processing...)')
        : multilineMode
          ? e(MultiLineInput, {
              value: input,
              onChange: setInput,
              onSubmit: (val) => {
                if (pasteBufferRef.current) {
                  const fullText = pasteBufferRef.current;
                  pasteBufferRef.current = '';
                  handleSubmit(fullText);
                  return;
                }
                handleSubmit(val);
              },
              placeholder: 'Type your message... (Esc to submit)',
              focus: !thinking
            })
          : e(TextInput, {
              value: input,
              onChange: (val) => {
                const now = Date.now();
                const timeSinceLast = now - lastInputChangeRef.current;
                lastInputChangeRef.current = now;

                const prevLen = pasteBufferRef.current ? pasteBufferRef.current.length : 0;
                const delta = val.length - prevLen;

                // Detect paste: large text delta in short time
                if (delta > 15 && timeSinceLast < 100) {
                  const pasted = val.slice(prevLen);
                  const lineCount = (pasted.match(/\n/g)?.length ?? 0) + 1;
                  if (lineCount >= 3 || pasted.length > 150) {
                    const info = normalizePaste(pasted);
                    pasteBufferRef.current = info.normalized;
                    setInput(pasteSummary(info));
                    return;
                  }
                }

                // If we're in paste placeholder mode and user types, clear it
                if (pasteBufferRef.current && !val.startsWith('[Pasted')) {
                  pasteBufferRef.current = '';
                }

                pasteBufferRef.current = '';
                setInput(val);
              },
              onSubmit: (val) => {
                // If paste buffer has content, submit the full pasted text
                if (pasteBufferRef.current) {
                  const fullText = pasteBufferRef.current;
                  pasteBufferRef.current = '';
                  // Show paths in history if detected
                  const info = normalizePaste(fullText);
                  if (info.paths.length > 0) {
                    pushHistory('user', `[${info.paths.length} file${info.paths.length > 1 ? 's' : ''}: ${info.paths.slice(0, 3).join(', ')}${info.paths.length > 3 ? '...' : ''}]`);
                  }
                  handleSubmit(fullText);
                  return;
                }
                showMenu ? () => {} : handleSubmit(val);
              }
            })
    ),

    // Thinking indicator — status text with spinner
    thinking && !streamText && e(Box, { marginTop: 1 },
      e(Text, { color: 'green' }, e(Spinner, { type: 'dots' })),
      e(Text, { dimColor: true }, ' Pondering...'),
      e(Text, { dimColor: true }, ` ${elapsed}s`)
    ),
    // During streaming — show streaming status
    thinking && streamText && e(Box, { marginTop: 1 },
      e(Text, { color: 'green' }, '▸'),
      e(Text, { dimColor: true }, ' Streaming...'),
      e(Text, { dimColor: true }, ` ${elapsed}s`)
    ),

    // Slash menu
    showMenu && e(SlashMenu, {
      query: input,
      onSelect: handleMenuSelect,
      onCancel: handleMenuCancel
    }),

    // Enhanced status bar (opencode-style)
    !showMenu && !showModelSelector && e(StatusBar, {
      provider: config.provider,
      model,
      mode,
      messageCount: agent.messages?.length || 0,
      toolCount: agent.toolCallCount || 0,
      activeToolCount: activeTools.length,
      cwd: process.cwd(),
      tokenEstimate: 0,
      maxTokens: 0,
      isFallback: agent.isUsingFallback?.() || false
    })
  );
}

/**
 * Mount the Ink app
 */
export function startInkApp(props) {
  const { unmount, waitUntilExit } = render(
    e(ErrorBoundary, null, e(RedApp, props)),
    { exitOnCtrlC: false }
  );
  return { unmount, waitUntilExit };
}
