import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exchangeAuthorizationCode, refreshAccessToken, computeExpiresAt } from '../token-exchange.js';

describe('token-exchange', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('exchangeAuthorizationCode POSTs a form-encoded authorization_code grant with the PKCE verifier, no client_secret', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
    });

    const result = await exchangeAuthorizationCode({
      tokenEndpoint: 'https://docs.example.com/oauth/token',
      code: 'auth-code-1',
      redirectUri: 'http://127.0.0.1:1234/callback',
      codeVerifier: 'verifier-abc',
      clientId: 'client-1',
    });

    expect(result.access_token).toBe('at');
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://docs.example.com/oauth/token');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(init.body as string);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('auth-code-1');
    expect(params.get('redirect_uri')).toBe('http://127.0.0.1:1234/callback');
    expect(params.get('code_verifier')).toBe('verifier-abc');
    expect(params.get('client_id')).toBe('client-1');
    expect(params.has('client_secret')).toBe(false);
  });

  it('refreshAccessToken POSTs a refresh_token grant', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', expires_in: 1800 }),
    });

    await refreshAccessToken({
      tokenEndpoint: 'https://docs.example.com/oauth/token',
      refreshToken: 'refresh-token-1',
      clientId: 'client-1',
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = new URLSearchParams(init.body as string);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('refresh-token-1');
    expect(params.get('client_id')).toBe('client-1');
  });

  it('throws when the token endpoint returns a non-2xx status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid_grant',
    });

    await expect(
      refreshAccessToken({ tokenEndpoint: 'https://docs.example.com/oauth/token', refreshToken: 'bad', clientId: 'c' }),
    ).rejects.toThrow(/Token request .* failed: 400/);
  });

  it('throws when the response body is missing access_token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    await expect(
      refreshAccessToken({ tokenEndpoint: 'https://docs.example.com/oauth/token', refreshToken: 'x', clientId: 'c' }),
    ).rejects.toThrow(/missing an access_token/);
  });
});

describe('computeExpiresAt', () => {
  it('adds expires_in seconds to now', () => {
    const now = 1_000_000;
    expect(computeExpiresAt({ access_token: 'a', expires_in: 3600 }, now)).toBe(now + 3600_000);
  });

  it('defaults to 1 hour when expires_in is omitted', () => {
    const now = 1_000_000;
    expect(computeExpiresAt({ access_token: 'a' }, now)).toBe(now + 3600_000);
  });
});
