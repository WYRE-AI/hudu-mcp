/**
 * PKCE (RFC 7636) helpers for the OAuth authorization_code flow, plus the
 * `state` parameter used to bind an authorization request to its callback.
 *
 * Uses `node:crypto` only — no external dependency.
 */
import { randomBytes, createHash } from 'node:crypto';

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/** RFC 4648 §5 base64url, no padding — required for PKCE and state values. */
export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A code_verifier per RFC 7636 §4.1: a high-entropy cryptographic random
 * string using [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~", 43-128 chars.
 * 32 random bytes base64url-encodes to 43 characters, the minimum allowed.
 */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

/** code_challenge = BASE64URL(SHA256(code_verifier)), per RFC 7636 §4.2 (S256). */
export function generateCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest());
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = generateCodeVerifier();
  return {
    codeVerifier,
    codeChallenge: generateCodeChallenge(codeVerifier),
    codeChallengeMethod: 'S256',
  };
}

/** Opaque, unguessable `state` value to defend the callback against CSRF. */
export function generateState(): string {
  return base64UrlEncode(randomBytes(16));
}
