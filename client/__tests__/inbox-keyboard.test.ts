/**
 * Inbox keyboard navigation — pure logic tests (no DOM required).
 * Tests focus index arithmetic, boundary conditions, and shortcut dispatch.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Focus index logic (mirrors inbox keyboard state) ──────────────────────

function moveFocus(current: number, delta: number, total: number): number {
  const next = current + delta;
  return Math.max(0, Math.min(next, total - 1));
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const tag = (target as HTMLElement).tagName ?? '';
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
}

type ShortcutMap = Record<string, () => void>;

function handleKey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; target?: EventTarget | null }, shortcuts: ShortcutMap): boolean {
  if (isInputElement(e.target ?? null)) return false;
  if (e.metaKey || e.ctrlKey) return false;
  const handler = shortcuts[e.key];
  if (handler) { handler(); return true; }
  return false;
}

describe('inbox keyboard — focus index', () => {
  it('j moves focus down', () => {
    expect(moveFocus(0, 1, 10)).toBe(1);
    expect(moveFocus(5, 1, 10)).toBe(6);
  });

  it('k moves focus up', () => {
    expect(moveFocus(5, -1, 10)).toBe(4);
    expect(moveFocus(1, -1, 10)).toBe(0);
  });

  it('j does not exceed last thread', () => {
    expect(moveFocus(9, 1, 10)).toBe(9);
  });

  it('k does not go below 0', () => {
    expect(moveFocus(0, -1, 10)).toBe(0);
  });

  it('moveFocus with empty list stays at 0', () => {
    expect(moveFocus(0, 1, 0)).toBe(0);
  });
});

describe('inbox keyboard — shortcut dispatch', () => {
  it('j key calls handler', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: 'j' }, { j: handler });
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('k key calls handler', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: 'k' }, { k: handler });
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('Enter key calls handler', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: 'Enter' }, { Enter: handler });
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('keys are ignored when target is INPUT', () => {
    const handler = vi.fn();
    const fakeInput = { tagName: 'INPUT' } as unknown as EventTarget;
    const handled = handleKey({ key: 'j', target: fakeInput }, { j: handler });
    expect(handled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keys are ignored when target is TEXTAREA', () => {
    const handler = vi.fn();
    const fakeTextarea = { tagName: 'TEXTAREA' } as unknown as EventTarget;
    const handled = handleKey({ key: 'k', target: fakeTextarea }, { k: handler });
    expect(handled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keys are ignored with metaKey (Cmd)', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: 'j', metaKey: true }, { j: handler });
    expect(handled).toBe(false);
  });

  it('keys are ignored with ctrlKey', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: 'j', ctrlKey: true }, { j: handler });
    expect(handled).toBe(false);
  });

  it('unknown key returns false', () => {
    const handled = handleKey({ key: 'F5' }, {});
    expect(handled).toBe(false);
  });

  it('# calls trash handler', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: '#' }, { '#': handler });
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('/ calls search focus handler', () => {
    const handler = vi.fn();
    const handled = handleKey({ key: '/' }, { '/': handler });
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });
});
