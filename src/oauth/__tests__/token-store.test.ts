import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  credentialsFileHash,
  credentialsFilePath,
  loadCredentials,
  saveCredentials,
  isExpired,
  normalizeBaseUrl,
  EXPIRY_SKEW_MS,
  StoredCredentials,
} from '../token-store.js';

describe('normalizeBaseUrl', () => {
  it('trims whitespace and a trailing slash', () => {
    expect(normalizeBaseUrl(' https://docs.example.com/ ')).toBe('https://docs.example.com');
    expect(normalizeBaseUrl('https://docs.example.com')).toBe('https://docs.example.com');
  });
});

describe('credentialsFileHash / credentialsFilePath', () => {
  it('is deterministic and 16 hex characters', () => {
    const hash = credentialsFileHash('https://docs.example.com');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(credentialsFileHash('https://docs.example.com')).toBe(hash);
  });

  it('is the same for a URL that only differs by a trailing slash', () => {
    expect(credentialsFileHash('https://docs.example.com')).toBe(credentialsFileHash('https://docs.example.com/'));
  });

  it('differs across distinct base URLs', () => {
    expect(credentialsFileHash('https://a.example.com')).not.toBe(credentialsFileHash('https://b.example.com'));
  });

  it('builds the path under ~/.hudu-mcp/credentials-<hash>.json', () => {
    const path = credentialsFilePath('https://docs.example.com', '/home/test');
    expect(path).toBe(join('/home/test', '.hudu-mcp', `credentials-${credentialsFileHash('https://docs.example.com')}.json`));
  });
});

describe('saveCredentials / loadCredentials', () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'hudu-mcp-oauth-test-'));
  });
  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  const baseCreds: StoredCredentials = {
    baseUrl: 'https://docs.example.com',
    clientId: 'client-123',
    accessToken: 'access-token-xyz',
    refreshToken: 'refresh-token-xyz',
    expiresAt: Date.now() + 3600_000,
    scope: 'read write',
  };

  it('round-trips a saved record', () => {
    saveCredentials(baseCreds, homeDir);
    const loaded = loadCredentials(baseCreds.baseUrl, homeDir);
    expect(loaded).toEqual(baseCreds);
  });

  it('writes the credentials file with 0600 permissions', () => {
    saveCredentials(baseCreds, homeDir);
    const path = credentialsFilePath(baseCreds.baseUrl, homeDir);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('creates the ~/.hudu-mcp directory if missing', () => {
    expect(existsSync(join(homeDir, '.hudu-mcp'))).toBe(false);
    saveCredentials(baseCreds, homeDir);
    expect(existsSync(join(homeDir, '.hudu-mcp'))).toBe(true);
  });

  it('returns undefined for a baseUrl with no stored file', () => {
    expect(loadCredentials('https://nope.example.com', homeDir)).toBeUndefined();
  });

  it('returns undefined (not a throw) for a corrupt credentials file', () => {
    saveCredentials(baseCreds, homeDir);
    const path = credentialsFilePath(baseCreds.baseUrl, homeDir);
    // Overwrite with invalid JSON without going through saveCredentials.
    writeFileSync(path, 'not json', { mode: 0o600 });
    expect(loadCredentials(baseCreds.baseUrl, homeDir)).toBeUndefined();
  });

  it('a later save for the same baseUrl overwrites the earlier record', () => {
    saveCredentials(baseCreds, homeDir);
    saveCredentials({ ...baseCreds, accessToken: 'rotated-token' }, homeDir);
    expect(loadCredentials(baseCreds.baseUrl, homeDir)?.accessToken).toBe('rotated-token');
  });
});

describe('isExpired', () => {
  it('is false for a token well within its lifetime', () => {
    expect(isExpired({ expiresAt: Date.now() + 3600_000 })).toBe(false);
  });

  it('is true once past the absolute expiry', () => {
    expect(isExpired({ expiresAt: Date.now() - 1 })).toBe(true);
  });

  it('treats a token inside the expiry skew window as already expired', () => {
    const now = Date.now();
    expect(isExpired({ expiresAt: now + EXPIRY_SKEW_MS - 1 }, now)).toBe(true);
    expect(isExpired({ expiresAt: now + EXPIRY_SKEW_MS + 1000 }, now)).toBe(false);
  });
});
