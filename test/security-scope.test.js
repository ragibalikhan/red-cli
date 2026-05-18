import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SecurityScope, isNetworkTarget, extractHost } from '../src/security/scope.js';

describe('SecurityScope', () => {
  let dir;
  let path;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'red-scope-'));
    path = join(dir, 'scope.json');
  });

  it('treats local paths as non-network targets', () => {
    expect(isNetworkTarget('./src')).toBe(false);
    expect(isNetworkTarget('src\\index.js')).toBe(false);
  });

  it('extracts the host from a URL', () => {
    expect(extractHost('https://Example.com:443/path')).toBe('example.com');
  });

  it('allows loopback targets by default', () => {
    const scope = new SecurityScope(path);
    expect(scope.isAllowed('127.0.0.1:8080')).toBe(true);
    expect(scope.isAllowed('http://localhost:3000')).toBe(true);
  });

  it('allows exact, wildcard, and CIDR matches', () => {
    const scope = new SecurityScope(path);
    scope.add('example.com');
    scope.add('*.corp.example');
    scope.add('10.0.0.0/8');

    expect(scope.isAllowed('https://example.com/login')).toBe(true);
    expect(scope.isAllowed('api.corp.example')).toBe(true);
    expect(scope.isAllowed('10.4.5.6')).toBe(true);
  });

  it('rejects out-of-scope remote targets', () => {
    const scope = new SecurityScope(path);
    expect(scope.isAllowed('example.org')).toBe(false);
    expect(() => scope.assertAllowed('example.org', 'scan')).toThrow(/authorized scope/);
  });

  it('persists scope entries', () => {
    const scope = new SecurityScope(path);
    scope.add('example.com', { note: 'authorized' });

    const reloaded = new SecurityScope(path);
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.list()[0]).toMatchObject({ target: 'example.com', note: 'authorized' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
