import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

const EVIDENCE_BASE = join(homedir(), '.red', 'evidence');

function getSessionDir(sessionId) {
  return join(EVIDENCE_BASE, sessionId);
}

function ensureDir(dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`[evidence] Failed to create directory ${dir}: ${err.message}`);
  }
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

function safeWrite(filePath, data) {
  try {
    writeFileSync(filePath, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`[evidence] Failed to write ${filePath}: ${err.message}`);
    return false;
  }
}

function safeRead(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function generateSessionId() {
  return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

let activeSessionId = null;
let activeSessionMeta = null;
let sessionFindings = [];

export function startSession(target = '') {
  const id = generateSessionId();
  const dir = getSessionDir(id);
  ensureDir(dir);
  ensureDir(join(dir, 'tools'));
  ensureDir(join(dir, 'scans'));
  ensureDir(join(dir, 'findings'));

  const meta = {
    id,
    target,
    startedAt: new Date().toISOString(),
    toolCalls: [],
    findings: [],
    status: 'active'
  };
  safeWrite(join(dir, 'session.json'), meta);

  activeSessionId = id;
  activeSessionMeta = meta;
  sessionFindings = [];
  return { id, dir };
}

export function getActiveSessionId() {
  return activeSessionId;
}

export function endSession() {
  if (!activeSessionId) return null;
  const dir = getSessionDir(activeSessionId);
  const metaPath = join(dir, 'session.json');

  const meta = safeRead(metaPath);
  if (meta) {
    meta.endedAt = new Date().toISOString();
    meta.status = 'completed';
    meta.findings = sessionFindings;
    safeWrite(metaPath, meta);
  }

  const endedId = activeSessionId;
  activeSessionId = null;
  activeSessionMeta = null;
  sessionFindings = [];
  return endedId;
}

export function recordToolCall(toolName, input, output, duration = 0) {
  if (!activeSessionId) return null;
  const dir = getSessionDir(activeSessionId);

  const record = {
    timestamp: new Date().toISOString(),
    tool: toolName,
    input,
    output: typeof output === 'string' ? output : JSON.stringify(output),
    duration,
    isError: !!(output && output.error)
  };

  const filename = `${safeTimestamp()}_${toolName}.json`;
  safeWrite(join(dir, 'tools', filename), record);

  // Update in-memory meta
  if (activeSessionMeta) {
    activeSessionMeta.toolCalls.push({
      tool: toolName,
      timestamp: record.timestamp,
      isError: record.isError
    });
  }

  // Persist meta every call (idempotent)
  const metaPath = join(dir, 'session.json');
  if (activeSessionMeta) {
    safeWrite(metaPath, activeSessionMeta);
  }

  return record;
}

export function addFinding(finding) {
  if (!activeSessionId) return null;
  const dir = getSessionDir(activeSessionId);

  const record = {
    id: `finding-${Date.now()}-${randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...finding
  };

  sessionFindings.push(record);

  // Update in-memory meta
  if (activeSessionMeta) {
    activeSessionMeta.findings.push(record);
    // Persist immediately
    const metaPath = join(dir, 'session.json');
    safeWrite(metaPath, activeSessionMeta);
  }

  const filename = `${safeTimestamp()}_${(finding.title || 'finding').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)}.json`;
  safeWrite(join(dir, 'findings', filename), record);

  return record;
}

export function generateReport(sessionId = null) {
  const targetId = sessionId || activeSessionId;
  if (!targetId) return null;

  const dir = getSessionDir(targetId);
  const metaPath = join(dir, 'session.json');
  const meta = safeRead(metaPath);
  if (!meta) return null;

  const toolFiles = existsSync(join(dir, 'tools')) ? readdirSync(join(dir, 'tools')) : [];
  const findingFiles = existsSync(join(dir, 'findings')) ? readdirSync(join(dir, 'findings')) : [];

  const findings = findingFiles.map(f => {
    try { return JSON.parse(readFileSync(join(dir, 'findings', f), 'utf-8')); } catch { return null; }
  }).filter(Boolean);

  const toolCalls = toolFiles.map(f => {
    try { return JSON.parse(readFileSync(join(dir, 'tools', f), 'utf-8')); } catch { return null; }
  }).filter(Boolean);

  const bySeverity = { critical: [], high: [], medium: [], low: [], info: [] };
  for (const f of findings) {
    const sev = (f.severity || 'info').toLowerCase();
    if (bySeverity[sev]) bySeverity[sev].push(f);
    else bySeverity.info.push(f);
  }

  let md = `# Security Assessment Report\n\n`;
  md += `**Target:** ${meta.target || 'N/A'}\n`;
  md += `**Session:** ${meta.id}\n`;
  md += `**Started:** ${meta.startedAt}\n`;
  md += `**Ended:** ${meta.endedAt || 'In Progress'}\n`;
  md += `**Tools Executed:** ${toolCalls.length}\n`;
  md += `**Findings:** ${findings.length}\n\n`;

  md += `## Executive Summary\n\n`;
  md += `This assessment executed ${toolCalls.length} tool calls and identified ${findings.length} findings.\n\n`;
  md += `| Severity | Count |\n|----------|-------|\n`;
  for (const [sev, items] of Object.entries(bySeverity)) {
    if (items.length > 0) md += `| ${sev.charAt(0).toUpperCase() + sev.slice(1)} | ${items.length} |\n`;
  }
  md += `\n`;

  if (findings.length > 0) {
    md += `## Findings\n\n`;
    for (const [sev, items] of Object.entries(bySeverity)) {
      if (items.length === 0) continue;
      md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)}\n\n`;
      for (const f of items) {
        md += `#### ${f.title || 'Untitled Finding'}\n\n`;
        if (f.description) md += `${f.description}\n\n`;
        if (f.tool) md += `**Tool:** ${f.tool}\n`;
        if (f.endpoint) md += `**Endpoint:** ${f.endpoint}\n`;
        if (f.payload) md += `**Payload:** \`${f.payload}\`\n`;
        if (f.evidence) md += `**Evidence:** ${f.evidence}\n`;
        if (f.recommendation) md += `**Recommendation:** ${f.recommendation}\n`;
        md += `\n`;
      }
    }
  }

  md += `## Methodology\n\n`;
  md += `Tools executed in order:\n\n`;
  for (const tc of toolCalls) {
    md += `- \`${tc.tool}\` at ${tc.timestamp}${tc.isError ? ' (failed)' : ''}\n`;
  }
  md += `\n`;

  const reportPath = join(dir, 'REPORT.md');
  safeWrite(reportPath, md);

  const summaryPath = join(dir, 'summary.json');
  safeWrite(summaryPath, {
    ...meta,
    findings,
    toolCalls,
    severityCounts: Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, v.length]))
  });

  return { reportPath, summaryPath, dir, findings, toolCalls };
}

export function listSessions() {
  if (!existsSync(EVIDENCE_BASE)) return [];
  return readdirSync(EVIDENCE_BASE)
    .filter(f => f.startsWith('session-'))
    .map(f => {
      const metaPath = join(EVIDENCE_BASE, f, 'session.json');
      const meta = safeRead(metaPath);
      if (meta) return meta;
      return { id: f, status: 'unknown' };
    })
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}

export function getSessionDir_path(sessionId) {
  return getSessionDir(sessionId);
}

export default {
  startSession,
  endSession,
  getActiveSessionId,
  recordToolCall,
  addFinding,
  generateReport,
  listSessions,
  getSessionDir: getSessionDir_path
};
