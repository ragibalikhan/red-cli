import { spawn } from 'child_process';
import { resolve, relative, isAbsolute } from 'path';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CAPTURE_LENGTH = 10000;

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+.*\/[sq]\b/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[^\s]*[fd]/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bSet-ExecutionPolicy\b/i,
  /\breg\s+delete\b/i
];

const RISKY_PATTERNS = [
  /\s>\s*/,
  /\s>>\s*/,
  /\bnpm\s+(install|i)\b/i,
  /\byarn\s+(add|install)\b/i,
  /\bpnpm\s+(add|install)\b/i,
  /\bpip(?:3)?\s+install\b/i,
  /\buv\s+(add|pip\s+install)\b/i,
  /\bcargo\s+(add|install)\b/i,
  /\bgo\s+install\b/i,
  /\bgit\s+(commit|checkout|stash|pull|merge|rebase|add)\b/i,
  /\b(choco|winget|brew|apt|apt-get|sudo)\s+/i,
  /\b(curl|wget)\s+.*\|\s*(sh|bash|powershell|pwsh)\b/i
];

function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.RED_SHELL || process.env.SHELL || 'powershell.exe';
  }
  return process.env.RED_SHELL || process.env.SHELL || '/bin/sh';
}

function truncate(value, maxLength = MAX_CAPTURE_LENGTH) {
  if (!value || value.length <= maxLength) return { value: value || '', truncated: false, originalLength: value?.length || 0 };
  return {
    value: value.slice(0, maxLength),
    truncated: true,
    originalLength: value.length
  };
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}

export function classifyCommand(command) {
  const text = command || '';
  if (DANGEROUS_PATTERNS.some(pattern => pattern.test(text))) {
    return {
      level: 'dangerous',
      requiresConfirmation: true,
      reason: 'Command can delete data, reset state, or change system configuration.'
    };
  }

  if (RISKY_PATTERNS.some(pattern => pattern.test(text))) {
    return {
      level: 'risky',
      requiresConfirmation: true,
      reason: 'Command may write files, install software, change git state, or run network-fetched code.'
    };
  }

  return {
    level: 'safe',
    requiresConfirmation: false,
    reason: 'Read-only or low-risk command.'
  };
}

export async function runCommand(input, options = {}) {
  const command = input.command;
  if (!command || typeof command !== 'string') {
    return { ok: false, error: 'Command is required', exitCode: null };
  }

  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const requestedCwd = resolve(input.cwd || options.cwd || process.cwd());
  const sandboxPermissions = input.sandbox_permissions || input.sandboxPermissions || 'workspace-write';
  const timeoutMs = input.timeout_ms || input.timeoutMs || options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const streamOutput = input.stream !== false;
  const shell = input.shell || getDefaultShell();
  const classification = classifyCommand(command);
  const needsEscalation = sandboxPermissions === 'require_escalated';
  const cwdOutsideWorkspace = !isInside(workspaceRoot, requestedCwd);

  if (cwdOutsideWorkspace && !needsEscalation) {
    return {
      ok: false,
      error: `Refusing to run outside workspace. cwd=${requestedCwd}`,
      classification,
      cwd: requestedCwd,
      workspaceRoot,
      exitCode: null
    };
  }

  if ((classification.requiresConfirmation || needsEscalation || cwdOutsideWorkspace) && options.onConfirm) {
    const reason = needsEscalation
      ? 'This command requested escalated permissions.'
      : cwdOutsideWorkspace
        ? 'This command runs outside the workspace.'
        : classification.reason;
    const confirmed = await options.onConfirm(
      `Command requires confirmation (${classification.level}): ${command}\n${reason}\nRun in: ${requestedCwd}\nProceed? (y/n): `
    );
    if (!confirmed) {
      return {
        ok: false,
        cancelled: true,
        output: 'Command cancelled by user',
        classification,
        cwd: requestedCwd,
        exitCode: null
      };
    }
  } else if (classification.requiresConfirmation || needsEscalation || cwdOutsideWorkspace) {
    return {
      ok: false,
      error: `Command requires user confirmation (${classification.level})`,
      classification,
      cwd: requestedCwd,
      exitCode: null
    };
  }

  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let interrupted = false;

  return await new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd: requestedCwd,
      env: { ...process.env },
      shell,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const onSigint = () => {
      interrupted = true;
      child.kill('SIGTERM');
    };

    process.once('SIGINT', onSigint);

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (streamOutput) process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (streamOutput) process.stderr.write(text);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', onSigint);
      const durationMs = Date.now() - startedAt;
      const out = truncate(stdout);
      const errOut = truncate(stderr);
      resolvePromise({
        ok: false,
        command,
        cwd: requestedCwd,
        shell,
        classification,
        exitCode: null,
        signal: null,
        durationMs,
        timedOut,
        interrupted,
        stdout: out.value,
        stderr: errOut.value,
        output: out.value || errOut.value || '',
        truncated: out.truncated || errOut.truncated,
        originalLength: out.originalLength + errOut.originalLength,
        error: err.message
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', onSigint);
      const durationMs = Date.now() - startedAt;
      const out = truncate(stdout);
      const errOut = truncate(stderr);
      const output = out.value || errOut.value || '(no output)';
      resolvePromise({
        ok: exitCode === 0 && !timedOut && !interrupted,
        command,
        cwd: requestedCwd,
        shell,
        classification,
        exitCode,
        signal,
        durationMs,
        timedOut,
        interrupted,
        stdout: out.value,
        stderr: errOut.value,
        output,
        truncated: out.truncated || errOut.truncated,
        originalLength: out.originalLength + errOut.originalLength,
        error: timedOut
          ? `Command timed out after ${timeoutMs}ms`
          : interrupted
            ? 'Command interrupted'
            : exitCode === 0 ? null : `Command failed with exit code ${exitCode}`
      });
    });
  });
}
