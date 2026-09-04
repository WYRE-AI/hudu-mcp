import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  base64UrlEncode,
  generateCodeVerifier,
  generateCodeChallenge,
  generatePkcePair,
  generateState,
} from '../pkce.js';

describe('pkce', () => {
  it('base64UrlEncode produces no padding, plus, or slash characters', () => {
    // All-0xff bytes are the classic case that forces base64 padding/`+`//`.
    const encoded = base64UrlEncode(Buffer.from([255, 255, 255, 255, 255]));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('generateCodeVerifier produces a 43-character string using only the RFC 7636 unreserved alphabet', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generateCodeVerifier is different on every call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it('generateCodeChallenge computes BASE64URL(SHA256(verifier)) per RFC 7636 S256', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'; // RFC 7636 Appendix B example
    const expected = base64UrlEncode(createHash('sha256').update(verifier).digest());
    expect(generateCodeChallenge(verifier)).toBe(expected);
    // Matches the RFC 7636 Appendix B worked example directly.
    expect(generateCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generatePkcePair returns a verifier/challenge pair consistent with each other, method S256', () => {
    const pair = generatePkcePair();
    expect(pair.codeChallengeMethod).toBe('S256');
    expect(pair.codeChallenge).toBe(generateCodeChallenge(pair.codeVerifier));
  });

  it('generateState returns a non-empty, URL-safe, unpredictable value', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
    expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});
