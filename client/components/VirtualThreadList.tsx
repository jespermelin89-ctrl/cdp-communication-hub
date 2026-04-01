'use client';

/**
 * VirtualThreadList — Sprint 6
 *
 * Renders only visible rows + a buffer.
 * Estimated row height: 72px (compact) or 96px (normal).
 * Scroll position is saved to sessionStorage for back-navigation.
 */

import { useEffect, useRef, useState, useCallback, ReactNode } from 'react';

const SESSION_KEY = 'cdp-thread-scroll';
const BUFFER_ROWS = 10;

interface Props {
  items: any[];
  compact?: boolean;
  renderItem: (item: any, index: number) => ReactNode;
  listKey: string; // unique key per filter combo (for scroll restore)
}

export default function VirtualThreadList({ items, compact = false, renderItem, listKey }: Props) {
  const ROW_HEIGHT = compact ? 72 : 96;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const restoredRef = useRef(false);

  // Restore scroll position on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = sessionStorage.getItem(`${SESSION_KEY}-${listKey}`);
      if (saved && containerRef.current) {
        const n = Number(saved);
        containerRef.current.scrollTop = n;
        setScrollTop(n);
      }
    } catch {
      // ignore
    }
  }, [listKey]);

  // Save scroll position
  const handleScroll = useCallback(() => {
    const top = containerRef.current?.scrollTop ?? 0;
    setScrollTop(top);
    try {
      sessionStorage.setItem(`${SESSION_KEY}-${listKey}`, String(top));
    } catch {
      // ignore
    }
  }, [listKey]);

  // Measure container height
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const totalHeight = items.length * ROW_HEIGHT;

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const offsetY = startIndex * ROW_HEIGHT;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-y-auto h-full"
      style={{ position: 'relative' }}
    >
      {/* Total height spacer */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible window */}
        <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', width: '100%', top: 0 }}>
          {items.slice(startIndex, endIndex).map((item, i) => (
            <div key={item.id ?? startIndex + i} style={{ height: ROW_HEIGHT, boxSizing: 'border-box' }}>
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
