/**
 * A `fetch` wrapper that attaches a live Hudu OAuth bearer token to every
 * request and, on a 401 response, force-refreshes once and retries — this
 * covers the case where the remote token turns out to be invalid despite
 * our own expiry tracking (revocation, clock skew, etc.).
 *
 * Matches the SDK's `FetchLike` shape so it can be handed directly to
 * `StreamableHTTPClientTransport({ fetch })`.
 */
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Logger } from '../utils/logger.js';
import { ensureAccessToken } from './manager.js';

function withAuthorization(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export function createAuthenticatedFetch(baseUrl: string, logger: Logger): FetchLike {
  return async (input, init) => {
    const token = await ensureAccessToken(baseUrl, logger);
    const response = await fetch(input, withAuthorization(init, token));

    if (response.status !== 401) {
      return response;
    }

    logger.warn('Hudu MCP proxy request was unauthorized; refreshing OAuth token and retrying once', { baseUrl });
    const refreshedToken = await ensureAccessToken(baseUrl, logger, { forceRefresh: true });
    return fetch(input, withAuthorization(init, refreshedToken));
  };
}
