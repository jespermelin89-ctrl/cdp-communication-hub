/**
 * Keyboard shortcuts system — Sprint 3
 *
 * Context-aware shortcuts that change based on the active view.
 * Multi-key combos (e.g. "g i" within 500 ms) are supported.
 * Shortcuts are ignored when focus is in an input/textarea/contenteditable.
 */

export type ShortcutContext = 'global' | 'inbox' | 'thread' | 'compose';

export interface ShortcutDefinition {
  key: string;          // lowercase key (e.g. 'j', '?', 'escape')
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;       // Cmd on macOS
  action: () => void;
  description: string;
  context: ShortcutContext;
}

type ComboState = {
  firstKey: string;
  timestamp: number;
};

const COMBO_TIMEOUT_MS = 500;

let registeredShortcuts: ShortcutDefinition[] = [];
let currentContext: ShortcutContext = 'global';
let comboState: ComboState | null = null;

// Two-key combos: "g i", "g d", etc.
const TWO_KEY_COMBOS: Record<string, Record<string, ShortcutDefinition>> = {};

function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true;
  if (el.isContentEditable) return true;
  return false;
}

function buildComboKey(first: string, second: string): string {
  return `${first}+${second}`;
}

let listenerAttached = false;

function handleKeyDown(e: KeyboardEvent) {
  if (isInputFocused()) return;

  const key = e.key.toLowerCase();
  const now = Date.now();

  // Check if we're in a two-key combo sequence
  if (comboState && now - comboState.timestamp < COMBO_TIMEOUT_MS) {
    const comboKey = buildComboKey(comboState.firstKey, key);
    const contextCombos = TWO_KEY_COMBOS[currentContext] ?? {};
    const globalCombos = TWO_KEY_COMBOS['global'] ?? {};
    const handler = contextCombos[comboKey] ?? globalCombos[comboKey];
    if (handler) {
      e.preventDefault();
      comboState = null;
      handler.action();
      return;
    }
    comboState = null;
  }

  // Check if this key starts a two-key combo
  const contextCombos = TWO_KEY_COMBOS[currentContext] ?? {};
  const globalCombos = TWO_KEY_COMBOS['global'] ?? {};
  const allCombos = { ...globalCombos, ...contextCombos };
  const startsCombo = Object.keys(allCombos).some((k) => k.startsWith(`${key}+`));
  if (startsCombo) {
    comboState = { firstKey: key, timestamp: now };
    return;
  }

  // Single-key shortcuts
  for (const shortcut of registeredShortcuts) {
    if (
      (shortcut.context === currentContext || shortcut.context === 'global') &&
      shortcut.key === key &&
      !!shortcut.ctrl === (e.ctrlKey || e.metaKey) &&
      !!shortcut.shift === e.shiftKey &&
      !!shortcut.meta === e.metaKey
    ) {
      e.preventDefault();
      shortcut.action();
      return;
    }
  }
}

export function registerShortcut(shortcut: ShortcutDefinition) {
  registeredShortcuts.push(shortcut);
  ensureListener();
}

export function registerTwoKeyCombo(context: ShortcutContext, combo: string, shortcut: ShortcutDefinition) {
  if (!TWO_KEY_COMBOS[context]) TWO_KEY_COMBOS[context] = {};
  TWO_KEY_COMBOS[context][combo] = shortcut;
  ensureListener();
}

export function unregisterShortcut(key: string, context: ShortcutContext) {
  registeredShortcuts = registeredShortcuts.filter(
    (s) => !(s.key === key && s.context === context)
  );
}

export function setContext(ctx: ShortcutContext) {
  currentContext = ctx;
}

export function getContext(): ShortcutContext {
  return currentContext;
}

export function getAllShortcuts(): ShortcutDefinition[] {
  const comboShortcuts: ShortcutDefinition[] = [];
  for (const ctx of Object.keys(TWO_KEY_COMBOS)) {
    for (const shortcut of Object.values(TWO_KEY_COMBOS[ctx])) {
      comboShortcuts.push(shortcut);
    }
  }
  return [...registeredShortcuts, ...comboShortcuts];
}

function ensureListener() {
  if (!listenerAttached && typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    listenerAttached = true;
  }
}
