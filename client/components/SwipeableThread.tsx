'use client';

import { useRef, useState, useCallback } from 'react';

interface SwipeableThreadProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;   // Arkivera
  onSwipeRight?: () => void;  // Öppna / svara
  leftLabel?: string;
  rightLabel?: string;
  disabled?: boolean;
}

const THRESHOLD = 72;
const MAX_OFFSET = 110;

export default function SwipeableThread({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Arkivera',
  rightLabel = 'Öppna',
  disabled = false,
}: SwipeableThreadProps) {
  const startX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    setActive(true);
  }, [disabled]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!active || disabled) return;
    const diff = e.touches[0].clientX - startX.current;
    setOffset(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, diff)));
  }, [active, disabled]);

  const onTouchEnd = useCallback(() => {
    if (!active) return;
    setActive(false);
    if (offset < -THRESHOLD && onSwipeLeft) {
      navigator.vibrate?.(30);
      onSwipeLeft();
    } else if (offset > THRESHOLD && onSwipeRight) {
      navigator.vibrate?.(30);
      onSwipeRight();
    }
    setOffset(0);
  }, [active, offset, onSwipeLeft, onSwipeRight]);

  const isLeft = offset < -20;
  const isRight = offset > 20;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Left action: archive (swipe left reveals this on right side) */}
      {onSwipeLeft && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-end pr-5 bg-amber-500 rounded-2xl transition-opacity ${isLeft ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: `${Math.min(MAX_OFFSET, Math.abs(offset))}px` }}
        >
          <span className="text-white text-xs font-semibold whitespace-nowrap">{leftLabel}</span>
        </div>
      )}
      {/* Right action: open/reply (swipe right reveals this on left side) */}
      {onSwipeRight && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center pl-5 bg-brand-500 rounded-2xl transition-opacity ${isRight ? 'opacity-100' : 'opacity-0'}`}
          style={{ width: `${Math.min(MAX_OFFSET, Math.abs(offset))}px` }}
        >
          <span className="text-white text-xs font-semibold whitespace-nowrap">{rightLabel}</span>
        </div>
      )}
      {/* Thread content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative bg-white dark:bg-gray-800 rounded-2xl"
        style={{
          transform: `translateX(${offset}px)`,
          transition: active ? 'none' : 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
