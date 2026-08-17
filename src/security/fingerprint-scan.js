/**
 * Tech Stack Fingerprint Scanner
 * Identifies technologies and recommends which vulnerability probes to prioritize.
 * The AI uses this to make smart decisions about what to test.
 */

// Tech stack → recommended probes mapping
const STACK_PROBES = {
  'PHP': ['sqli', 'lfi', 'rfi', 'cmdi', 'ssti', 'file_upload', 'xxe'],
  'Java': ['sqli', 'ssti', 'xxe', 'log4shell', 'java_deserialization', 'path_traversal'],
  'Spring': ['sqli', 'ssti', 'log4shell', 'mass_assignment', 'path_traversal'],
  'ASP.NET': ['sqli', 'viewstate', 'path_traversal', 'xxe', 'mass_assignment'],
  'Node.js': ['nosqli', 'ssti', 'prototype_pollution', 'ssrf', 'cmdi'],
  'Express': ['nosqli', 'prototype_pollution', 'ssrf', 'path_traversal'],
  'Python': ['ssti', 'cmdi', 'sqli', 'ssrf', 'path_traversal'],
  'Django': ['ssti', 'sqli', 'csrf', 'idor', 'mass_assignment'],
  'Flask': ['ssti', 'sqli', 'ssrf', 'cmdi', 'path_traversal'],
  'Ruby': ['ssti', 'cmdi', 'sqli', 'mass_assignment', 'path_traversal'],
  'Rails': ['sqli', 'mass_assignment', 'csrf', 'idor', 'ssti'],
  'WordPress': ['sqli', 'xss', 'lfi', 'file_upload', 'auth_bypass'],
  'Nginx': ['path_traversal', 'ssrf', 'host_header'],
  'Apache': ['path_traversal', 'lfi', 'cmdi', 'host_header'],
  'GraphQL': ['graphql_introspection', 'idor', 'sqli', 'nosqli'],
  'MongoDB': ['nosqli', 'ssrf', 'idor'],
  'MySQL': ['sqli', 'blind_sqli'],
  'PostgreSQL': ['sqli', 'blind_sqli', 'cmdi'],
  'Redis': ['ssrf', 'cmdi'],
  'AWS': ['ssrf', 'cloud_metadata', 'idor'],
  'Docker': ['ssrf', 'cmdi', 'path_traversal'],
  'Kubernetes': ['ssrf', 'cloud_metadata', 'auth_bypass'],
};

/**
 * Fingerprint a target and recommend probes.
 * @param {object} opts - { url, headers, body, server, poweredBy, cookies }
 * @returns {{ technologies: string[], recommendedProbes: string[], priority: string, reasoning: string }}
 */
export function fingerprintAndPrioritize({ url = '', headers = {}, body = '', server = '', poweredBy = '' }) {
  const technologies = [];
  const lowerBody = body.toLowerCase();
  const lowerHeaders = JSON.stringify(headers).toLowerCase();

  // Extract from headers if not passed separately
  if (!server) server = headers['server'] || headers['Server'] || '';
  if (!poweredBy) poweredBy = headers['x-powered-by'] || headers['X-Powered-By'] || '';

  // Server header
  if (server.includes('nginx')) technologies.push('Nginx');
  if (server.includes('apache')) technologies.push('Apache');
  if (server.includes('iis') || server.includes('microsoft')) technologies.push('ASP.NET');

  // X-Powered-By
  if (poweredBy.includes('PHP')) technologies.push('PHP');
  if (poweredBy.includes('Express')) technologies.push('Express', 'Node.js');
  if (poweredBy.includes('ASP.NET')) technologies.push('ASP.NET');
  if (poweredBy.includes('Servlet') || poweredBy.includes('JSP')) technologies.push('Java');

  // Body patterns
  if (lowerBody.includes('wp-content') || lowerBody.includes('wordpress')) technologies.push('WordPress');
  if (lowerBody.includes('django') || lowerBody.includes('csrfmiddlewaretoken')) technologies.push('Django', 'Python');
  if (lowerBody.includes('__viewstate')) technologies.push('ASP.NET');
  if (lowerBody.includes('spring') || lowerBody.includes('whitelabel error')) technologies.push('Spring', 'Java');
  if (lowerBody.includes('laravel') || lowerBody.includes('xsrf-token')) technologies.push('PHP');
  if (lowerBody.includes('rails') || lowerBody.includes('authenticity_token')) technologies.push('Rails', 'Ruby');
  if (lowerBody.includes('flask') || lowerBody.includes('werkzeug')) technologies.push('Flask', 'Python');
  if (lowerBody.includes('next.js') || lowerBody.includes('__next')) technologies.push('Node.js');
  if (lowerBody.includes('graphql') || lowerBody.includes('__schema')) technologies.push('GraphQL');

  // Header patterns
  if (lowerHeaders.includes('x-amzn') || lowerHeaders.includes('aws')) technologies.push('AWS');
  if (lowerHeaders.includes('x-kubernetes') || lowerHeaders.includes('k8s')) technologies.push('Kubernetes');

  // Cookie patterns
  const cookieStr = (headers['set-cookie'] || headers['cookie'] || '').toLowerCase();
  if (cookieStr.includes('phpsessid')) technologies.push('PHP');
  if (cookieStr.includes('jsessionid')) technologies.push('Java');
  if (cookieStr.includes('connect.sid')) technologies.push('Node.js', 'Express');
  if (cookieStr.includes('asp.net')) technologies.push('ASP.NET');

  // Deduplicate
  const uniqueTech = [...new Set(technologies)];

  // Collect recommended probes based on detected tech
  const probeSet = new Set();
  for (const tech of uniqueTech) {
    const probes = STACK_PROBES[tech] || [];
    probes.forEach(p => probeSet.add(p));
  }

  // Always include universal probes
  ['xss', 'csrf', 'cors', 'open_redirect', 'host_header', 'jwt'].forEach(p => probeSet.add(p));

  const recommendedProbes = [...probeSet];

  // Priority reasoning
  let priority = 'medium';
  let reasoning = '';
  if (uniqueTech.includes('PHP') || uniqueTech.includes('WordPress')) {
    priority = 'high';
    reasoning = 'PHP/WordPress targets have high vulnerability density — prioritize SQLi, LFI, file upload';
  } else if (uniqueTech.includes('Java') || uniqueTech.includes('Spring')) {
    priority = 'high';
    reasoning = 'Java targets are susceptible to Log4Shell, XXE, deserialization — test these first';
  } else if (uniqueTech.includes('Node.js')) {
    priority = 'medium';
    reasoning = 'Node.js targets: focus on prototype pollution, NoSQLi, SSRF';
  } else if (uniqueTech.length === 0) {
    reasoning = 'No tech stack identified — run broad probe set';
  } else {
    reasoning = `Detected: ${uniqueTech.join(', ')} — tailored probe set generated`;
  }

  return {
    technologies: uniqueTech,
    recommendedProbes,
    probeCount: recommendedProbes.length,
    priority,
    reasoning
  };
}

export default { fingerprintAndPrioritize };
