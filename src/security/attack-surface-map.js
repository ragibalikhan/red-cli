/**
 * Attack Surface Mapper
 * Builds a target graph: endpoints, parameters, auth flows, entry points.
 * AI uses this to plan attack paths.
 */

/**
 * Extract endpoints, params, and forms from HTML.
 */
function extractFromHtml(html, baseUrl) {
  const endpoints = new Set();
  const params = new Set();
  const forms = [];

  // Links
  const linkRegex = /href=["']([^"'#]+)/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl).href;
      if (resolved.startsWith(new URL(baseUrl).origin)) endpoints.add(resolved);
    } catch {}
  }

  // Form actions
  const formRegex = /<form[^>]*action=["']([^"']*)["'][^>]*method=["']?(\w+)/gi;
  while ((match = formRegex.exec(html)) !== null) {
    const action = match[1] ? new URL(match[1], baseUrl).href : baseUrl;
    forms.push({ action, method: (match[2] || 'GET').toUpperCase() });
  }

  // Input fields (parameters)
  const inputRegex = /<input[^>]*name=["']([^"']+)/gi;
  while ((match = inputRegex.exec(html)) !== null) {
    params.add(match[1]);
  }

  // URL parameters from discovered endpoints
  for (const ep of endpoints) {
    try {
      const u = new URL(ep);
      for (const [key] of u.searchParams) params.add(key);
    } catch {}
  }

  // JS API endpoints
  const apiRegex = /["'](\/api\/[^"']+|\/v[0-9]+\/[^"']+)/g;
  while ((match = apiRegex.exec(html)) !== null) {
    try {
      endpoints.add(new URL(match[1], baseUrl).href);
    } catch {}
  }

  return { endpoints: [...endpoints], params: [...params], forms };
}

/**
 * Detect authentication mechanisms.
 */
function detectAuth(html, headers) {
  const auth = { type: 'none', indicators: [] };

  if (html.includes('login') || html.includes('signin') || html.includes('password')) {
    auth.indicators.push('login_form_detected');
  }
  if (html.includes('csrf') || html.includes('_token') || html.includes('authenticity_token')) {
    auth.indicators.push('csrf_token_present');
  }
  if (headers['set-cookie']?.includes('session') || headers['set-cookie']?.includes('token')) {
    auth.type = 'session_cookie';
    auth.indicators.push('session_cookie');
  }
  if (headers['www-authenticate']) {
    auth.type = 'http_auth';
    auth.indicators.push(`www-authenticate: ${headers['www-authenticate']}`);
  }
  if (html.includes('Bearer') || html.includes('jwt') || html.includes('access_token')) {
    auth.type = 'jwt_bearer';
    auth.indicators.push('jwt_token_reference');
  }
  if (html.includes('oauth') || html.includes('authorize') || html.includes('client_id')) {
    auth.type = 'oauth';
    auth.indicators.push('oauth_flow_detected');
  }

  return auth;
}

/**
 * Map the attack surface of a target.
 * @param {string} url - Target URL
 * @param {object} opts - { depth?: number }
 * @returns {Promise<object>} Attack surface graph
 */
export async function mapAttackSurface(url, opts = {}) {
  const depth = opts.depth || 1;
  const visited = new Set();
  const allEndpoints = new Set();
  const allParams = new Set();
  const allForms = [];
  let auth = { type: 'none', indicators: [] };
  const technologies = [];

  async function crawl(targetUrl, currentDepth) {
    if (currentDepth > depth || visited.has(targetUrl)) return;
    visited.add(targetUrl);

    try {
      const response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'RedCLI-Mapper/1.0' },
        redirect: 'follow'
      });
      const html = await response.text();
      const headers = {};
      response.headers.forEach((v, k) => { headers[k] = v; });

      // Extract surface
      const { endpoints, params, forms } = extractFromHtml(html, targetUrl);
      endpoints.forEach(e => allEndpoints.add(e));
      params.forEach(p => allParams.add(p));
      allForms.push(...forms);

      // Detect auth on first page
      if (currentDepth === 0) {
        auth = detectAuth(html, headers);
      }

      // Tech detection
      if (headers['x-powered-by']) technologies.push(headers['x-powered-by']);
      if (headers['server']) technologies.push(headers['server']);

      // Crawl discovered endpoints (next depth)
      if (currentDepth < depth) {
        for (const ep of endpoints.slice(0, 20)) {
          await crawl(ep, currentDepth + 1);
        }
      }
    } catch {}
  }

  await crawl(url, 0);

  // Build attack surface summary
  const entryPoints = [];
  for (const ep of allEndpoints) {
    const u = new URL(ep);
    const epParams = [...u.searchParams.keys()];
    if (epParams.length > 0) {
      entryPoints.push({ url: ep, params: epParams, method: 'GET' });
    }
  }
  for (const form of allForms) {
    entryPoints.push({ url: form.action, method: form.method, type: 'form' });
  }

  return {
    target: url,
    endpoints: [...allEndpoints].length,
    parameters: [...allParams],
    paramCount: allParams.size,
    forms: allForms.length,
    entryPoints: entryPoints.slice(0, 30),
    auth,
    technologies: [...new Set(technologies)],
    crawledPages: visited.size,
    summary: `Target: ${url}\nEndpoints: ${allEndpoints.size} | Params: ${allParams.size} | Forms: ${allForms.length}\nAuth: ${auth.type} | Tech: ${technologies.join(', ') || 'unknown'}\nEntry points for testing: ${entryPoints.length}`
  };
}

export default { mapAttackSurface };
