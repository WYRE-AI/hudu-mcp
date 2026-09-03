import { describe, it, expect } from 'vitest';
import { startCallbackServer } from '../callback-server.js';

describe('startCallbackServer', () => {
  it('binds to an ephemeral 127.0.0.1 port and exposes it in redirectUri', async () => {
    const pending = await startCallbackServer('expected-state');
    try {
      expect(pending.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    } finally {
      await pending.close();
    }
  });

  it('resolves with {code, state} when the redirect carries the expected state', async () => {
    const pending = await startCallbackServer('expected-state');
    try {
      const resultPromise = pending.waitForCallback();
      const url = new URL(pending.redirectUri);
      url.searchParams.set('code', 'auth-code-xyz');
      url.searchParams.set('state', 'expected-state');

      const res = await fetch(url.toString());
      expect(res.status).toBe(200);

      const result = await resultPromise;
      expect(result).toEqual({ code: 'auth-code-xyz', state: 'expected-state' });
    } finally {
      await pending.close();
    }
  });

  it('rejects when the state parameter does not match (CSRF guard)', async () => {
    const pending = await startCallbackServer('expected-state');
    try {
      const resultPromise = pending.waitForCallback();
      resultPromise.catch(() => {}); // avoid a spurious "handled asynchronously" warning below
      const url = new URL(pending.redirectUri);
      url.searchParams.set('code', 'auth-code-xyz');
      url.searchParams.set('state', 'wrong-state');

      const res = await fetch(url.toString());
      expect(res.status).toBe(400);

      await expect(resultPromise).rejects.toThrow(/state mismatch/);
    } finally {
      await pending.close();
    }
  });

  it('rejects when the authorization server reports an error', async () => {
    const pending = await startCallbackServer('expected-state');
    try {
      const resultPromise = pending.waitForCallback();
      resultPromise.catch(() => {}); // avoid a spurious "handled asynchronously" warning below
      const url = new URL(pending.redirectUri);
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'user declined');

      await fetch(url.toString());
      await expect(resultPromise).rejects.toThrow(/user declined/);
    } finally {
      await pending.close();
    }
  });

  it('rejects when the code parameter is missing', async () => {
    const pending = await startCallbackServer('expected-state');
    try {
      const resultPromise = pending.waitForCallback();
      resultPromise.catch(() => {}); // avoid a spurious "handled asynchronously" warning below
      const url = new URL(pending.redirectUri);
      url.searchParams.set('state', 'expected-state');

      await fetch(url.toString());
      await expect(resultPromise).rejects.toThrow(/missing the code parameter/);
    } finally {
      await pending.close();
    }
  });

  it('close() stops the listener so further requests fail to connect', async () => {
    const pending = await startCallbackServer('expected-state');
    const { redirectUri } = pending;
    await pending.close();
    await expect(fetch(redirectUri)).rejects.toThrow();
  });
});
