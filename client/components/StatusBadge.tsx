'use client';

import type { DraftStatus } from '@/lib/types';

const statusConfig: Record<DraftStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
  sent: { label: 'Sent', className: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800' },
  discarded: { label: 'Discarded', className: 'bg-gray-100 text-gray-600' },
};

export default function StatusBadge({ status }: { status: DraftStatus }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
}
