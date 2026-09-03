/**
 * Auth-mode auto-detection: HUDU_AUTH_MODE is honored when set explicitly;
 * otherwise the presence of HUDU_API_KEY decides between the classic
 * api_key mode (backward-compatible default for existing users) and the
 * newer oauth mode (default for a fresh install with no API key).
 */
import { describe, it, expect } from 'vitest';
import { computeHuduAuthMode, loadEnvironmentConfig } from '../config.js';

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('computeHuduAuthMode', () => {
  it('defaults to api_key when HUDU_API_KEY is set and HUDU_AUTH_MODE is unset (backward compatible)', () => {
    expect(computeHuduAuthMode(env({ HUDU_API_KEY: 'secret' }))).toBe('api_key');
  });

  it('defaults to oauth when HUDU_API_KEY is unset and HUDU_AUTH_MODE is unset', () => {
    expect(computeHuduAuthMode(env({}))).toBe('oauth');
  });

  it('honors an explicit HUDU_AUTH_MODE=oauth even when HUDU_API_KEY is also set', () => {
    expect(computeHuduAuthMode(env({ HUDU_API_KEY: 'secret', HUDU_AUTH_MODE: 'oauth' }))).toBe('oauth');
  });

  it('honors an explicit HUDU_AUTH_MODE=api_key even when HUDU_API_KEY is unset', () => {
    expect(computeHuduAuthMode(env({ HUDU_AUTH_MODE: 'api_key' }))).toBe('api_key');
  });

  it('throws a descriptive error for an invalid HUDU_AUTH_MODE value', () => {
    expect(() => computeHuduAuthMode(env({ HUDU_AUTH_MODE: 'bogus' }))).toThrow(
      /Invalid HUDU_AUTH_MODE value: "bogus"/,
    );
  });
});

describe('loadEnvironmentConfig — Hudu auth mode wiring', () => {
  const ENV_KEYS = ['AUTH_MODE', 'HUDU_AUTH_MODE', 'HUDU_API_KEY', 'HUDU_BASE_URL', 'MCP_TRANSPORT'] as const;

  function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, overrides);
    try {
      return fn();
    } finally {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  }

  it('sets hudu.mode = "api_key" by default when HUDU_API_KEY is present (existing users unaffected)', () => {
    const config = withEnv({ HUDU_API_KEY: 'k', HUDU_BASE_URL: 'https://docs.example.com' }, loadEnvironmentConfig);
    expect(config.hudu.mode).toBe('api_key');
    expect(config.hudu.apiKey).toBe('k');
  });

  it('sets hudu.mode = "oauth" by default when HUDU_API_KEY is absent', () => {
    const config = withEnv({ HUDU_BASE_URL: 'https://docs.example.com' }, loadEnvironmentConfig);
    expect(config.hudu.mode).toBe('oauth');
  });

  it('does not compute hudu.mode in gateway mode (per-request headers only)', () => {
    const config = withEnv({ AUTH_MODE: 'gateway' }, loadEnvironmentConfig);
    expect(config.hudu.mode).toBeUndefined();
  });

  it('rejects HUDU_AUTH_MODE=oauth combined with AUTH_MODE=gateway', () => {
    expect(() => withEnv({ AUTH_MODE: 'gateway', HUDU_AUTH_MODE: 'oauth' }, loadEnvironmentConfig)).toThrow(
      /incompatible with AUTH_MODE=gateway/,
    );
  });
});
