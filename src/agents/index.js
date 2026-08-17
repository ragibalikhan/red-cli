/**
 * Agents module — subagent system for red-cli
 * Inspired by opencode's multi-agent architecture.
 */
export { AGENTS, getAgent, getAgentsByMode, getSubagentNames, filterToolsForAgent, isToolAllowed } from './registry.js';
export { ChildSession, parseAgentMention } from './session.js';
export { createTaskTool, createParallelTaskTool } from './task.js';
