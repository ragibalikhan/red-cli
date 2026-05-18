const TOOL_CALL_ID_PREFIX = 'text_call';

function stripJsonFence(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function normalizeToolCall(call, index = 0) {
  if (!call || typeof call !== 'object') return null;

  const name = call.name || call.tool || call.tool_name || call.function?.name;
  const input = call.input || call.arguments || call.args || call.parameters || call.function?.arguments || {};

  if (!name || typeof name !== 'string') return null;

  let parsedInput = input;
  if (typeof parsedInput === 'string') {
    try {
      parsedInput = JSON.parse(parsedInput);
    } catch {
      parsedInput = { input: parsedInput };
    }
  }

  return {
    id: call.id || `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${index}`,
    name,
    input: parsedInput && typeof parsedInput === 'object' ? parsedInput : {}
  };
}

function extractJsonCandidates(text) {
  const candidates = [];
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of fenced) {
    candidates.push(match[1].trim());
  }

  const trimmed = stripJsonFence(text);
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push(trimmed);
  }

  const objectMatch = text.match(/\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (objectMatch) {
    candidates.push(objectMatch[0]);
  }

  const singleMatch = text.match(/\{\s*"tool"\s*:\s*"[^"]+"[\s\S]*?\}/);
  if (singleMatch) {
    candidates.push(singleMatch[0]);
  }

  return [...new Set(candidates)];
}

export function parseToolCallsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const calls = Array.isArray(parsed)
        ? parsed
        : parsed.tool_calls || parsed.toolCalls || parsed.tools || (parsed.tool || parsed.name ? [parsed] : []);

      const normalized = calls
        .map((call, index) => normalizeToolCall(call, index))
        .filter(Boolean);

      if (normalized.length > 0) return normalized;
    } catch {}
  }

  return [];
}

export function getTextToolCallPrompt() {
  return `When you need to use a tool and native tool calling is unavailable, respond with ONLY valid JSON in this shape:
{"tool_calls":[{"name":"tool_name","input":{"key":"value"}}]}

Do not wrap it in prose. After the tool result is provided, continue normally.`;
}

export function getTextToolSchemaPrompt(tools = []) {
  if (!tools.length) return '';
  const schemas = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema
  }));
  return `Text tool-call schemas:\n${JSON.stringify(schemas, null, 2)}`;
}
