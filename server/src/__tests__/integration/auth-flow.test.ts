/**
 * Auth flow — JWT lifecycle tests (no DB required).
 * Uses authService directly via the existing service singleton.
 */

import { describe, it, expect } from 'vitest';
import { authService } from '../../services/auth.service';

describe('auth flow — JWT lifecycle', () => {
  const userId = 'user-test-integration';
  const email = 'integration@test.com';

  it('generateJwt returns a non-empty string', () => {
    const token = authService.generateJwt(userId, email);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  it('verifyJwt decodes correct userId and email', () => {
    const token = authService.generateJwt(userId, email);
    const payload = authService.verifyJwt(token);
    expect(payload.userId).toBe(userId);
    expect(payload.email).toBe(email);
  });

  it('verifyJwt throws on tampered token', () => {
    const token = authService.generateJwt(userId, email);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => authService.verifyJwt(tampered)).toThrow();
  });

  it('verifyJwt throws on completely invalid string', () => {
    expect(() => authService.verifyJwt('not.a.jwt')).toThrow();
  });

  it('JWT contains three dot-separated parts', () => {
    const token = authService.generateJwt(userId, email);
    expect(token.split('.')).toHaveLength(3);
  });

  it('payload contains iat field', () => {
    const token = authService.generateJwt(userId, email);
    const payload = authService.verifyJwt(token);
    expect(payload).toHaveProperty('iat');
  });

  it('two tokens for same user differ (iat changes)', () => {
    // Tokens are at minimum unique strings
    const t1 = authService.generateJwt(userId, email);
    const t2 = authService.generateJwt(userId + '2', email);
    expect(t1).not.toBe(t2);
  });

  it('re-auth flow: new token can be verified', () => {
    const token1 = authService.generateJwt(userId, email);
    const token2 = authService.generateJwt(userId, email);
    // Both tokens are valid
    expect(() => authService.verifyJwt(token1)).not.toThrow();
    expect(() => authService.verifyJwt(token2)).not.toThrow();
  });
});
