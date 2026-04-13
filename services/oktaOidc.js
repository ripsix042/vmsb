const crypto = require('crypto');
const {
  Issuer,
} = require('openid-client');
const {
  OKTA_ISSUER,
  OKTA_REDIRECT_URI,
  OKTA_SCOPES,
  assertOktaEnvPresent,
} = require('../config/okta');

/** @type {Map<string, Promise<import('openid-client').Client>>} */
const configCache = new Map();

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomState() {
  return base64url(crypto.randomBytes(32));
}

function randomNonce() {
  return base64url(crypto.randomBytes(32));
}

function randomPKCECodeVerifier() {
  // RFC 7636 code_verifier allows 43-128 chars from unreserved set.
  return base64url(crypto.randomBytes(64));
}

async function calculatePKCECodeChallenge(codeVerifier) {
  return base64url(crypto.createHash('sha256').update(codeVerifier).digest());
}

function wrapDiscoveryError(err) {
  const status = err?.cause?.status ?? err?.response?.status;
  const tried = err?.cause?.url || '';
  if (status === 403 || status === 401) {
    const hint =
      'OIDC discovery was blocked or denied. Usually OKTA_ISSUER is wrong: it must be the Issuer URI that ends with /oauth2/default (see Okta Admin → Security → API). If the issuer is correct, Cloudflare/WAF may be blocking your server IP—in that case allowlist your API egress IP or ask IT.';
    const e = new Error(`${hint} (HTTP ${status}${tried ? `, tried ${tried}` : ''})`);
    e.statusCode = 502;
    e.cause = err;
    return e;
  }
  const e = new Error(`OIDC discovery failed: ${err.message || String(err)}`);
  e.statusCode = 502;
  e.cause = err;
  return e;
}

async function getOktaConfig(clientId, clientSecret) {
  assertOktaEnvPresent();
  const key = `${OKTA_ISSUER}|${clientId}`;
  if (!configCache.has(key)) {
    const p = Issuer.discover(OKTA_ISSUER)
      .then((issuer) => new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret || undefined,
      }))
      .catch((err) => {
        configCache.delete(key);
        throw wrapDiscoveryError(err);
      });
    configCache.set(key, p);
  }
  return configCache.get(key);
}

async function buildLoginUrl({ state, nonce, codeChallenge, clientId, clientSecret }) {
  const client = await getOktaConfig(clientId, clientSecret);
  const url = client.authorizationUrl({
    redirect_uri: OKTA_REDIRECT_URI,
    scope: OKTA_SCOPES,
    response_type: 'code',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return url.toString();
}

async function exchangeCodeForTokens({
  currentUrl,
  pkceCodeVerifier,
  expectedState,
  expectedNonce,
  clientId,
  clientSecret,
}) {
  const client = await getOktaConfig(clientId, clientSecret);
  const params = currentUrl instanceof URL
    ? Object.fromEntries(currentUrl.searchParams.entries())
    : currentUrl;
  const tokens = await client.callback(
    OKTA_REDIRECT_URI,
    params,
    {
      state: expectedState,
      nonce: expectedNonce,
      code_verifier: pkceCodeVerifier,
    }
  );
  return tokens;
}

async function getUserInfo(tokens, clientId, clientSecret) {
  const client = await getOktaConfig(clientId, clientSecret);
  if (!tokens?.access_token) return null;
  return client.userinfo(tokens.access_token);
}

module.exports = {
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomNonce,
  randomState,
  buildLoginUrl,
  exchangeCodeForTokens,
  getUserInfo,
};
