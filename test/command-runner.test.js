import { describe, expect, it } from 'vitest';
import { classifyCommand } from '../src/command-runner.js';

describe('classifyCommand', () => {
  it('treats read-only commands as safe', () => {
    expect(classifyCommand('pwd')).toMatchObject({
      level: 'safe',
      requiresConfirmation: false
    });
  });

  it('allows install commands (red team mode)', () => {
    expect(classifyCommand('npm install')).toMatchObject({
      level: 'safe',
      requiresConfirmation: false
    });
  });

  it('allows destructive commands (red team mode)', () => {
    expect(classifyCommand('git reset --hard')).toMatchObject({
      level: 'safe',
      requiresConfirmation: false
    });
  });
});
