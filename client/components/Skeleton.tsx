'use client';

// ── Base skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className || ''}`}
    />
  );
}

// ── Thread list skeleton (inbox) ───────────────────────────────────────────
export function ThreadSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start gap-3"
        >
          <Skeleton className="w-5 h-5 rounded mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard skeleton ─────────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-8 space-y-8 max-w-7xl mx-auto">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      {/* Widget */}
      <Skeleton className="h-48 rounded-2xl" />
      {/* Two-col */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

// ── Brain Core skeleton ────────────────────────────────────────────────────
export function BrainCoreSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-8 space-y-4 max-w-3xl mx-auto">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-10 rounded-xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

// ── Draft list skeleton ────────────────────────────────────────────────────
export function DraftSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4"
        >
          <Skeleton className="w-4 h-4 rounded shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
