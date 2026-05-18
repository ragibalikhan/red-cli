import { describe, expect, it } from 'vitest';
import { classifyCommand } from '../src/command-runner.js';

describe('classifyCommand', () => {
  it('treats read-only commands as safe', () => {
    expect(classifyCommand('pwd')).toMatchObject({
      level: 'safe',
      requiresConfirmation: false
    });
  });

  it('requires confirmation for install commands', () => {
    expect(classifyCommand('npm install')).toMatchObject({
      level: 'risky',
      requiresConfirmation: true
    });
  });

  it('marks destructive commands as dangerous', () => {
    expect(classifyCommand('git reset --hard')).toMatchObject({
      level: 'dangerous',
      requiresConfirmation: true
    });
  });
});
