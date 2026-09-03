import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDcrRequestBody, registerClient } from '../dcr.js';

describe('buildDcrRequestBody', () => {
  it('shapes an RFC 7591 public-client registration request', () => {
    const body = buildDcrRequestBody({ redirectUri: 'http://127.0.0.1:54321/callback' });
    expect(body).toEqual({
      client_name: 'hudu-mcp',
      redirect_uris: ['http://127.0.0.1:54321/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  it('omits any client_secret / auth method other than "none" — this must stay a public client', () => {
    const body = buildDcrRequestBody({ redirectUri: 'http://127.0.0.1:1/callback' }) as Record<string, unknown>;
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body).not.toHaveProperty('client_secret');
  });

  it('honors a custom clientName', () => {
    const body = buildDcrRequestBody({ redirectUri: 'http://127.0.0.1:1/callback', clientName: 'custom-name' });
    expect(body.client_name).toBe('custom-name');
  });
});

describe('registerClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the DCR body as JSON and returns the issued client_id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ client_id: 'client-abc123', client_id_issued_at: 12345 }),
    });

    const result = await registerClient({
      registrationEndpoint: 'https://hudu.example.test/api/oauth/register',
      redirectUri: 'http://127.0.0.1:5555/callback',
    });

    expect(result.clientId).toBe('client-abc123');
    expect(result.clientSecret).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://hudu.example.test/api/oauth/register');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.redirect_uris).toEqual(['http://127.0.0.1:5555/callback']);
    expect(sentBody.token_endpoint_auth_method).toBe('none');
  });

  it('throws when the registration endpoint responds with a non-2xx status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid_client_metadata',
    });

    await expect(
      registerClient({ registrationEndpoint: 'https://hudu.example.test/api/oauth/register', redirectUri: 'http://127.0.0.1:1/callback' }),
    ).rejects.toThrow(/Dynamic client registration failed/);
  });

  it('throws when the response is missing client_id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      registerClient({ registrationEndpoint: 'https://hudu.example.test/api/oauth/register', redirectUri: 'http://127.0.0.1:1/callback' }),
    ).rejects.toThrow(/missing a client_id/);
  });
});
