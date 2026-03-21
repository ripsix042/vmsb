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
  OKTA_CLIENT_ID,
  OKTA_CLIENT_SECRET,
  OKTA_REDIRECT_URI,
  OKTA_SCOPES,
} = require('../config/okta');

let cachedConfigPromise = null;

function assertOktaConfigured() {
  const missing = [];
  if (!OKTA_ISSUER) missing.push('OKTA_ISSUER');
  if (!OKTA_CLIENT_ID) missing.push('OKTA_CLIENT_ID');
  if (!OKTA_REDIRECT_URI) missing.push('OKTA_REDIRECT_URI');
  if (missing.length) {
    const msg = `Okta is not configured. Missing: ${missing.join(', ')}`;
    const err = new Error(msg);
    err.statusCode = 500;
    throw err;
  }
}

async function getOktaConfig() {
  assertOktaConfigured();
  if (!cachedConfigPromise) {
    cachedConfigPromise = discovery(
      new URL(OKTA_ISSUER),
      OKTA_CLIENT_ID,
      OKTA_CLIENT_SECRET
    );
  }
  return cachedConfigPromise;
}

async function buildLoginUrl({ state, nonce, codeChallenge }) {
  const config = await getOktaConfig();
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

async function exchangeCodeForTokens({ currentUrl, pkceCodeVerifier, expectedState, expectedNonce }) {
  const config = await getOktaConfig();
  const tokens = await authorizationCodeGrant(
    config,
    currentUrl,
    { pkceCodeVerifier, expectedState, expectedNonce }
  );
  return tokens;
}

async function getUserInfo(tokens) {
  const config = await getOktaConfig();
  if (!tokens?.access_token) return null;
  return fetchUserInfo(config, tokens.access_token);
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

