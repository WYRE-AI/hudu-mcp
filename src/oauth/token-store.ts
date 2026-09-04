/**
 * On-disk persistence for OAuth credentials, one file per Hudu instance
 * (keyed by a hash of its base URL) under `~/.hudu-mcp/`.
 *
 * The same record also caches the Dynamic Client Registration `clientId`
 * for that instance, so DCR only ever runs once per Hudu instance — a
 * re-authorization (e.g. after a refresh_token expires) reuses the cached
 * `clientId` instead of registering a new client.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface StoredCredentials {
  baseUrl: string;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope?: string;
}

const CONFIG_DIR_NAME = '.hudu-mcp';

/** Treat a token as expired this far ahead of its real expiry, to absorb request latency. */
export const EXPIRY_SKEW_MS = 60_000;

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** First 16 hex chars of SHA-256(baseUrl) — short, filesystem-safe, and stable per instance. */
export function credentialsFileHash(baseUrl: string): string {
  return createHash('sha256').update(normalizeBaseUrl(baseUrl)).digest('hex').slice(0, 16);
}

export function credentialsFilePath(baseUrl: string, homeDir: string = homedir()): string {
  return join(homeDir, CONFIG_DIR_NAME, `credentials-${credentialsFileHash(baseUrl)}.json`);
}

export function loadCredentials(baseUrl: string, homeDir: string = homedir()): StoredCredentials | undefined {
  const path = credentialsFilePath(baseUrl, homeDir);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredCredentials;
    if (!parsed || typeof parsed.accessToken !== 'string' || typeof parsed.clientId !== 'string') {
      return undefined;
    }
    return parsed;
  } catch {
    // Corrupt or unreadable credentials file — treat as absent so the caller re-authorizes.
    return undefined;
  }
}

export function saveCredentials(creds: StoredCredentials, homeDir: string = homedir()): void {
  const dir = join(homeDir, CONFIG_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const path = credentialsFilePath(creds.baseUrl, homeDir);
  writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
  // writeFileSync's mode is subject to umask; chmod explicitly so the file
  // is 0600 regardless of the process umask (it holds a bearer token).
  chmodSync(path, 0o600);
}

/** True once `now` is within EXPIRY_SKEW_MS of `expiresAt` (or past it). */
export function isExpired(creds: Pick<StoredCredentials, 'expiresAt'>, now: number = Date.now()): boolean {
  return now >= creds.expiresAt - EXPIRY_SKEW_MS;
}
