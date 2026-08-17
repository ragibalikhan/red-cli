/**
 * Session Manager — JSONL-based session persistence
 * Auto-saves conversation after every AI response.
 * Format: one JSON object per line (lossless — preserves tool calls, structured content).
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const SESSIONS_DIR = join(homedir(), '.red', 'sessions');
const CLEANUP_DAYS = 30;

function ensureDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function generateId() {
  return `${Date.now()}-${randomBytes(4).toString('hex')}`;
}

export class SessionManager {
  constructor() {
    this.sessionId = null;
    this.sessionPath = null;
    this.name = null;
    this.messageCount = 0;
    ensureDir();
  }

  /**
   * Start a new session.
   */
  start(name = null) {
    this.sessionId = generateId();
    this.name = name;
    this.sessionPath = join(SESSIONS_DIR, `${this.sessionId}.jsonl`);
    this.messageCount = 0;
    // Write metadata as first line
    this._append({ type: 'meta', sessionId: this.sessionId, name, cwd: process.cwd(), startedAt: new Date().toISOString(), model: null, provider: null });
    return this.sessionId;
  }

  /**
   * Append a message to the current session.
   */
  saveMessage(msg) {
    if (!this.sessionPath) this.start();
    this.messageCount++;
    this._append({ type: 'message', ...msg, ts: Date.now() });
  }

  /**
   * Save all messages at once (bulk write for resume/load).
   */
  saveAll(messages, meta = {}) {
    if (!this.sessionPath) this.start(meta.name);
    for (const msg of messages) {
      this.messageCount++;
      this._append({ type: 'message', role: msg.role, content: msg.content, ts: Date.now() });
    }
  }

  /**
   * Rename current session.
   */
  rename(newName) {
    this.name = newName;
    this._append({ type: 'meta', name: newName, renamedAt: new Date().toISOString() });
  }

  /**
   * Load a session by ID or path.
   * @returns {{ messages: Array, meta: object }}
   */
  static load(sessionIdOrPath) {
    let filePath = sessionIdOrPath;
    if (!existsSync(filePath)) {
      filePath = join(SESSIONS_DIR, `${sessionIdOrPath}.jsonl`);
    }
    if (!existsSync(filePath)) return null;

    const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const messages = [];
    let meta = {};

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'meta') {
          meta = { ...meta, ...obj };
        } else if (obj.type === 'message') {
          messages.push({ role: obj.role, content: obj.content, ...(obj.reasoning_content && { reasoning_content: obj.reasoning_content }) });
        }
      } catch {}
    }

    return { messages, meta, path: filePath };
  }

  /**
   * List all sessions, sorted by most recent.
   */
  static list(limit = 20) {
    ensureDir();
    const files = readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const path = join(SESSIONS_DIR, f);
        const stat = statSync(path);
        // Read first line for metadata
        let meta = {};
        let msgCount = 0;
        let firstPrompt = '';
        try {
          const content = readFileSync(path, 'utf-8');
          const lines = content.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.type === 'meta') meta = { ...meta, ...obj };
              if (obj.type === 'message') {
                msgCount++;
                if (!firstPrompt && obj.role === 'user' && typeof obj.content === 'string') {
                  firstPrompt = obj.content.slice(0, 80);
                }
              }
            } catch {}
          }
        } catch {}

        return {
          id: f.replace('.jsonl', ''),
          path,
          name: meta.name || null,
          cwd: meta.cwd || null,
          startedAt: meta.startedAt || stat.mtime.toISOString(),
          mtime: stat.mtime,
          size: stat.size,
          msgCount,
          firstPrompt
        };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    return files;
  }

  /**
   * Get the most recent session.
   */
  static getMostRecent() {
    const sessions = SessionManager.list(1);
    return sessions[0] || null;
  }

  /**
   * Find session by name.
   */
  static findByName(name) {
    const sessions = SessionManager.list(50);
    return sessions.find(s => s.name === name) || null;
  }

  /**
   * Cleanup old sessions (older than CLEANUP_DAYS).
   */
  static cleanup() {
    ensureDir();
    const cutoff = Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000;
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    let removed = 0;
    for (const f of files) {
      const path = join(SESSIONS_DIR, f);
      const stat = statSync(path);
      if (stat.mtime.getTime() < cutoff) {
        unlinkSync(path);
        removed++;
      }
    }
    return removed;
  }

  _append(obj) {
    appendFileSync(this.sessionPath, JSON.stringify(obj) + '\n');
  }
}

export default SessionManager;
