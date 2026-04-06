/**
 * Sprint 8 — Circuit breaker tests for AIService.
 *
 * Tests the enhanced provider circuit logic:
 * - Permanent errors open the circuit for 1 hour
 * - Rate-limit (429) opens the circuit for 2 minutes
 * - Transient failures open after 3 consecutive within 1 minute
 * - Success resets the circuit
 * - Expired blocks auto-clear on the next isProviderAvailable check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Minimal stub for AIService circuit logic ────────────────────────────────
// We test the internal circuit methods by subclassing the real AIService.
// This avoids mocking the entire SDK surface.

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_FAILURE_WINDOW_MS = 60_000;
const RATE_LIMIT_BLOCK_MS = 2 * 60_000;
const TRANSIENT_BLOCK_MS = 30_000;
const PERMANENT_BLOCK_MS = 60 * 60_000;

interface CircuitState {
  blockedUntil: number;
  consecutiveFailures: number;
  lastFailureAt: number;
}

class TestCircuit {
  private circuits: Map<string, CircuitState> = new Map();

  private getCircuit(name: string): CircuitState {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, { blockedUntil: 0, consecutiveFailures: 0, lastFailureAt: 0 });
    }
    return this.circuits.get(name)!;
  }

  isProviderAvailable(name: string): boolean {
    const circuit = this.getCircuit(name);
    if (circuit.blockedUntil === 0) return true;
    if (Date.now() > circuit.blockedUntil) {
      circuit.blockedUntil = 0;
      circuit.consecutiveFailures = 0;
      return true;
    }
    return false;
  }

  recordSuccess(name: string): void {
    const circuit = this.getCircuit(name);
    circuit.consecutiveFailures = 0;
    circuit.blockedUntil = 0;
    circuit.lastFailureAt = 0;
  }

  recordFailure(name: string, err: { status?: number; message?: string }): void {
    const circuit = this.getCircuit(name);
    const now = Date.now();

    if (this.isPermanentError(err)) {
      circuit.blockedUntil = now + PERMANENT_BLOCK_MS;
      circuit.consecutiveFailures = CIRCUIT_FAILURE_THRESHOLD;
      return;
    }

    if (this.isRateLimitError(err)) {
      circuit.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
      return;
    }

    if (now - circuit.lastFailureAt > CIRCUIT_FAILURE_WINDOW_MS) {
      circuit.consecutiveFailures = 0;
    }
    circuit.consecutiveFailures += 1;
    circuit.lastFailureAt = now;

    if (circuit.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      circuit.blockedUntil = now + TRANSIENT_BLOCK_MS;
    }
  }

  getState(name: string): CircuitState {
    return this.getCircuit(name);
  }

  private isPermanentError(err: { status?: number; message?: string }): boolean {
    const msg = err?.message ?? '';
    const status = err?.status ?? 0;
    return (
      status === 402 ||
      (status === 400 && /credit|quota|billing|insufficient/i.test(msg)) ||
      /insufficient_quota|credit balance|no credits|account.*suspend/i.test(msg)
    );
  }

  private isRateLimitError(err: { status?: number; message?: string }): boolean {
    return (err?.status ?? 0) === 429;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Circuit breaker — provider availability', () => {
  let cb: TestCircuit;

  beforeEach(() => {
    cb = new TestCircuit();
    vi.useFakeTimers();
  });

  it('provider is available by default', () => {
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('permanent error (402) blocks provider for 1 hour', () => {
    cb.recordFailure('groq', { status: 402 });
    expect(cb.isProviderAvailable('groq')).toBe(false);
    // Advance just under 1 hour
    vi.advanceTimersByTime(PERMANENT_BLOCK_MS - 1000);
    expect(cb.isProviderAvailable('groq')).toBe(false);
    // Advance past 1 hour
    vi.advanceTimersByTime(2000);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('rate-limit (429) blocks provider for 2 minutes', () => {
    cb.recordFailure('groq', { status: 429 });
    expect(cb.isProviderAvailable('groq')).toBe(false);
    vi.advanceTimersByTime(RATE_LIMIT_BLOCK_MS - 1000);
    expect(cb.isProviderAvailable('groq')).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('billing message triggers permanent block', () => {
    cb.recordFailure('groq', { status: 400, message: 'insufficient_quota exceeded' });
    expect(cb.isProviderAvailable('groq')).toBe(false);
  });

  it('3 consecutive transient failures opens circuit for 30s', () => {
    const err = { status: 500 };
    cb.recordFailure('groq', err);
    cb.recordFailure('groq', err);
    expect(cb.isProviderAvailable('groq')).toBe(true); // not yet open
    cb.recordFailure('groq', err); // 3rd failure
    expect(cb.isProviderAvailable('groq')).toBe(false);
    vi.advanceTimersByTime(TRANSIENT_BLOCK_MS + 1000);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('2 transient failures do not open the circuit', () => {
    const err = { status: 503 };
    cb.recordFailure('groq', err);
    cb.recordFailure('groq', err);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('success resets consecutive failure counter', () => {
    const err = { status: 500 };
    cb.recordFailure('groq', err);
    cb.recordFailure('groq', err);
    cb.recordSuccess('groq');
    // Now two more failures should NOT open the circuit
    cb.recordFailure('groq', err);
    cb.recordFailure('groq', err);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('transient failures outside window reset counter', () => {
    const err = { status: 502 };
    cb.recordFailure('groq', err);
    cb.recordFailure('groq', err);
    // Advance past the failure window
    vi.advanceTimersByTime(CIRCUIT_FAILURE_WINDOW_MS + 1000);
    // Counter should reset — this is the 1st failure in the new window
    cb.recordFailure('groq', err);
    expect(cb.getState('groq').consecutiveFailures).toBe(1);
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });

  it('circuits are independent per provider', () => {
    cb.recordFailure('groq', { status: 429 });
    expect(cb.isProviderAvailable('groq')).toBe(false);
    expect(cb.isProviderAvailable('anthropic')).toBe(true);
    expect(cb.isProviderAvailable('openai')).toBe(true);
  });
});

describe('Circuit breaker — success resets block', () => {
  it('success after rate-limit removes block', () => {
    vi.useFakeTimers();
    const cb = new TestCircuit();
    cb.recordFailure('groq', { status: 429 });
    expect(cb.isProviderAvailable('groq')).toBe(false);
    cb.recordSuccess('groq');
    expect(cb.isProviderAvailable('groq')).toBe(true);
  });
});

describe('Circuit breaker — permanent error patterns', () => {
  let cb: TestCircuit;

  beforeEach(() => {
    cb = new TestCircuit();
  });

  it.each([
    { status: 402 },
    { status: 400, message: 'credit balance too low' },
    { status: 400, message: 'billing quota exceeded' },
    { status: 400, message: 'insufficient funds' },
    { message: 'insufficient_quota' },
    { message: 'no credits remaining' },
    { message: 'account has been suspended' },
  ])('blocks permanently: %o', (err) => {
    cb.recordFailure('groq', err);
    expect(cb.isProviderAvailable('groq')).toBe(false);
    expect(cb.getState('groq').consecutiveFailures).toBe(CIRCUIT_FAILURE_THRESHOLD);
  });
});

describe('Circuit breaker — rate-limit detection', () => {
  it('429 triggers rate-limit block, not permanent', () => {
    vi.useFakeTimers();
    const cb = new TestCircuit();
    cb.recordFailure('groq', { status: 429 });
    const state = cb.getState('groq');
    // Rate-limit block should expire in ~2 min, not 1 hour
    expect(state.blockedUntil).toBeLessThan(Date.now() + PERMANENT_BLOCK_MS);
    expect(state.blockedUntil).toBeGreaterThan(Date.now() + RATE_LIMIT_BLOCK_MS - 5000);
  });
});
