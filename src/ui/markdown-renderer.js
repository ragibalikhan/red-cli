import React from 'react';
import { Box, Text } from 'ink';
import { marked } from 'marked';

const e = React.createElement;

/**
 * Basic syntax highlighting for code blocks
 * Returns colored tokens for common patterns
 */
function highlightCode(code, lang) {
  if (!lang || !['js', 'javascript', 'ts', 'typescript', 'py', 'python', 'bash', 'sh', 'shell', 'json', 'yaml', 'yml', 'sql', 'go', 'rust', 'java', 'c', 'cpp'].includes(lang)) {
    return e(Text, null, code);
  }

  const lines = code.split('\n');
  return lines.map((line, i) => {
    const tokens = [];
    let remaining = line;

    // Keywords by language
    const keywords = {
      js: /\b(const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|in|of|import|export|default|from|async|await|try|catch|throw|finally|yield|void|null|undefined|true|false)\b/g,
      ts: /\b(const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|in|of|import|export|default|from|async|await|try|catch|throw|finally|yield|void|null|undefined|true|false|type|interface|enum|implements|extends|abstract|private|protected|public|readonly|as|keyof|never|unknown|any|string|number|boolean)\b/g,
      py: /\b(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|yield|lambda|pass|True|False|None|and|or|not|in|is|global|nonlocal|del|assert|print|self)\b/g,
      bash: /\b(echo|if|then|else|fi|for|do|done|while|until|case|esac|function|return|exit|export|source|alias|unalias|cd|ls|grep|awk|sed|find|cat|head|tail|sort|uniq|wc|cut|tr|tee|xargs|mkdir|rm|cp|mv|chmod|chown|sudo|apt|yum|brew|git|docker|curl|wget|ssh|scp|rsync|tar|zip|unzip)\b/g,
      json: /("(?:[^"\\]|\\.)*")\s*:/g,
      go: /\b(package|import|func|var|const|type|struct|interface|return|if|else|for|range|switch|case|default|break|continue|go|defer|chan|select|map|make|new|len|cap|append|close|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|true|false|nil)\b/g,
      rust: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|self|super|return|if|else|for|while|loop|match|break|continue|move|ref|async|await|where|type|as|in|true|false|Option|Result|String|Vec|Box|Rc|Arc|Some|None|Ok|Err|i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|f32|f64|bool|str|char)\b/g,
      java: /\b(package|import|public|private|protected|static|final|abstract|class|interface|enum|extends|implements|new|this|super|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|void|int|long|double|float|boolean|char|byte|short|String|true|false|null)\b/g,
    };

    // String highlighting
    const stringPattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
    // Comment highlighting
    const commentPattern = /(\/\/.*$|#.*$)/gm;
    // Number highlighting
    const numberPattern = /\b(\d+\.?\d*)\b/g;

    // Simple token-based highlighting
    const highlighted = [];
    let lastIdx = 0;

    // Match strings first (highest priority)
    const strings = [...remaining.matchAll(stringPattern)].map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'string' }));
    // Match comments
    const comments = [...remaining.matchAll(commentPattern)].map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'comment' }));
    // Match keywords
    const kwPattern = keywords[jsLang(lang)] || keywords.js;
    const keywords_found = [...remaining.matchAll(kwPattern)].map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0], type: 'keyword' }));

    // Merge and sort by position
    const allTokens = [...strings, ...comments, ...keywords_found]
      .sort((a, b) => a.start - b.start);

    // Remove overlapping tokens
    const used = new Set();
    const finalTokens = [];
    for (const tok of allTokens) {
      let overlap = false;
      for (let i = tok.start; i < tok.end; i++) {
        if (used.has(i)) { overlap = true; break; }
      }
      if (!overlap) {
        finalTokens.push(tok);
        for (let i = tok.start; i < tok.end; i++) used.add(i);
      }
    }

    // Build highlighted line
    for (const tok of finalTokens) {
      if (tok.start > lastIdx) {
        highlighted.push(e(Text, { key: `${i}-plain-${lastIdx}` }, remaining.slice(lastIdx, tok.start)));
      }
      const color = tok.type === 'string' ? 'green' : tok.type === 'comment' ? 'gray' : tok.type === 'keyword' ? 'cyan' : 'yellow';
      highlighted.push(e(Text, { key: `${i}-tok-${tok.start}`, color }, tok.text));
      lastIdx = tok.end;
    }
    if (lastIdx < remaining.length) {
      highlighted.push(e(Text, { key: `${i}-rest-${lastIdx}` }, remaining.slice(lastIdx)));
    }

    return e(Text, { key: `line-${i}` }, highlighted.length > 0 ? highlighted : remaining);
  });
}

function jsLang(lang) {
  if (['ts', 'typescript'].includes(lang)) return 'ts';
  if (['py', 'python'].includes(lang)) return 'py';
  if (['sh', 'shell'].includes(lang)) return 'bash';
  if (['go'].includes(lang)) return 'go';
  if (['rust', 'rs'].includes(lang)) return 'rust';
  if (['java'].includes(lang)) return 'java';
  return 'js';
}

/**
 * Render a single inline token as Ink Text elements.
 * Handles: text, strong, em, codespan, link, br
 */
function renderInlineTokens(tokens, keyPrefix = '') {
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((tok, i) => {
    const k = `${keyPrefix}-i${i}`;
    switch (tok.type) {
      case 'text':
        return e(Text, { key: k }, tok.text);
      case 'strong':
        return e(Text, { key: k, bold: true }, renderInlineTokens(tok.tokens, k));
      case 'em':
        return e(Text, { key: k, italic: true }, renderInlineTokens(tok.tokens, k));
      case 'codespan':
        return e(Text, { key: k, color: 'yellow' }, tok.text);
      case 'link':
        return e(Text, { key: k, color: 'cyan', underline: true }, tok.text);
      case 'br':
        return e(Text, { key: k }, '\n');
      case 'del':
        return e(Text, { key: k, strikethrough: true }, renderInlineTokens(tok.tokens, k));
      default:
        return e(Text, { key: k }, tok.raw || tok.text || '');
    }
  });
}

/**
 * Render a block-level token as Ink elements.
 */
function renderBlockToken(tok, keyPrefix = '') {
  const k = `${keyPrefix}-b`;
  switch (tok.type) {
    case 'paragraph':
      return e(Box, { key: k, flexDirection: 'column', marginTop: 1 },
        e(Text, { wrap: 'wrap' }, renderInlineTokens(tok.tokens, k))
      );

    case 'heading': {
      const hashes = '#'.repeat(tok.depth);
      const color = tok.depth <= 2 ? 'red' : tok.depth <= 4 ? 'yellow' : 'cyan';
      return e(Box, { key: k, marginTop: 1 },
        e(Text, { bold: true, color }, `${hashes} `),
        e(Text, { bold: true, color, wrap: 'wrap' }, renderInlineTokens(tok.tokens, k))
      );
    }

    case 'code': {
      const langLabel = tok.lang ? ` ${tok.lang}` : '';
      const lines = tok.text.split('\n');
      const hasLang = tok.lang && ['js', 'javascript', 'ts', 'typescript', 'py', 'python', 'bash', 'sh', 'shell', 'json', 'go', 'rust', 'java'].includes(tok.lang);

      return e(Box, { key: k, flexDirection: 'column', marginTop: 1 },
        e(Box, null,
          e(Text, { dimColor: true }, '┌─'),
          e(Text, { color: 'yellow', bold: true }, ` code${langLabel} `),
          e(Text, { dimColor: true }, '─'.repeat(Math.max(0, 40 - langLabel.length)))
        ),
        ...(hasLang
          ? highlightCode(tok.text, tok.lang).map((line, li) =>
            e(Box, { key: `${k}-L${li}` },
              e(Text, { dimColor: true }, '│ '),
              line
            )
          )
          : lines.map((line, li) =>
            e(Box, { key: `${k}-L${li}` },
              e(Text, { dimColor: true }, '│ '),
              e(Text, null, line)
            )
          )
        ),
        e(Text, { dimColor: true }, '└' + '─'.repeat(42))
      );
    }

    case 'list': {
      const items = tok.items.map((item, ii) => {
        const bullet = tok.ordered ? `${tok.start || 1 + ii}. ` : '• ';
        return e(Box, { key: `${k}-item${ii}`, flexDirection: 'column', paddingLeft: 2 },
          e(Text, { wrap: 'wrap' },
            e(Text, { color: 'cyan' }, bullet),
            renderInlineTokens(item.tokens, `${k}-item${ii}`)
          )
        );
      });
      return e(Box, { key: k, flexDirection: 'column', marginTop: 1 }, ...items);
    }

    case 'blockquote': {
      const inner = tok.tokens || [];
      return e(Box, { key: k, flexDirection: 'column', marginTop: 1, paddingLeft: 1 },
        e(Text, { color: 'gray' }, '│ '),
        ...inner.map((t, bi) => renderBlockToken(t, `${k}-q${bi}`))
      );
    }

    case 'hr':
      return e(Text, { key: k, dimColor: true }, '─'.repeat(50));

    case 'table': {
      const rows = [];
      if (tok.header) {
        rows.push(e(Box, { key: `${k}-hdr` },
          e(Text, { bold: true }, '| '),
          ...tok.header.map((cell, ci) =>
            e(Text, { key: `${k}-hc${ci}` }, cell.text, ' | ')
          )
        ));
        rows.push(e(Text, { key: `${k}-sep`, dimColor: true }, '|' + '---|'.repeat(tok.header.length)));
      }
      for (const row of tok.rows) {
        rows.push(e(Box, { key: `${k}-row` },
          e(Text, null, '| '),
          ...row.map((cell, ci) =>
            e(Text, { key: `${k}-rc${ci}` }, cell.text, ' | ')
          )
        ));
      }
      return e(Box, { key: k, flexDirection: 'column', marginTop: 1 }, ...rows);
    }

    case 'space':
      return null;

    default:
      return e(Text, { key: k }, tok.raw || tok.text || '');
  }
}

/**
 * Render markdown text as Ink components.
 * Handles streaming — if the last token is incomplete, it is held back.
 *
 * @param {object} props
 * @param {string} props.text - Raw markdown text
 * @param {boolean} [props.streaming=false] - If true, hold back incomplete last token
 * @returns {React.Element}
 */
export function MarkdownRenderer({ text, streaming = false }) {
  if (!text) return null;

  let tokens;
  try {
    tokens = marked.lexer(text);
  } catch {
    return e(Text, { wrap: 'wrap' }, text);
  }

  if (tokens.length === 0) return null;

  // During streaming, check if the last token looks incomplete
  let renderTokens = tokens;
  if (streaming && tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    // Hold back incomplete code blocks (no closing ```)
    if (last.type === 'paragraph' && last.raw.startsWith('```') && !last.raw.endsWith('```')) {
      renderTokens = tokens.slice(0, -1);
    }
    // Hold back incomplete blockquotes
    if (last.type === 'blockquote' && !last.raw.endsWith('\n\n')) {
      renderTokens = tokens.slice(0, -1);
    }
  }

  const rendered = renderTokens
    .map((tok, i) => renderBlockToken(tok, `md-${i}`))
    .filter(Boolean);

  if (rendered.length === 0) {
    return e(Text, { wrap: 'wrap' }, text);
  }

  return e(Box, { flexDirection: 'column' }, ...rendered);
}

/**
 * Simple inline markdown renderer for history items.
 * Renders bold, italic, codespan without block-level parsing.
 */
export function InlineMarkdown({ text }) {
  if (!text) return null;

  let tokens;
  try {
    tokens = marked.lexer(text);
  } catch {
    return e(Text, { wrap: 'wrap' }, text);
  }

  if (tokens.length === 0) return e(Text, null, text);

  // Flatten all inline tokens from all blocks
  const inlineTokens = [];
  for (const tok of tokens) {
    if (tok.tokens) {
      inlineTokens.push(...tok.tokens);
    } else if (tok.text) {
      inlineTokens.push({ type: 'text', text: tok.text });
    }
  }

  if (inlineTokens.length === 0) return e(Text, null, text);

  return e(Text, { wrap: 'wrap' }, renderInlineTokens(inlineTokens, 'il'));
}
