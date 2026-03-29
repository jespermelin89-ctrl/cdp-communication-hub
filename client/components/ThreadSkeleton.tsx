export default function ThreadSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-4 flex items-start gap-3 animate-pulse"
        >
          <div className="mt-0.5 w-5 h-5 rounded border-2 border-gray-200 dark:border-gray-700 shrink-0" />
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-10 shrink-0" />
            </div>
            <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
