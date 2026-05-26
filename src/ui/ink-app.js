import React, { useState, useEffect } from 'react';
import { render, Box, Text, Static, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandRegistry } from '../commands/registry.js';
import { NVIDIA_MODELS } from '../config.js';

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
  { label: 'DeepSeek V4 Flash Free', model: 'deepseek-v4-flash-free', provider: 'opencode', desc: 'OpenCode Zen · Free' },
  { label: 'GLM-5 Free', model: 'glm-5-free', provider: 'opencode', desc: 'OpenCode Zen · 1M context' },
  { label: 'Qwen3 Coder 480B', model: 'qwen3-coder-480b', provider: 'opencode', desc: 'OpenCode Zen · Coding model' },
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
      return e(Box, { key: m.model + idx },
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
      return e(Box, { key: cmd.name + idx },
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
 * Main REPL App
 */
function RedApp({ config, agent, handleCommand, runAgent, onExit }) {
  const [input, setInput] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [thinkingStartTime, setThinkingStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState(agent.mode || 'recon');
  const [model, setModel] = useState(config.model);
  const [history, setHistory] = useState([]);
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState([]); // { name, input, result?, ts }
  const { exit } = useApp();

  // Helper to push a message to history (becomes Static)
  const pushHistory = (role, content) => {
    setHistory(h => [...h, { role, content, ts: Date.now() }]);
  };

  // Subscribe to agent events
  useEffect(() => {
    const onChunk = (text) => setStreamText(s => s + text);
    const onToolCall = ({ name, input: toolInput }) => {
      setActiveTools(t => [...t, { name, input: toolInput, ts: Date.now() }]);
    };
    const onToolResult = ({ name, result }) => {
      setActiveTools(t => t.map(tc =>
        tc.name === name && !tc.result ? { ...tc, result } : tc
      ));
    };
    const onDone = ({ text }) => {
      // Move streaming text + tools to history
      if (text) pushHistory('assistant', text);
      if (activeTools.length > 0) {
        for (const tc of activeTools) {
          pushHistory('tool', `${tc.name}: ${typeof tc.result === 'string' ? tc.result.slice(0, 200) : JSON.stringify(tc.result || {}).slice(0, 200)}`);
        }
      }
      setStreamText('');
      setActiveTools([]);
    };

    agent.on('chunk', onChunk);
    agent.on('toolCall', onToolCall);
    agent.on('toolResult', onToolResult);
    agent.on('done', onDone);

    return () => {
      agent.off('chunk', onChunk);
      agent.off('toolCall', onToolCall);
      agent.off('toolResult', onToolResult);
      agent.off('done', onDone);
    };
  }, []);

  // Update elapsed timer while thinking
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => {
      setElapsed(((Date.now() - thinkingStartTime) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(timer);
  }, [thinking, thinkingStartTime]);

  // Show menu when input is exactly '/' or a short slash prefix without spaces
  useEffect(() => {
    if (input === '/' && !showMenu) {
      setShowMenu(true);
    } else if (showMenu && (input.includes(' ') || !input.startsWith('/'))) {
      // Dismiss menu when user types a space (full command) or clears the slash
      setShowMenu(false);
    }
  }, [input, showMenu]);

  // Handle Ctrl+C and Ctrl+D
  useInput((ch, key) => {
    if (key.ctrl && (ch === 'c' || ch === 'd')) {
      onExit?.();
      exit();
    }
  }, { isActive: !showMenu && !thinking && !showModelSelector });

  const handleSubmit = async (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');

    // Show what the user submitted in scrollback
    pushHistory('user', trimmed);

    if (trimmed === '/model') {
      setShowModelSelector(true);
      return;
    }

    if (trimmed.startsWith('/')) {
      try {
        await handleCommand(trimmed);
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
      try {
        await runAgent(trimmed);
      } catch (err) {
        pushHistory('error', err.message);
      } finally {
        setThinking(false);
      }
    }
  };

  const handleMenuSelect = async (commandName) => {
    setInput('');
    setShowMenu(false);
    pushHistory('user', commandName);
    if (commandName === '/model') {
      setShowModelSelector(true);
      return;
    }
    try {
      await handleCommand(commandName);
      setMode(agent.mode);
      setModel(config.model);
    } catch (err) {
      pushHistory('error', err.message);
    }
  };

  const handleMenuCancel = () => {
    setInput('');
    setShowMenu(false);
  };

  const handleModelSelect = async (selected) => {
    setShowModelSelector(false);
    try {
      // Call handleCommand with a special internal command
      await handleCommand(`/model:${selected.provider}:${selected.model}`);
      setModel(selected.model);
    } catch (err) {
      console.error(err.message);
    }
  };

  const handleModelCancel = () => {
    setShowModelSelector(false);
  };

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
          e(Text, { color: 'cyan', bold: true }, '❯ '),
          e(Text, null, msg.content)
        );
      }
      if (msg.role === 'assistant') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i, marginTop: 1 },
          e(Text, { color: 'white' }, msg.content)
        );
      }
      if (msg.role === 'tool') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i },
          e(Text, { color: 'yellow' }, '  ▲ ', msg.content)
        );
      }
      if (msg.role === 'error') {
        return e(Box, { key: 'h-' + msg.ts + '-' + i },
          e(Text, { color: 'red' }, '  ✗ ', msg.content)
        );
      }
      return e(Box, { key: 'h-' + msg.ts + '-' + i });
    }),

    // Live streaming text (while agent is generating)
    streamText && e(Box, { marginTop: 1 },
      e(Text, { color: 'white' }, streamText)
    ),

    // Active tool calls (risk-colored cards)
    activeTools.length > 0 && e(Box, { flexDirection: 'column' },
      ...activeTools.map((tc, i) => {
        const RISK = { bash: 'red', port_scan: 'red', exploit: 'red', payload_gen: 'red', write_file: 'yellow', edit_file: 'yellow', install_tool: 'yellow' };
        const color = RISK[tc.name] || 'green';
        const icon = color === 'red' ? '◆' : color === 'yellow' ? '▲' : '●';
        const resultText = tc.result
          ? (tc.result.error ? `✗ ${tc.result.error}` : '✓ done')
          : '…';
        return e(Box, { key: 'tc-' + i },
          e(Text, { color }, `  ${icon} `),
          e(Text, { bold: true, color }, tc.name),
          e(Text, { dimColor: true }, ` ${resultText}`)
        );
      })
    ),

    // Prompt + input
    e(Box, { marginTop: thinking || streamText ? 1 : 0 },
      e(Text, { color: modeColor }, '['),
      e(Text, { color: modeColor, bold: true }, mode),
      e(Text, { color: modeColor }, '] '),
      e(Text, { dimColor: true }, shortModel),
      e(Text, { color: modeColor, bold: true }, ' ❯ '),
      thinking
        ? e(Text, { dimColor: true }, '(processing...)')
        : e(TextInput, {
            value: input,
            onChange: setInput,
            onSubmit: showMenu ? () => {} : handleSubmit
          })
    ),

    // Thinking indicator
    thinking && e(Box, null,
      e(Text, { color: 'green' }, e(Spinner, { type: 'dots' })),
      e(Text, { dimColor: true }, ` ${elapsed}s · ${mode} · ${agent.messages?.length || 0} msgs`)
    ),

    // Slash menu
    showMenu && e(SlashMenu, {
      query: input,
      onSelect: handleMenuSelect,
      onCancel: handleMenuCancel
    }),

    // Status footer (always visible)
    !showMenu && !showModelSelector && e(Box, { marginTop: 1 },
      e(Text, { dimColor: true }, `  ${config.provider} · ${agent.messages?.length || 0} msgs · ${agent.toolCallCount || 0} tools`)
    )
  );
}

/**
 * Mount the Ink app
 */
export function startInkApp(props) {
  const { unmount, waitUntilExit } = render(e(RedApp, props), {
    exitOnCtrlC: false
  });
  return { unmount, waitUntilExit };
}
