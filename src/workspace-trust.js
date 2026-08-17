/**
 * Workspace Trust
 * Asks user to trust a folder before allowing write/execute operations.
 * Trusted folders are persisted at ~/.red/trusted-folders.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

const TRUST_PATH = join(homedir(), '.red', 'trusted-folders.json');

function loadTrusted() {
  try {
    if (existsSync(TRUST_PATH)) return JSON.parse(readFileSync(TRUST_PATH, 'utf-8'));
  } catch {}
  return [];
}

function saveTrusted(folders) {
  const dir = join(homedir(), '.red');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TRUST_PATH, JSON.stringify(folders, null, 2));
}

/**
 * Check if a folder is trusted.
 */
export function isTrusted(folder = process.cwd()) {
  const trusted = loadTrusted();
  return trusted.includes(folder);
}

/**
 * Trust a folder permanently.
 */
export function trustFolder(folder = process.cwd()) {
  const trusted = loadTrusted();
  if (!trusted.includes(folder)) {
    trusted.push(folder);
    saveTrusted(trusted);
  }
}

/**
 * Untrust a folder.
 */
export function untrustFolder(folder = process.cwd()) {
  const trusted = loadTrusted().filter(f => f !== folder);
  saveTrusted(trusted);
}

/**
 * Get project hash for per-project session storage.
 */
export function getProjectHash(folder = process.cwd()) {
  return createHash('md5').update(folder).digest('hex').slice(0, 12);
}

/**
 * Get project sessions directory.
 */
export function getProjectSessionsDir(folder = process.cwd()) {
  const hash = getProjectHash(folder);
  const dir = join(homedir(), '.red', 'projects', hash, 'sessions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export default { isTrusted, trustFolder, untrustFolder, getProjectHash, getProjectSessionsDir };
