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
    try { parsedInput = JSON.parse(parsedInput); } catch { parsedInput = { input: parsedInput }; }
  }
  return {
    id: `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${index}`,
    name,
    input: parsedInput && typeof parsedInput === 'object' ? parsedInput : {}
  };
}

function extractBalancedJson(text, startPos) {
  if (text[startPos] !== '{' && text[startPos] !== '[') return null;
  const openChar = text[startPos];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar || (openChar === '{' && ch === '[') || (openChar === '[' && ch === '{')) {
      depth++;
    } else if (ch === closeChar || (closeChar === '}' && ch === ']') || (closeChar === ']' && ch === '}')) {
      depth--;
      if (depth === 0) {
        return text.slice(startPos, i + 1);
      }
    }
  }
  return null;
}

function extractJsonCandidates(text) {
  const candidates = [];
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of fenced) {
    const inner = match[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) candidates.push(inner);
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const extracted = extractBalancedJson(trimmed, 0);
    if (extracted) candidates.push(extracted);
  }
  return [...new Set(candidates)];
}

function extractMalformedToolCalls(text) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const extracted = extractBalancedJson(text, i);
    if (!extracted || extracted.length < 10) continue;
    try {
      const parsed = JSON.parse(extracted);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const name = parsed.name || parsed.tool || parsed.tool_name;
        if (name && typeof name === 'string' && !seen.has(name + ':' + extracted)) {
          seen.add(name + ':' + extracted);
          const normalized = normalizeToolCall(parsed, results.length);
          if (normalized) results.push(normalized);
        }
      }
    } catch {}
  }
  return results;
}

function parseXmlToolCalls(text) {
  const results = [];
  const funcNameRegex = /<function=(\w+)>/gi;
  let funcMatch;
  while ((funcMatch = funcNameRegex.exec(text)) !== null) {
    const name = funcMatch[1];
    const afterFunc = text.slice(funcMatch.index + funcMatch[0].length);
    let funcEnd = afterFunc.length;
    const closeFunc = /<\/function>/i.exec(afterFunc);
    const nextFunc = /<function=\w+>/i.exec(afterFunc);
    if (closeFunc) funcEnd = closeFunc.index;
    else if (nextFunc) funcEnd = nextFunc.index;
    const paramsBlock = afterFunc.slice(0, funcEnd);
    const input = {};
    const paramRegex = /<parameter=(\w+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=\w+>)|$)/gi;
    let pm;
    while ((pm = paramRegex.exec(paramsBlock)) !== null) {
      input[pm[1]] = pm[2].trim();
    }
    if (Object.keys(input).length > 0) {
      results.push({ id: `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${results.length}`, name, input });
    }
  }
  if (results.length > 0) return results;

  const toolNameRegex = /<tool>(\w+)<\/tool>/gi;
  let toolMatch;
  while ((toolMatch = toolNameRegex.exec(text)) !== null) {
    const name = toolMatch[1];
    const afterTool = text.slice(toolMatch.index + toolMatch[0].length);
    const argsOpen = /<args>/i.exec(afterTool);
    if (argsOpen) {
      const afterArgsOpen = afterTool.slice(argsOpen.index + argsOpen[0].length);
      const argsClose = /<\/args>/i.exec(afterArgsOpen);
      const argsContent = argsClose ? afterArgsOpen.slice(0, argsClose.index) : afterArgsOpen.trim();
      let input = {};
      try { input = JSON.parse(argsContent); } catch { input = { input: argsContent }; }
      results.push({ id: `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${results.length}`, name, input });
    }
  }
  if (results.length > 0) return results;

  // Handle broken XML from models like minimax: <invoke name="bash"> <command":...
  const brokenInvokeRegex = /<invoke\s+name\s*=\s*["']?(\w+)["']?\s*>/gi;
  let biMatch;
  while ((biMatch = brokenInvokeRegex.exec(text)) !== null) {
    const name = biMatch[1];
    const afterInvoke = text.slice(biMatch.index + biMatch[0].length);
    // Look for <command"> or <command>: or <command> or <command=...> or bare <command" patterns
    const cmdRegex = /<command["':=]?(?:>)?\s*([\s\S]*?)(?:<\/command>|<\/invoke>|$)/gi;
    let cm;
    while ((cm = cmdRegex.exec(afterInvoke)) !== null) {
      let cmdContent = cm[1].trim();
      // Clean up leading junk like ":curl" -> "curl"
      cmdContent = cmdContent.replace(/^[:'"]+/, '').trim();
      // Clean up trailing junk like "]<]" 
      cmdContent = cmdContent.replace(/[\]<>\[\]]+$/, '').trim();
      if (cmdContent.length > 0) {
        results.push({
          id: `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${results.length}`,
          name,
          input: name === 'bash' ? { command: cmdContent } : { input: cmdContent }
        });
      }
    }
  }
  if (results.length > 0) return results;

  // Handle standalone tool_name + content pattern
  const standaloneRegex = /(?:^|\n)\s*(\w[\w_]*)\s*\n((?:<parameter=\w+>[\s\S]*?(?:<\/parameter>|(?=<parameter=\w+>)|$))+)/gi;
  let sm;
  while ((sm = standaloneRegex.exec(text)) !== null) {
    const name = sm[1].trim();
    const paramsBlock = sm[2];
    const input = {};
    const paramRegex2 = /<parameter=(\w+)>([\s\S]*?)(?:<\/parameter>|(?=<parameter=\w+>)|$)/gi;
    let pm2;
    while ((pm2 = paramRegex2.exec(paramsBlock)) !== null) {
      input[pm2[1]] = pm2[2].trim();
    }
    if (Object.keys(input).length > 0) {
      results.push({ id: `${TOOL_CALL_ID_PREFIX}_${Date.now()}_${results.length}`, name, input });
    }
  }
  return results;
}

export function parseToolCallsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      const calls = Array.isArray(parsed)
        ? parsed
        : parsed.tool_calls || parsed.toolCalls || parsed.tools || (parsed.tool || parsed.name ? [parsed] : []);
      const normalized = calls.map((call, index) => normalizeToolCall(call, index)).filter(Boolean);
      if (normalized.length > 0) return normalized;
    } catch {}
  }
  const malformed = extractMalformedToolCalls(text);
  if (malformed.length > 0) return malformed;
  return parseXmlToolCalls(text);
}

export function hasToolCallPatterns(text) {
  if (!text || typeof text !== 'string') return false;
  return /<function=\w+>/i.test(text)
    || /<parameter=\w+>/i.test(text)
    || /"tool_calls"\s*:/i.test(text)
    || /"name"\s*:\s*"[a-z_]+"/i.test(text)
    || /<invoke\s+name\s*=/i.test(text)
    || /<command["'=]?>/i.test(text);
}

export function getTextToolCallPrompt() {
  return `CRITICAL: You MUST use tools by outputting ONLY this JSON format — no other text, no explanation, no markdown:

{"tool_calls":[{"name":"tool_name","input":{"key":"value"}}]}

Rules:
- Output ONLY the JSON object above — nothing else before or after
- Each tool call is a separate object in the "tool_calls" array
- Do NOT nest "tool_calls" inside another "tool_calls"
- Do NOT add commas or text between tool calls
- After receiving tool results, respond normally with text

Example for multiple tools:
{"tool_calls":[{"name":"bash","input":{"command":"ls"}},{"name":"read_file","input":{"path":"/etc/passwd"}}]}

WARNING: If you output anything other than pure JSON, your tool calls will be ignored and you will fail.`;
}

export function getTextToolSchemaPrompt(tools = []) {
  if (!tools.length) return '';
  const schemas = tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.input_schema }));
  return `Text tool-call schemas:\n${JSON.stringify(schemas, null, 2)}`;
}
