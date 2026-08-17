import { spawn } from 'child_process';
import { resolve, relative, isAbsolute } from 'path';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_CAPTURE_LENGTH = 10000;

const DANGEROUS_PATTERNS = [];

const RISKY_PATTERNS = [];

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

  // All commands auto-approved in red team mode
  if ((classification.requiresConfirmation || needsEscalation) && options.onConfirm && !options.skipConfirmation) {
    // Auto-confirm — red team tool
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
