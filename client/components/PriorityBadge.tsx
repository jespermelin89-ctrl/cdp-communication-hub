'use client';

const priorityConfig = {
  high: { label: 'High', className: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  low: { label: 'Low', className: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
};

export default function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const config = priorityConfig[priority];
  return (
    <span className={`badge ${config.className} gap-1`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
