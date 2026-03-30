const {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  randomNonce,
  randomState,
  fetchUserInfo,
} = require('openid-client');
const {
  OKTA_ISSUER,
  OKTA_REDIRECT_URI,
  OKTA_SCOPES,
  assertOktaEnvPresent,
} = require('../config/okta');

/** @type {Map<string, Promise<unknown>>} */
const configCache = new Map();

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
    const p = discovery(new URL(OKTA_ISSUER), clientId, clientSecret || undefined).catch((err) => {
      configCache.delete(key);
      throw wrapDiscoveryError(err);
    });
    configCache.set(key, p);
  }
  return configCache.get(key);
}

async function buildLoginUrl({ state, nonce, codeChallenge, clientId, clientSecret }) {
  const config = await getOktaConfig(clientId, clientSecret);
  const url = buildAuthorizationUrl(config, {
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
  const config = await getOktaConfig(clientId, clientSecret);
  const tokens = await authorizationCodeGrant(
    config,
    currentUrl,
    { pkceCodeVerifier, expectedState, expectedNonce }
  );
  return tokens;
}

async function getUserInfo(tokens, clientId, clientSecret) {
  const config = await getOktaConfig(clientId, clientSecret);
  if (!tokens?.access_token) return null;
  const claims = typeof tokens?.claims === 'function' ? tokens.claims() : null;
  const expectedSubject = claims && typeof claims.sub === 'string' ? claims.sub : null;
  if (!expectedSubject) return null;
  return fetchUserInfo(config, tokens.access_token, expectedSubject);
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
