/**
 * AccountBadge - Shows which account a thread/draft belongs to.
 * Displays a colored dot + short label or email.
 */

interface AccountBadgeProps {
  emailAddress: string;
  provider?: string;
  color?: string | null;
  label?: string | null;
  size?: 'sm' | 'md';
}

export default function AccountBadge({ emailAddress, provider, color, label, size = 'sm' }: AccountBadgeProps) {
  const dotColor = color || (provider === 'gmail' ? '#EA4335' : '#6366F1');
  const displayText = label || emailAddress.split('@')[0];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === 'sm'
          ? 'px-2 py-0.5 text-[10px]'
          : 'px-2.5 py-1 text-xs'
      } bg-gray-100 text-gray-600`}
    >
      <span
        className="shrink-0 rounded-full"
        style={{
          backgroundColor: dotColor,
          width: size === 'sm' ? '6px' : '8px',
          height: size === 'sm' ? '6px' : '8px',
        }}
      />
      {displayText}
    </span>
  );
}
