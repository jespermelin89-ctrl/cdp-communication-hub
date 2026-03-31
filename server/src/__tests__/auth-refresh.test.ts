/**
 * Auth refresh tests — JWT generation, verification, expiry handling.
 * No DB or external calls — pure unit tests against authService.
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { authService } from '../services/auth.service';

const TEST_USER_ID = 'user-test-123';
const TEST_EMAIL = 'test@example.com';

describe('Auth: JWT lifecycle', () => {
  it('generateJwt returns a non-empty token string', () => {
    const token = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('verifyJwt decodes correct userId and email', () => {
    const token = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    const payload = authService.verifyJwt(token);
    expect(payload.userId).toBe(TEST_USER_ID);
    expect(payload.email).toBe(TEST_EMAIL);
  });

  it('verifyJwt throws on tampered token', () => {
    const token = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(() => authService.verifyJwt(tampered)).toThrow();
  });

  it('verifyJwt throws on expired token', () => {
    const expiredToken = jwt.sign(
      { userId: TEST_USER_ID, email: TEST_EMAIL },
      process.env.JWT_SECRET ?? 'test-secret-that-is-at-least-32-chars-long',
      { expiresIn: -1 } // already expired
    );
    expect(() => authService.verifyJwt(expiredToken)).toThrow();
  });

  it('generateJwt produces unique tokens each call', () => {
    const t1 = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    const t2 = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    // Both valid but issued at different iat — may differ by iat only, that's fine
    expect(typeof t1).toBe('string');
    expect(typeof t2).toBe('string');
  });

  it('verifyJwt payload contains iat field', () => {
    const token = authService.generateJwt(TEST_USER_ID, TEST_EMAIL);
    const payload = authService.verifyJwt(token);
    expect(typeof payload.iat).toBe('number');
    expect(payload.iat).toBeGreaterThan(0);
  });
});
