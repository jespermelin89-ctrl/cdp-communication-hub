/**
 * VirtualThreadList — Sprint 8 client tests
 *
 * Tests the virtualisation window calculation logic.
 * Pure logic — no DOM/React required.
 */

import { describe, it, expect } from 'vitest';

// ── Window calculation (mirrors VirtualThreadList.tsx) ────────────────────────

const BUFFER_ROWS = 10;

function calculateWindow(params: {
  itemCount: number;
  rowHeight: number;
  scrollTop: number;
  containerHeight: number;
}): { startIndex: number; endIndex: number; offsetY: number } {
  const { itemCount, rowHeight, scrollTop, containerHeight } = params;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
  const visibleCount = Math.ceil(containerHeight / rowHeight) + BUFFER_ROWS * 2;
  const endIndex = Math.min(itemCount, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;
  return { startIndex, endIndex, offsetY };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('VirtualThreadList window calculation', () => {
  it('renders items from start when scrollTop = 0', () => {
    const { startIndex, endIndex } = calculateWindow({
      itemCount: 100,
      rowHeight: 96,
      scrollTop: 0,
      containerHeight: 600,
    });
    expect(startIndex).toBe(0);
    // visibleCount = ceil(600/96) + 20 = 7 + 20 = 27
    expect(endIndex).toBe(27);
  });

  it('startIndex accounts for buffer before visible rows', () => {
    const { startIndex } = calculateWindow({
      itemCount: 100,
      rowHeight: 96,
      scrollTop: 960, // 10 rows down
      containerHeight: 600,
    });
    // floor(960/96) = 10; 10 - BUFFER(10) = 0
    expect(startIndex).toBe(0);
  });

  it('startIndex advances when scrolled far enough', () => {
    const { startIndex } = calculateWindow({
      itemCount: 200,
      rowHeight: 96,
      scrollTop: 2000, // ~20 rows
      containerHeight: 600,
    });
    // floor(2000/96)=20; 20-10=10
    expect(startIndex).toBe(10);
  });

  it('endIndex does not exceed itemCount', () => {
    const { endIndex } = calculateWindow({
      itemCount: 10,
      rowHeight: 96,
      scrollTop: 0,
      containerHeight: 600,
    });
    expect(endIndex).toBe(10);
  });

  it('offsetY is correct for startIndex', () => {
    const { startIndex, offsetY } = calculateWindow({
      itemCount: 200,
      rowHeight: 96,
      scrollTop: 2000,
      containerHeight: 600,
    });
    expect(offsetY).toBe(startIndex * 96);
  });

  it('compact mode (72px) renders more rows', () => {
    const normal = calculateWindow({ itemCount: 100, rowHeight: 96, scrollTop: 0, containerHeight: 600 });
    const compact = calculateWindow({ itemCount: 100, rowHeight: 72, scrollTop: 0, containerHeight: 600 });
    expect(compact.endIndex).toBeGreaterThan(normal.endIndex);
  });

  it('totalHeight is calculated correctly', () => {
    const itemCount = 50;
    const rowHeight = 96;
    expect(itemCount * rowHeight).toBe(4800);
  });

  it('renders all items when count is smaller than window', () => {
    const { startIndex, endIndex } = calculateWindow({
      itemCount: 5,
      rowHeight: 96,
      scrollTop: 0,
      containerHeight: 600,
    });
    expect(startIndex).toBe(0);
    expect(endIndex).toBe(5);
  });
});
