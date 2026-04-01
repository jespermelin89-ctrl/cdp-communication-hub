/**
 * Keyboard shortcuts — Sprint 8 client tests
 *
 * Tests shortcut registration, context switching, and input-ignore logic.
 * Pure logic tests — no DOM needed.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Minimal replica of the keyboard-shortcuts module logic ────────────────────

type ShortcutContext = 'global' | 'inbox' | 'thread' | 'compose';

interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
  context: ShortcutContext;
}

let shortcuts: ShortcutDef[] = [];
let currentCtx: ShortcutContext = 'global';

function registerShortcut(s: ShortcutDef) {
  shortcuts.push(s);
}

function setContext(ctx: ShortcutContext) {
  currentCtx = ctx;
}

function getContext(): ShortcutContext {
  return currentCtx;
}

function unregisterShortcut(key: string, ctx: ShortcutContext) {
  shortcuts = shortcuts.filter((s) => !(s.key === key && s.context === ctx));
}

function matchShortcut(
  key: string,
  ctrl: boolean,
  shift: boolean,
  tag: string,
  isContentEditable: boolean
): ShortcutDef | null {
  // Ignore shortcuts when typing in input fields
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || isContentEditable) return null;

  for (const s of shortcuts) {
    if (
      (s.context === currentCtx || s.context === 'global') &&
      s.key === key &&
      !!s.ctrl === ctrl &&
      !!s.shift === shift
    ) {
      return s;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Keyboard shortcuts system', () => {
  beforeEach(() => {
    shortcuts = [];
    currentCtx = 'global';
  });

  it('registers a shortcut and matches it', () => {
    let fired = false;
    registerShortcut({ key: 'j', action: () => { fired = true; }, description: 'Next', context: 'inbox' });
    setContext('inbox');

    const match = matchShortcut('j', false, false, 'BODY', false);
    expect(match).not.toBeNull();
    match!.action();
    expect(fired).toBe(true);
  });

  it('does not match shortcut in wrong context', () => {
    registerShortcut({ key: 'j', action: () => {}, description: 'Next', context: 'inbox' });
    setContext('thread');

    const match = matchShortcut('j', false, false, 'BODY', false);
    expect(match).toBeNull();
  });

  it('global shortcuts match in any context', () => {
    let fired = false;
    registerShortcut({ key: '?', action: () => { fired = true; }, description: 'Help', context: 'global' });
    setContext('inbox');

    const match = matchShortcut('?', false, false, 'BODY', false);
    expect(match).not.toBeNull();
    match!.action();
    expect(fired).toBe(true);
  });

  it('ignores shortcuts when input is focused', () => {
    registerShortcut({ key: 'j', action: () => {}, description: 'Next', context: 'global' });

    expect(matchShortcut('j', false, false, 'INPUT', false)).toBeNull();
    expect(matchShortcut('j', false, false, 'TEXTAREA', false)).toBeNull();
    expect(matchShortcut('j', false, false, 'SELECT', false)).toBeNull();
  });

  it('ignores shortcuts on contentEditable elements', () => {
    registerShortcut({ key: 'j', action: () => {}, description: 'Next', context: 'global' });
    expect(matchShortcut('j', false, false, 'DIV', true)).toBeNull();
  });

  it('unregisters a shortcut', () => {
    registerShortcut({ key: 'j', action: () => {}, description: 'Next', context: 'inbox' });
    setContext('inbox');

    unregisterShortcut('j', 'inbox');
    const match = matchShortcut('j', false, false, 'BODY', false);
    expect(match).toBeNull();
  });

  it('ctrl shortcuts do not match non-ctrl keypresses', () => {
    registerShortcut({ key: 'k', ctrl: true, action: () => {}, description: 'Cmd K', context: 'global' });

    // Without ctrl
    expect(matchShortcut('k', false, false, 'BODY', false)).toBeNull();
    // With ctrl
    expect(matchShortcut('k', true, false, 'BODY', false)).not.toBeNull();
  });

  it('shift shortcuts do not match non-shift keypresses', () => {
    registerShortcut({ key: 'i', shift: true, action: () => {}, description: 'Mark read', context: 'inbox' });
    setContext('inbox');

    expect(matchShortcut('i', false, false, 'BODY', false)).toBeNull();
    expect(matchShortcut('i', false, true, 'BODY', false)).not.toBeNull();
  });

  it('setContext / getContext round-trip', () => {
    setContext('compose');
    expect(getContext()).toBe('compose');
    setContext('thread');
    expect(getContext()).toBe('thread');
  });
});
