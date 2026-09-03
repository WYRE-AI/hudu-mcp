import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildWellKnownUrl, discoverOAuthConfig, huduMcpUrl } from '../discovery.js';

describe('buildWellKnownUrl', () => {
  it('builds the well-known URL by inserting the segment before the path, per RFC 8414/9728', () => {
    expect(buildWellKnownUrl('https://docs.example.com/mcp', 'oauth-protected-resource')).toBe(
      'https://docs.example.com/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('drops a bare "/" path so the well-known URL has no trailing segment', () => {
    expect(buildWellKnownUrl('https://docs.example.com', 'oauth-authorization-server')).toBe(
      'https://docs.example.com/.well-known/oauth-authorization-server',
    );
    expect(buildWellKnownUrl('https://docs.example.com/', 'oauth-authorization-server')).toBe(
      'https://docs.example.com/.well-known/oauth-authorization-server',
    );
  });
});

describe('huduMcpUrl', () => {
  it('appends /mcp, stripping a trailing slash on the base URL', () => {
    expect(huduMcpUrl('https://docs.example.com')).toBe('https://docs.example.com/mcp');
    expect(huduMcpUrl('https://docs.example.com/')).toBe('https://docs.example.com/mcp');
  });
});

describe('discoverOAuthConfig', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches protected-resource metadata for {baseUrl}/mcp, then authorization-server metadata for the named issuer', async () => {
    const protectedResource = {
      resource: 'https://docs.example.com/mcp',
      authorization_servers: ['https://docs.example.com'],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
    };
    const authorizationServer = {
      issuer: 'https://docs.example.com',
      authorization_endpoint: 'https://docs.example.com/oauth/authorize',
      token_endpoint: 'https://docs.example.com/oauth/token',
      registration_endpoint: 'https://docs.example.com/api/oauth/register',
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
    };

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === 'https://docs.example.com/.well-known/oauth-protected-resource/mcp') {
        return { ok: true, json: async () => protectedResource };
      }
      if (url === 'https://docs.example.com/.well-known/oauth-authorization-server') {
        return { ok: true, json: async () => authorizationServer };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const result = await discoverOAuthConfig('https://docs.example.com');

    expect(result.mcpUrl).toBe('https://docs.example.com/mcp');
    expect(result.protectedResource).toEqual(protectedResource);
    expect(result.authorizationServer).toEqual(authorizationServer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to baseUrl as the authorization server when authorization_servers is empty', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('oauth-protected-resource')) {
        return { ok: true, json: async () => ({ resource: 'https://docs.example.com/mcp', authorization_servers: [] }) };
      }
      return { ok: true, json: async () => ({ issuer: 'https://docs.example.com', authorization_endpoint: 'x', token_endpoint: 'y' }) };
    });

    await discoverOAuthConfig('https://docs.example.com');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://docs.example.com/.well-known/oauth-authorization-server', expect.anything());
  });

  it('throws a descriptive error when a well-known fetch fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    await expect(discoverOAuthConfig('https://docs.example.com')).rejects.toThrow(/404/);
  });
});
