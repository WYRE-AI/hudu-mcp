/**
 * Orchestrates the OAuth flow end to end: discovery -> DCR (cached) -> PKCE
 * authorization -> local callback -> token exchange -> persistence, plus
 * transparent refresh on subsequent calls.
 *
 * `ensureAccessToken` is the only entry point the rest of the server needs:
 * it returns a currently-valid access token, running whatever combination
 * of "load from disk" / "refresh" / "full browser authorization" is needed
 * to get there.
 */
import { Logger } from '../utils/logger.js';
import { discoverOAuthConfig } from './discovery.js';
import { registerClient } from './dcr.js';
import { generatePkcePair, generateState } from './pkce.js';
import { startCallbackServer } from './callback-server.js';
import { exchangeAuthorizationCode, refreshAccessToken, computeExpiresAt } from './token-exchange.js';
import { loadCredentials, saveCredentials, isExpired, normalizeBaseUrl, StoredCredentials } from './token-store.js';

export interface EnsureAccessTokenOptions {
  /** Force a refresh (or full re-authorization) even if the stored token looks unexpired. */
  forceRefresh?: boolean;
}

const DEFAULT_SCOPE = 'read write';

export async function ensureAccessToken(
  baseUrl: string,
  logger: Logger,
  options: EnsureAccessTokenOptions = {},
): Promise<string> {
  const normalized = normalizeBaseUrl(baseUrl);
  const stored = loadCredentials(normalized);

  if (stored && !options.forceRefresh && !isExpired(stored)) {
    return stored.accessToken;
  }

  if (stored?.refreshToken) {
    try {
      return await refreshAndPersist(normalized, stored, logger);
    } catch (error) {
      logger.warn('OAuth token refresh failed; falling back to interactive re-authorization', {
        baseUrl: normalized,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return runAuthorizationFlow(normalized, logger, stored?.clientId);
}

async function refreshAndPersist(baseUrl: string, stored: StoredCredentials, logger: Logger): Promise<string> {
  logger.info('Refreshing Hudu OAuth access token', { baseUrl });
  const { authorizationServer } = await discoverOAuthConfig(baseUrl);
  const tokenResponse = await refreshAccessToken({
    tokenEndpoint: authorizationServer.token_endpoint,
    refreshToken: stored.refreshToken!,
    clientId: stored.clientId,
  });

  const updated: StoredCredentials = {
    baseUrl,
    clientId: stored.clientId,
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? stored.refreshToken,
    expiresAt: computeExpiresAt(tokenResponse),
    scope: tokenResponse.scope ?? stored.scope,
  };
  saveCredentials(updated);
  return updated.accessToken;
}

/**
 * Runs the full interactive flow: discovers metadata, registers a DCR client
 * (reusing `cachedClientId` when one is already known for this instance so
 * DCR only ever happens once per Hudu instance), prints the authorization
 * URL to stderr, waits for the local callback, and exchanges the code.
 */
async function runAuthorizationFlow(baseUrl: string, logger: Logger, cachedClientId?: string): Promise<string> {
  const { authorizationServer, protectedResource } = await discoverOAuthConfig(baseUrl);
  const state = generateState();
  const pending = await startCallbackServer(state);

  try {
    const clientId =
      cachedClientId ??
      (
        await registerClient({
          registrationEndpoint: requireRegistrationEndpoint(authorizationServer),
          redirectUri: pending.redirectUri,
          clientName: 'hudu-mcp',
        })
      ).clientId;

    const pkce = generatePkcePair();
    const scope = (protectedResource.scopes_supported ?? DEFAULT_SCOPE.split(' ')).join(' ') || DEFAULT_SCOPE;

    const authorizationUrl = new URL(authorizationServer.authorization_endpoint);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', pending.redirectUri);
    authorizationUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
    authorizationUrl.searchParams.set('scope', scope);
    authorizationUrl.searchParams.set('state', state);

    logger.warn(
      `Hudu MCP requires authorization. Open this URL in a browser to continue:\n\n  ${authorizationUrl.toString()}\n`,
    );

    const { code } = await pending.waitForCallback();

    const tokenResponse = await exchangeAuthorizationCode({
      tokenEndpoint: authorizationServer.token_endpoint,
      code,
      redirectUri: pending.redirectUri,
      codeVerifier: pkce.codeVerifier,
      clientId,
    });

    const creds: StoredCredentials = {
      baseUrl,
      clientId,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: computeExpiresAt(tokenResponse),
      scope: tokenResponse.scope ?? scope,
    };
    saveCredentials(creds);
    logger.info('Hudu OAuth authorization complete', { baseUrl });
    return creds.accessToken;
  } finally {
    await pending.close();
  }
}

function requireRegistrationEndpoint(
  authorizationServer: Awaited<ReturnType<typeof discoverOAuthConfig>>['authorizationServer'],
): string {
  if (!authorizationServer.registration_endpoint) {
    throw new Error(
      'Hudu authorization server metadata has no registration_endpoint and no cached client_id is available; cannot register an OAuth client',
    );
  }
  return authorizationServer.registration_endpoint;
}
