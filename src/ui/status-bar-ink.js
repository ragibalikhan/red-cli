import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { exec } from 'child_process';

const e = React.createElement;

/**
 * Truncate a path to fit within maxLen, showing parent dirs
 */
function truncatePath(p, maxLen) {
  if (!p) return '~';
  if (p.length <= maxLen) return p;
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return p.slice(-maxLen);
  return '…/' + parts.slice(-2).join('/');
}

/**
 * Format token count
 */
function formatTokens(count) {
  if (!count) return '0';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

/**
 * Enhanced status bar (opencode-style)
 * Layout: [brand] [git] [cwd] ... [mode] [model] [tokens] [tools]
 */
export function StatusBar({ provider, model, mode, messageCount, toolCount, activeToolCount, cwd, tokenEstimate, maxTokens, isFallback }) {
  const [gitInfo, setGitInfo] = useState({ branch: null, dirty: false });

  useEffect(() => {
    let cancelled = false;
    exec('git rev-parse --abbrev-ref HEAD', { cwd, timeout: 3000, encoding: 'utf8' }, (err, branch) => {
      if (cancelled) return;
      if (err || !branch) {
        setGitInfo({ branch: null, dirty: false });
        return;
      }
      const trimmed = branch.trim();
      exec('git diff --quiet HEAD 2>/dev/null', { cwd, timeout: 3000 }, (err2) => {
        if (cancelled) return;
        setGitInfo({ branch: trimmed, dirty: !!err2 });
      });
    });
    return () => { cancelled = true; };
  }, [cwd]);

  const modeColors = {
    recon: 'cyan', scan: 'yellow', exploit: 'red',
    report: 'green', osint: 'blue', audit: 'magenta'
  };
  const modeColor = modeColors[mode] || 'cyan';
  const shortCwd = truncatePath(cwd, 30);
  const shortModel = model
    ? model.replace(/^anthropic\./, '').replace(/^claude-/, '').replace(/-\d{8}.*$/, '').slice(0, 18)
    : '?';

  return e(Box, { marginTop: 1 },
    e(Box, null,
      e(Text, { bold: true, color: 'red' }, 'red'),
    ),
    gitInfo.branch && e(Box, null,
      e(Text, { dimColor: true }, '  '),
      e(Text, { color: 'green', bold: true }, gitInfo.branch),
      gitInfo.dirty && e(Text, { color: 'yellow' }, '*'),
    ),
    e(Box, null,
      e(Text, { dimColor: true }, '  '),
      e(Text, { dimColor: true }, shortCwd),
    ),
    e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, { color: modeColor, bold: true }, mode),
    ),
    e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, null, shortModel),
      isFallback && e(Text, { color: 'yellow' }, ' ↓'),
    ),
    tokenEstimate > 0 && e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, { dimColor: true }, `${formatTokens(tokenEstimate)}/${formatTokens(maxTokens)}`),
    ),
    e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, { dimColor: true }, `${messageCount} msgs`),
    ),
    activeToolCount > 0 && e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, { color: 'yellow' }, `⚙ ${activeToolCount}`),
    ),
    toolCount > 0 && e(Box, null,
      e(Text, { dimColor: true }, '  │ '),
      e(Text, { dimColor: true }, `${toolCount} tools`),
    ),
  );
}
