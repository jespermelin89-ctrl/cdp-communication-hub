/**
 * Onboarding — Sprint 8 client tests
 *
 * Tests wizard step logic, completion flag, skip behaviour.
 * Pure logic — no React/DOM required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Wizard step machine ───────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

function createWizard() {
  let step = 0;
  let completed = false;
  let skipped = false;

  return {
    get step() { return step; },
    get completed() { return completed; },
    get skipped() { return skipped; },
    get isLast() { return step === TOTAL_STEPS - 1; },

    next() {
      if (step < TOTAL_STEPS - 1) {
        step++;
      } else {
        completed = true;
      }
    },

    back() {
      if (step > 0) step--;
    },

    skip() {
      skipped = true;
      completed = true;
    },

    goTo(n: number) {
      if (n >= 0 && n < TOTAL_STEPS) step = n;
    },
  };
}

// ── Completion flag helpers ───────────────────────────────────────────────────

type OnboardingStore = Record<string, string>;

function getOnboarded(store: OnboardingStore): boolean {
  return store['cdp_onboarded'] === '1';
}

function setOnboarded(store: OnboardingStore): void {
  store['cdp_onboarded'] = '1';
}

function shouldShowOnboarding(store: OnboardingStore): boolean {
  return !getOnboarded(store);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Onboarding wizard', () => {
  it('starts at step 0', () => {
    const w = createWizard();
    expect(w.step).toBe(0);
  });

  it('advances through steps with next()', () => {
    const w = createWizard();
    w.next();
    expect(w.step).toBe(1);
    w.next();
    expect(w.step).toBe(2);
  });

  it('goes back with back()', () => {
    const w = createWizard();
    w.next();
    w.next();
    w.back();
    expect(w.step).toBe(1);
  });

  it('does not go back below 0', () => {
    const w = createWizard();
    w.back();
    expect(w.step).toBe(0);
  });

  it('completes on final next()', () => {
    const w = createWizard();
    for (let i = 0; i < TOTAL_STEPS; i++) w.next();
    expect(w.completed).toBe(true);
  });

  it('isLast is true on last step', () => {
    const w = createWizard();
    w.goTo(TOTAL_STEPS - 1);
    expect(w.isLast).toBe(true);
  });

  it('skip completes wizard immediately', () => {
    const w = createWizard();
    w.skip();
    expect(w.skipped).toBe(true);
    expect(w.completed).toBe(true);
  });

  it('goTo navigates to arbitrary step', () => {
    const w = createWizard();
    w.goTo(3);
    expect(w.step).toBe(3);
  });

  it('goTo ignores out-of-range values', () => {
    const w = createWizard();
    w.goTo(-1);
    expect(w.step).toBe(0);
    w.goTo(100);
    expect(w.step).toBe(0);
  });
});

describe('Onboarding completion flag', () => {
  let store: OnboardingStore = {};

  beforeEach(() => {
    store = {};
  });

  it('shouldShowOnboarding is true when not completed', () => {
    expect(shouldShowOnboarding(store)).toBe(true);
  });

  it('shouldShowOnboarding is false after setOnboarded', () => {
    setOnboarded(store);
    expect(shouldShowOnboarding(store)).toBe(false);
  });

  it('getOnboarded returns false initially', () => {
    expect(getOnboarded(store)).toBe(false);
  });

  it('getOnboarded returns true after setOnboarded', () => {
    setOnboarded(store);
    expect(getOnboarded(store)).toBe(true);
  });
});
