/**
 * Paste normalization utilities for Ink REPL
 * Strips shell prompts, ANSI codes, normalizes whitespace
 */

// Common shell prompt patterns
const PROMPT_PATTERNS = [
  // Bash/Zsh:  user@host:~$  or  [user@host dir]$
  /^[^$#>\n]*[$#>]\s*/gm,
  // PowerShell:  PS C:\Users\user>
  /^PS\s+[A-Z:\\\w\s]+>\s*/gm,
  // Windows CMD:  C:\Users\user>
  /^[A-Z:\\\w\s]+>\s*/gm,
  // Generic:  $  or  >  at line start
  /^[$>]\s+/gm,
  // Fish:  ~/dir>  or  fish> 
  /^\w+>\s*/gm,
  // CRLF remnants from Windows
  /\r\n/g,
  /\r/g,
];

// ANSI escape codes: \x1b[...m  or  \x1b[...;...m
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Strip shell prompts from pasted text
 */
function stripPrompts(text) {
  let result = text;
  for (const pattern of PROMPT_PATTERNS) {
    result = result.replace(pattern, (match, offset, str) => {
      // Only strip at line beginnings (already handled by ^ flag in most patterns)
      return '';
    });
  }
  return result;
}

/**
 * Strip ANSI escape codes
 */
function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Normalize whitespace:
 * - Convert tabs to 2 spaces
 * - Collapse multiple spaces to one (preserving newlines)
 * - Trim trailing whitespace per line
 */
function normalizeWhitespace(text) {
  const lines = text.split('\n');
  return lines
    .map(line => {
      // Tabs to spaces
      let normalized = line.replace(/\t/g, '  ');
      // Collapse multiple spaces (but not at start if intentional indent)
      normalized = normalized.replace(/ {3,}/g, '  ');
      // Trim trailing whitespace
      return normalized.trimEnd();
    })
    .join('\n');
}

/**
 * Detect if text contains file paths
 * Returns array of detected paths
 */
export function detectFilePaths(text) {
  const patterns = [
    // Windows paths: C:\... or D:\...
    /[A-Z]:\\(?:[\w.\-\s]+\\)*[\w.\-\s]+/g,
    // Unix paths: /home/... or ./...
    /(?:\.\/|\.\.\/|\/[\w.\-/]+(?:\.\w+)?)/g,
    // Relative paths with extensions
    /(?:src|lib|bin|test|tests|spec|dist|build|packages?)\/[\w.\-/]+/g,
  ];

  const paths = [];
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (!paths.includes(match[0])) {
        paths.push(match[0]);
      }
    }
  }
  return paths;
}

/**
 * Detect if text is a code block (multi-line with common code patterns)
 */
function isCodeBlock(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 3) return false;

  const codeIndicators = [
    /^(?:const|let|var|function|class|import|export|return|if|else|for|while|try|catch)/,
    /[{}\[\]();]/,
    /=>/,
    /===?|!==?|>=?|<=?/,
    /\b(?:true|false|null|undefined|this|new)\b/,
    /^\s*\/\/|^\s*#|^\s*\/\*/,
    /require\(|import\(|from\s+['"]/,
  ];

  let score = 0;
  for (const line of lines.slice(0, 10)) {
    for (const indicator of codeIndicators) {
      if (indicator.test(line)) {
        score++;
        break;
      }
    }
  }

  return score >= Math.min(3, lines.length);
}

/**
 * Full paste normalization pipeline
 * Returns { normalized, paths, isCode, lineCount, charCount }
 */
export function normalizePaste(text) {
  // Step 1: Strip ANSI codes
  let result = stripAnsi(text);

  // Step 2: Strip shell prompts
  result = stripPrompts(result);

  // Step 3: Normalize line endings
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Step 4: Normalize whitespace
  result = normalizeWhitespace(result);

  // Step 5: Trim
  result = result.trim();

  const paths = detectFilePaths(result);
  const isCode = isCodeBlock(result);
  const lineCount = result.split('\n').length;
  const charCount = result.length;

  return {
    normalized: result,
    paths,
    isCode,
    lineCount,
    charCount,
  };
}

/**
 * Create a paste summary for display
 * e.g., "[Pasted 12 lines, 340 chars] [3 paths] [code block]"
 */
export function pasteSummary(info) {
  const parts = [`Pasted ~${info.lineCount} lines, ~${info.charCount} chars`];
  if (info.paths.length > 0) {
    parts.push(`${info.paths.length} path${info.paths.length > 1 ? 's' : ''}`);
  }
  if (info.isCode) {
    parts.push('code block');
  }
  return `[${parts.join('] [')}]`;
}
