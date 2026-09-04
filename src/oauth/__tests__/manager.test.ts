/**
 * `ensureAccessToken` orchestration: cached-valid fast path, refresh path,
 * fallback-to-full-authorization on refresh failure, and DCR client_id
 * caching (DCR only runs once per Hudu instance).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const discoverOAuthConfigMock = vi.hoisted(() => vi.fn());
const registerClientMock = vi.hoisted(() => vi.fn());
const startCallbackServerMock = vi.hoisted(() => vi.fn());
const exchangeAuthorizationCodeMock = vi.hoisted(() => vi.fn());
const refreshAccessTokenMock = vi.hoisted(() => vi.fn());
const loadCredentialsMock = vi.hoisted(() => vi.fn());
const saveCredentialsMock = vi.hoisted(() => vi.fn());
const isExpiredMock = vi.hoisted(() => vi.fn());

vi.mock('../discovery.js', () => ({ discoverOAuthConfig: discoverOAuthConfigMock }));
vi.mock('../dcr.js', () => ({ registerClient: registerClientMock }));
vi.mock('../callback-server.js', () => ({ startCallbackServer: startCallbackServerMock }));
vi.mock('../token-exchange.js', () => ({
  exchangeAuthorizationCode: exchangeAuthorizationCodeMock,
  refreshAccessToken: refreshAccessTokenMock,
  computeExpiresAt: (tokenResponse: { expires_in?: number }) => 1_000_000 + (tokenResponse.expires_in ?? 3600) * 1000,
}));
vi.mock('../token-store.js', async () => {
  const actual = await vi.importActual<typeof import('../token-store.js')>('../token-store.js');
  return {
    ...actual,
    loadCredentials: loadCredentialsMock,
    saveCredentials: saveCredentialsMock,
    isExpired: isExpiredMock,
  };
});

import { Logger } from '../../utils/logger.js';
import { ensureAccessToken } from '../manager.js';

const DISCOVERY = {
  mcpUrl: 'https://docs.example.com/mcp',
  protectedResource: { resource: 'https://docs.example.com/mcp', authorization_servers: ['https://docs.example.com'], scopes_supported: ['read', 'write'] },
  authorizationServer: {
    issuer: 'https://docs.example.com',
    authorization_endpoint: 'https://docs.example.com/oauth/authorize',
    token_endpoint: 'https://docs.example.com/oauth/token',
    registration_endpoint: 'https://docs.example.com/api/oauth/register',
  },
};

describe('ensureAccessToken', () => {
  const logger = new Logger('error');

  beforeEach(() => {
    discoverOAuthConfigMock.mockReset().mockResolvedValue(DISCOVERY);
    registerClientMock.mockReset();
    startCallbackServerMock.mockReset();
    exchangeAuthorizationCodeMock.mockReset();
    refreshAccessTokenMock.mockReset();
    loadCredentialsMock.mockReset();
    saveCredentialsMock.mockReset();
    isExpiredMock.mockReset();
  });

  it('returns the stored access token without any network call when it is not expired', async () => {
    loadCredentialsMock.mockReturnValue({
      baseUrl: 'https://docs.example.com',
      clientId: 'client-1',
      accessToken: 'cached-token',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
    });
    isExpiredMock.mockReturnValue(false);

    const token = await ensureAccessToken('https://docs.example.com', logger);

    expect(token).toBe('cached-token');
    expect(discoverOAuthConfigMock).not.toHaveBeenCalled();
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it('refreshes via the refresh_token grant when the stored token is expired', async () => {
    loadCredentialsMock.mockReturnValue({
      baseUrl: 'https://docs.example.com',
      clientId: 'client-1',
      accessToken: 'old-token',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1,
    });
    isExpiredMock.mockReturnValue(true);
    refreshAccessTokenMock.mockResolvedValue({ access_token: 'refreshed-token', refresh_token: 'rt-2', expires_in: 3600 });

    const token = await ensureAccessToken('https://docs.example.com', logger);

    expect(token).toBe('refreshed-token');
    expect(refreshAccessTokenMock).toHaveBeenCalledWith({
      tokenEndpoint: 'https://docs.example.com/oauth/token',
      refreshToken: 'rt-1',
      clientId: 'client-1',
    });
    expect(saveCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'refreshed-token', refreshToken: 'rt-2', clientId: 'client-1' }),
    );
    // Refresh path never re-registers a client.
    expect(registerClientMock).not.toHaveBeenCalled();
  });

  it('forceRefresh triggers a refresh even when the stored token looks unexpired', async () => {
    loadCredentialsMock.mockReturnValue({
      baseUrl: 'https://docs.example.com',
      clientId: 'client-1',
      accessToken: 'old-token',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 3600_000,
    });
    isExpiredMock.mockReturnValue(false);
    refreshAccessTokenMock.mockResolvedValue({ access_token: 'forced-refresh-token', expires_in: 3600 });

    const token = await ensureAccessToken('https://docs.example.com', logger, { forceRefresh: true });

    expect(token).toBe('forced-refresh-token');
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the full browser authorization flow when refresh fails, reusing the cached client_id (no DCR)', async () => {
    loadCredentialsMock.mockReturnValue({
      baseUrl: 'https://docs.example.com',
      clientId: 'cached-client-id',
      accessToken: 'old-token',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1,
    });
    isExpiredMock.mockReturnValue(true);
    refreshAccessTokenMock.mockRejectedValue(new Error('refresh_token expired'));

    const close = vi.fn().mockResolvedValue(undefined);
    startCallbackServerMock.mockResolvedValue({
      redirectUri: 'http://127.0.0.1:5555/callback',
      waitForCallback: vi.fn().mockResolvedValue({ code: 'auth-code-1', state: 'whatever' }),
      close,
    });
    exchangeAuthorizationCodeMock.mockResolvedValue({ access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 3600 });

    const token = await ensureAccessToken('https://docs.example.com', logger);

    expect(token).toBe('new-access-token');
    expect(registerClientMock).not.toHaveBeenCalled();
    expect(exchangeAuthorizationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth-code-1', clientId: 'cached-client-id', redirectUri: 'http://127.0.0.1:5555/callback' }),
    );
    expect(saveCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'cached-client-id', accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('runs Dynamic Client Registration when no client_id is cached at all (first-ever run for this instance)', async () => {
    loadCredentialsMock.mockReturnValue(undefined);

    const close = vi.fn().mockResolvedValue(undefined);
    startCallbackServerMock.mockResolvedValue({
      redirectUri: 'http://127.0.0.1:6666/callback',
      waitForCallback: vi.fn().mockResolvedValue({ code: 'auth-code-2', state: 'whatever' }),
      close,
    });
    registerClientMock.mockResolvedValue({ clientId: 'freshly-registered-client', raw: {} });
    exchangeAuthorizationCodeMock.mockResolvedValue({ access_token: 'brand-new-token', expires_in: 3600 });

    const token = await ensureAccessToken('https://docs.example.com', logger);

    expect(token).toBe('brand-new-token');
    expect(registerClientMock).toHaveBeenCalledWith({
      registrationEndpoint: 'https://docs.example.com/api/oauth/register',
      redirectUri: 'http://127.0.0.1:6666/callback',
      clientName: 'hudu-mcp',
    });
    expect(exchangeAuthorizationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'freshly-registered-client' }),
    );
  });

  it('closes the callback server even if token exchange throws', async () => {
    loadCredentialsMock.mockReturnValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    startCallbackServerMock.mockResolvedValue({
      redirectUri: 'http://127.0.0.1:7777/callback',
      waitForCallback: vi.fn().mockResolvedValue({ code: 'auth-code-3', state: 'whatever' }),
      close,
    });
    registerClientMock.mockResolvedValue({ clientId: 'client-x', raw: {} });
    exchangeAuthorizationCodeMock.mockRejectedValue(new Error('boom'));

    await expect(ensureAccessToken('https://docs.example.com', logger)).rejects.toThrow('boom');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
