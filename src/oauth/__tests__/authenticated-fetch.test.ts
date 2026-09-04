/**
 * `createAuthenticatedFetch`: attaches a bearer token to every request, and
 * on a 401 response force-refreshes exactly once and retries — covering the
 * "token expired despite our tracking" case called out in the spec.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ensureAccessTokenMock = vi.hoisted(() => vi.fn());
vi.mock('../manager.js', () => ({ ensureAccessToken: ensureAccessTokenMock }));

import { Logger } from '../../utils/logger.js';
import { createAuthenticatedFetch } from '../authenticated-fetch.js';

describe('createAuthenticatedFetch', () => {
  const logger = new Logger('error');
  const originalFetch = global.fetch;

  beforeEach(() => {
    ensureAccessTokenMock.mockReset();
    global.fetch = vi.fn();
  });

  it('attaches "Authorization: Bearer <token>" from ensureAccessToken to the request', async () => {
    ensureAccessTokenMock.mockResolvedValue('token-1');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const authFetch = createAuthenticatedFetch('https://docs.example.com', logger);
    await authFetch('https://docs.example.com/mcp', { method: 'POST' });

    expect(ensureAccessTokenMock).toHaveBeenCalledWith('https://docs.example.com', logger);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('passes a single-attempt 200 straight through without a second ensureAccessToken call', async () => {
    ensureAccessTokenMock.mockResolvedValue('token-1');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 200 });

    const authFetch = createAuthenticatedFetch('https://docs.example.com', logger);
    await authFetch('https://docs.example.com/mcp');

    expect(ensureAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('on a 401, force-refreshes once and retries with the new token', async () => {
    ensureAccessTokenMock.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token');
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 });

    const authFetch = createAuthenticatedFetch('https://docs.example.com', logger);
    const response = await authFetch('https://docs.example.com/mcp', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ensureAccessTokenMock).toHaveBeenCalledTimes(2);
    expect(ensureAccessTokenMock).toHaveBeenNthCalledWith(2, 'https://docs.example.com', logger, { forceRefresh: true });

    const retryHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
  });

  it('does not retry a second time if the retry also comes back 401', async () => {
    ensureAccessTokenMock.mockResolvedValue('token');
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ status: 401 });

    const authFetch = createAuthenticatedFetch('https://docs.example.com', logger);
    const response = await authFetch('https://docs.example.com/mcp');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one attempt + one retry, no more
  });
});
