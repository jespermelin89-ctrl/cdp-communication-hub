'use client';

import { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}

const THRESHOLD = 72;
const MAX_PULL = 100;

export default function PullToRefresh({ onRefresh, children, disabled = false }: PullToRefreshProps) {
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    if ((containerRef.current?.scrollTop ?? 0) === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [disabled, refreshing]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 0) {
      setPullDist(Math.min(MAX_PULL, diff * 0.55));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDist >= THRESHOLD) {
      setRefreshing(true);
      navigator.vibrate?.(30);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDist(0);
  }, [pullDist, onRefresh]);

  const rotation = pullDist * 2.5;
  const opacity = Math.min(1, pullDist / THRESHOLD);
  const reached = pullDist >= THRESHOLD;

  return (
    <div
      ref={containerRef}
      className="relative overflow-y-auto h-full"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex justify-center items-center overflow-hidden"
        style={{ height: `${pullDist}px`, opacity, transition: pulling.current ? 'none' : 'height 0.2s ease-out' }}
      >
        <RefreshCw
          size={20}
          className={`transition-colors ${reached ? 'text-brand-500' : 'text-gray-400'} ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
