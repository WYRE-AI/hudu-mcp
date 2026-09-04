/**
 * Token endpoint requests (RFC 6749) for a public client (no client_secret):
 * exchanging an authorization code (with the PKCE code_verifier) and
 * refreshing via a refresh_token.
 */

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  /** Seconds until expiry, per RFC 6749 §5.1. */
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function postToken(tokenEndpoint: string, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token request to ${tokenEndpoint} failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }

  const json = (await res.json()) as TokenResponse;
  if (typeof json.access_token !== 'string' || json.access_token.length === 0) {
    throw new Error('Token response is missing an access_token');
  }
  return json;
}

export function exchangeAuthorizationCode(opts: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
}): Promise<TokenResponse> {
  return postToken(opts.tokenEndpoint, {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
  });
}

export function refreshAccessToken(opts: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
}): Promise<TokenResponse> {
  return postToken(opts.tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
}

/** `expires_in` (seconds, relative) -> `expiresAt` (epoch ms, absolute), defaulting to 1 hour if omitted. */
export function computeExpiresAt(tokenResponse: TokenResponse, now: number = Date.now()): number {
  const expiresInSeconds = tokenResponse.expires_in ?? 3600;
  return now + expiresInSeconds * 1000;
}
