import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';

const e = React.createElement;

const RISK_MAP = {
  bash: 'red', port_scan: 'red', exploit: 'red', payload_gen: 'red',
  write_file: 'yellow', edit_file: 'yellow', install_tool: 'yellow'
};

/**
 * Format elapsed time in human-readable form
 */
function formatElapsed(ms) {
  const s = ms / 1000;
  if (s < 0.1) return '<0.1s';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = (s % 60).toFixed(0);
  return `${m}m ${rs}s`;
}

/**
 * Truncate input preview for display
 */
function inputPreview(name, input) {
  if (!input) return '';
  if (name === 'bash') return (input.command || '').slice(0, 50);
  return JSON.stringify(input).slice(0, 50);
}

/**
 * Get a human-readable status text for a tool call (full, no truncation).
 */
export function getToolStatusText(name, input) {
  if (!input) return '';
  if (name === 'bash' || name === 'command') {
    return input.command || input.cmd || JSON.stringify(input);
  }
  if (name === 'read_file' || name === 'write_file' || name === 'edit_file') {
    return input.path || input.filePath || JSON.stringify(input);
  }
  if (name === 'web_search') {
    return input.query || JSON.stringify(input);
  }
  if (name === 'web_fetch') {
    return input.url || JSON.stringify(input);
  }
  if (name === 'list_dir') {
    return input.path || input.dir || JSON.stringify(input);
  }
  if (name === 'replace_in_file') {
    return input.path || input.filePath || JSON.stringify(input);
  }
  // Fallback: show first string value
  for (const val of Object.values(input)) {
    if (typeof val === 'string') return val;
  }
  return JSON.stringify(input);
}

/**
 * A single tool call card with running/done/error state
 * and collapsible output.
 */
export function ToolCard({ tool, expanded, onToggle }) {
  const { id, name, input, result, ts, startedAt } = tool;
  const color = RISK_MAP[name] || 'green';
  const [liveElapsed, setLiveElapsed] = useState(0);
  const preview = inputPreview(name, input);

  // Status
  const isRunning = !result;
  const isError = result?.error;
  const isDone = result && !isError;

  // Live elapsed timer for running tools
  useEffect(() => {
    if (!isRunning || !startedAt) return;
    const timer = setInterval(() => {
      setLiveElapsed(Date.now() - startedAt);
    }, 200);
    return () => clearInterval(timer);
  }, [isRunning, startedAt]);

  // Icon
  let icon;
  if (isRunning) {
    icon = e(Text, { color }, e(Spinner, { type: 'dots' }));
  } else if (isError) {
    icon = e(Text, { color: 'red' }, '✗');
  } else {
    icon = e(Text, { color: 'green' }, '✓');
  }

  // Status text
  let statusText = '';
  if (isRunning) {
    statusText = ` ${preview}`;
  } else if (isError) {
    statusText = ` ${result.error?.slice(0, 60) || 'error'}`;
  } else {
    const resultPreview = typeof result === 'string'
      ? result.slice(0, 40)
      : JSON.stringify(result || {}).slice(0, 40);
    statusText = ` ${resultPreview}`;
  }

  // Elapsed
  const elapsedMs = isRunning ? liveElapsed : (startedAt ? Date.now() - startedAt : 0);
  const elapsedStr = isRunning
    ? ` ${formatElapsed(elapsedMs)}`
    : (isDone || isError) ? ` ${formatElapsed(elapsedMs)}` : '';

  const card = e(Box, { key: `tc-${id}`, flexDirection: 'column' },
    // Header line
    e(Box, { key: `tc-h-${id}` },
      e(Text, { color }, '  '),
      icon,
      e(Text, { bold: true, color }, ` ${name}`),
      e(Text, { dimColor: true }, statusText),
      e(Text, { dimColor: true }, elapsedStr)
    )
  );

  // Expanded output
  if (expanded && (isDone || isError) && result) {
    const outputText = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2) || '(no output)';
    const allLines = outputText.split('\n');
    const maxLines = 30;
    const lines = allLines.slice(0, maxLines);
    const truncated = allLines.length > maxLines;

    return e(Box, { key: `tc-${id}`, flexDirection: 'column' },
      card,
      e(Box, { key: `tc-out-${id}`, flexDirection: 'column', paddingLeft: 3 },
        e(Box, null,
          e(Text, { dimColor: true }, '┌─'),
          e(Text, { color: 'yellow', bold: true }, ' output '),
          e(Text, { dimColor: true }, '─'.repeat(35))
        ),
        ...lines.map((line, li) =>
          e(Box, { key: `tc-l-${id}-${li}` },
            e(Text, { dimColor: true }, '│ '),
            e(Text, null, line)
          )
        ),
        truncated && e(Box, null,
          e(Text, { dimColor: true }, '│ '),
          e(Text, { dimColor: true }, `... (${allLines.length - maxLines} more lines)`)
        ),
        e(Text, { dimColor: true }, '└' + '─'.repeat(38))
      )
    );
  }

  return card;
}

/**
 * Tool cards container — shows all active/recent tool calls.
 * Handles key press 'e' to toggle expansion of the last completed tool.
 * 'E' (shift+e) toggles all completed tools.
 */
export function ToolCards({ tools }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);

  useInput((input, key) => {
    // 'E' (shift+E) — toggle all completed tools
    if (input === 'E' && !key.ctrl && !key.meta) {
      setExpandAll(prev => {
        const next = !prev;
        if (next) {
          // Expand all completed tools
          const allDone = tools.filter(t => t.result).map(t => t.id);
          setExpandedIds(new Set(allDone));
        } else {
          // Collapse all
          setExpandedIds(new Set());
        }
        return next;
      });
      return;
    }

    // 'e' — toggle last completed tool
    if (input === 'e' && !key.ctrl && !key.meta) {
      const lastDone = [...tools].reverse().find(t => t.result);
      if (lastDone) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          if (next.has(lastDone.id)) {
            next.delete(lastDone.id);
          } else {
            next.add(lastDone.id);
          }
          return next;
        });
      }
    }
  });

  if (!tools || tools.length === 0) return null;

  const doneCount = tools.filter(t => t.result).length;

  return e(Box, { flexDirection: 'column', marginTop: 1 },
    // Header hint
    tools.length > 0 && e(Box, { key: 'tc-hint', marginBottom: 0 },
      e(Text, { dimColor: true }, `  ${tools.length} tool${tools.length > 1 ? 's' : ''}`),
      doneCount > 0 && e(Text, { dimColor: true }, ` · e: expand · E: ${expandAll ? 'collapse all' : 'expand all'}`)
    ),
    ...tools.map(tc =>
      e(ToolCard, {
        key: tc.id,
        tool: tc,
        expanded: expandedIds.has(tc.id),
      })
    )
  );
}
