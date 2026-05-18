import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const DEFAULT_SCOPE_PATH = join(homedir(), '.red', 'security-scope.json');

function ensureDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadJson(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {}
  return { targets: [] };
}

function saveJson(path, data) {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function isNetworkTarget(target) {
  if (!target || typeof target !== 'string') return false;
  const value = target.trim();
  if (!value) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.startsWith('./') || value.startsWith('../') || value.startsWith('/') || value.startsWith('\\')) return false;
  if (existsSync(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(value)) return true;
  return /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?$/.test(value);
}

export function normalizeTarget(target) {
  if (!target || typeof target !== 'string') return '';
  return target.trim().replace(/\/+$/, '').toLowerCase();
}

export function extractHost(target) {
  const normalized = normalizeTarget(target);
  if (!normalized) return '';
  try {
    const url = new URL(normalized.startsWith('http') ? normalized : `http://${normalized}`);
    return url.hostname.toLowerCase();
  } catch {
    return normalized.replace(/https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
  }
}

function isLoopback(host) {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return parts.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function matchesCidr(host, pattern) {
  const [range, prefixText] = pattern.split('/');
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const hostNum = ipv4ToNumber(host);
  const rangeNum = ipv4ToNumber(range);
  if (hostNum === null || rangeNum === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (hostNum & mask) === (rangeNum & mask);
}

function matchesPattern(host, pattern) {
  const rawPattern = normalizeTarget(pattern);
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(rawPattern)) {
    return matchesCidr(host, rawPattern);
  }

  const normalizedPattern = extractHost(rawPattern);
  if (!host || !normalizedPattern) return false;
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1);
    return host.endsWith(suffix) && host !== normalizedPattern.slice(2);
  }
  return host === normalizedPattern;
}

export class SecurityScope {
  constructor(scopePath = DEFAULT_SCOPE_PATH) {
    this.scopePath = scopePath;
    this.data = loadJson(scopePath);
    if (!Array.isArray(this.data.targets)) this.data.targets = [];
  }

  save() {
    saveJson(this.scopePath, this.data);
  }

  add(target, options = {}) {
    const value = normalizeTarget(target);
    if (!value) throw new Error('Scope target is required');

    const existing = this.data.targets.find(entry => entry.target === value);
    if (existing) {
      existing.note = options.note || existing.note || '';
      existing.updatedAt = new Date().toISOString();
      this.save();
      return existing;
    }

    const entry = {
      target: value,
      note: options.note || '',
      addedAt: new Date().toISOString()
    };
    this.data.targets.push(entry);
    this.save();
    return entry;
  }

  remove(target) {
    const value = normalizeTarget(target);
    const before = this.data.targets.length;
    this.data.targets = this.data.targets.filter(entry => entry.target !== value);
    this.save();
    return before !== this.data.targets.length;
  }

  clear() {
    this.data.targets = [];
    this.save();
  }

  list() {
    return [...this.data.targets];
  }

  isAllowed(target) {
    if (!isNetworkTarget(target)) return true;
    const host = extractHost(target);
    if (isLoopback(host)) return true;
    return this.data.targets.some(entry => matchesPattern(host, entry.target));
  }

  assertAllowed(target, action = 'security action') {
    if (this.isAllowed(target)) return true;
    const host = extractHost(target) || target;
    throw new Error(
      `Target "${host}" is not in authorized scope for ${action}. ` +
      `Add it first with: red security scope add ${host}`
    );
  }
}

export default SecurityScope;
