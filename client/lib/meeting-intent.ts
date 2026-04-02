type MeetingThreadLike = {
  subject?: string | null;
  messages?: Array<{ bodyText?: string | null; bodyHtml?: string | null }>;
};

type AvailabilitySlotLike = {
  start: string;
  end: string;
};

const MEETING_PATTERNS = [
  /\bboka\b/i,
  /\bmöte\b/i,
  /\bmotes?\b/i,
  /\bmeeting\b/i,
  /\bcalendar\b/i,
  /\bcall\b/i,
  /\bavailability\b/i,
  /\bavailable\b/i,
  /\bschedule\b/i,
  /\bbook a time\b/i,
  /\bbook time\b/i,
  /\bfind a time\b/i,
  /\bsync up\b/i,
];

export function detectMeetingIntent(thread: MeetingThreadLike | null | undefined): boolean {
  if (!thread) {
    return false;
  }

  const bodyText = (thread.messages ?? [])
    .map((message) => `${message.bodyText ?? ''} ${message.bodyHtml ?? ''}`)
    .join(' ');
  const combined = `${thread.subject ?? ''} ${bodyText}`.trim();

  return MEETING_PATTERNS.some((pattern) => pattern.test(combined));
}

export function buildBookingReplyText(bookingLink: string): string {
  return [
    'Hej!',
    '',
    `Du kan boka en tid som passar dig här: ${bookingLink}`,
    '',
    'Säg gärna till om du hellre vill att jag föreslår tider direkt i tråden.',
  ].join('\n');
}

export function formatAvailabilitySlot(
  slot: AvailabilitySlotLike,
  locale = 'sv-SE',
  timeZone?: string
): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);

  const startLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(start);

  const endLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(end);

  return `${startLabel}–${endLabel}${timeZone ? ` (${timeZone})` : ''}`;
}

export function buildAvailabilityReplyText(
  slots: AvailabilitySlotLike[],
  options: {
    locale?: string;
    timeZone?: string;
    bookingLink?: string;
  } = {}
): string {
  const lines = [
    'Hej!',
    '',
    'Här är några tider som ser lediga ut i min kalender:',
    '',
    ...slots.map((slot) => `- ${formatAvailabilitySlot(slot, options.locale ?? 'sv-SE', options.timeZone)}`),
  ];

  if (options.bookingLink) {
    lines.push('', `Om du hellre vill boka själv kan du också använda den här länken: ${options.bookingLink}`);
  }

  lines.push('', 'Säg gärna till vad som passar bäst, så bekräftar jag direkt.');

  return lines.join('\n');
}

export function buildHeldSlotReplyText(
  slot: AvailabilitySlotLike,
  options: {
    locale?: string;
    timeZone?: string;
    bookingLink?: string;
  } = {}
): string {
  const slotLabel = formatAvailabilitySlot(slot, options.locale ?? 'sv-SE', options.timeZone);

  const lines = [
    'Hej!',
    '',
    `Jag har reserverat ${slotLabel} i min kalender.`,
    'Passar den tiden för dig?',
  ];

  if (options.bookingLink) {
    lines.push('', `Om du hellre vill boka själv kan du också använda den här länken: ${options.bookingLink}`);
  }

  lines.push('', 'Säg gärna till så bekräftar jag direkt.');

  return lines.join('\n');
}
