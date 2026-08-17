/**
 * Red CLI Permission System
 * Controls which tools can run without prompting, which need approval, and which are blocked.
 * Inspired by Claude Code's allow/ask/deny model.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PERMISSIONS_PATH = join(homedir(), '.red', 'permissions.json');

// Default tool classifications
const DEFAULT_PERMISSIONS = {
  mode: 'auto', // default | auto | recon-only
  allow: [
    // All tools allowed — red team mode
    'read_file', 'list_directory', 'search_files',
    'web_fetch', 'web_search',
    'dns_lookup', 'fingerprint', 'cve_search', 'subdomain_enum',
    'passive_analyze', 'cvss_score', 'correlate_findings',
    'waf_encode', 'attack_surface',
    'bash(*)', 'write_file(*)', 'edit_file(*)',
    'install_tool(*)', 'port_scan(*)',
    'active_scan(*)', 'exploit(*)', 'payload_gen(*)',
    'interactsh_listen(*)', 'jwt_attack(*)'
  ],
  ask: [],
  deny: []
};

let _permissions = null;

/**
 * Load permissions from disk or return defaults.
 */
export function loadPermissions() {
  if (_permissions) return _permissions;

  try {
    if (existsSync(PERMISSIONS_PATH)) {
      _permissions = JSON.parse(readFileSync(PERMISSIONS_PATH, 'utf-8'));
    } else {
      _permissions = { ...DEFAULT_PERMISSIONS };
      savePermissions(_permissions);
    }
  } catch {
    _permissions = { ...DEFAULT_PERMISSIONS };
  }
  return _permissions;
}

/**
 * Save permissions to disk.
 */
export function savePermissions(perms) {
  const dir = join(homedir(), '.red');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(PERMISSIONS_PATH, JSON.stringify(perms, null, 2));
  _permissions = perms;
}

/**
 * Match a tool call against a permission rule.
 * Rules: "tool_name" matches all, "tool_name(pattern)" matches with glob.
 */
function matchesRule(rule, toolName, toolInput) {
  // Exact tool match: "read_file"
  if (rule === toolName) return true;

  // Pattern match: "bash(*)" or "bash(nmap *)"
  const match = rule.match(/^(\w+)\((.+)\)$/);
  if (!match) return false;

  const [, ruleTool, pattern] = match;
  if (ruleTool !== toolName) return false;

  // Wildcard match
  if (pattern === '*') return true;

  // Match against command string (for bash) or JSON input
  const inputStr = toolName === 'bash'
    ? (toolInput?.command || '')
    : JSON.stringify(toolInput || {});

  // Convert glob pattern to regex
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(inputStr);
}

/**
 * Evaluate permission for a tool call.
 * Returns: 'allow' | 'ask' | 'deny'
 * Order: deny → ask → allow (deny wins)
 */
export function evaluatePermission(toolName, toolInput = {}) {
  const perms = loadPermissions();

  // Auto mode: allow everything except deny list
  if (perms.mode === 'auto') {
    for (const rule of perms.deny) {
      if (matchesRule(rule, toolName, toolInput)) return 'deny';
    }
    return 'allow';
  }

  // Recon-only mode: only allow read tools
  if (perms.mode === 'recon-only') {
    if (perms.allow.some(r => matchesRule(r, toolName, toolInput))) return 'allow';
    return 'deny';
  }

  // Default mode: deny → ask → allow
  for (const rule of perms.deny) {
    if (matchesRule(rule, toolName, toolInput)) return 'deny';
  }
  for (const rule of perms.ask) {
    if (matchesRule(rule, toolName, toolInput)) return 'ask';
  }
  for (const rule of perms.allow) {
    if (matchesRule(rule, toolName, toolInput)) return 'allow';
  }

  // Default: ask for unknown tools
  return 'ask';
}

/**
 * Add a rule to a permission list.
 */
export function addRule(list, rule) {
  const perms = loadPermissions();
  if (!perms[list]) return false;
  if (!perms[list].includes(rule)) {
    perms[list].push(rule);
    savePermissions(perms);
  }
  return true;
}

/**
 * Remove a rule from a permission list.
 */
export function removeRule(list, rule) {
  const perms = loadPermissions();
  if (!perms[list]) return false;
  perms[list] = perms[list].filter(r => r !== rule);
  savePermissions(perms);
  return true;
}

/**
 * Set permission mode.
 */
export function setMode(mode) {
  const valid = ['default', 'auto', 'recon-only'];
  if (!valid.includes(mode)) return false;
  const perms = loadPermissions();
  perms.mode = mode;
  savePermissions(perms);
  return true;
}

export default { loadPermissions, savePermissions, evaluatePermission, addRule, removeRule, setMode };
