'use client';

/**
 * useSwipe — Sprint 5
 *
 * Touch event handling for swipe gestures on list items.
 * Threshold: 80px horizontal drag.
 * Returns ref to attach to the element + current swipe state.
 */

import { useRef, useCallback } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

interface SwipeResult {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
}: SwipeHandlers): SwipeResult {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((_e: React.TouchEvent) => {
    // Intentionally empty — we evaluate on touchEnd
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - startX.current;
    const deltaY = endY - startY.current;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 2) {
      startX.current = null;
      startY.current = null;
      return;
    }

    // Haptic feedback if available
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    if (deltaX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (deltaX > threshold && onSwipeRight) {
      onSwipeRight();
    }

    startX.current = null;
    startY.current = null;
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
