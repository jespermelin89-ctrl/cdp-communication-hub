import type { CalendarInvite, EmailAttachment, EmailMessage } from '@/lib/types';

export function getMessageCalendarInvite(
  message: Pick<EmailMessage, 'attachments'> | null | undefined
): CalendarInvite | null {
  if (!message?.attachments) {
    return null;
  }

  return message.attachments.find((attachment) => attachment.calendarInvite)?.calendarInvite ?? null;
}

export function getCalendarInviteLabel(invite: CalendarInvite | null | undefined): string {
  if (!invite) {
    return 'Kalenderinbjudan';
  }

  if (invite.method === 'CANCEL' || invite.status === 'CANCELLED') {
    return 'Inställd kalenderinbjudan';
  }

  if (invite.method === 'REPLY') {
    return 'Kalendersvar';
  }

  if (invite.method === 'REQUEST') {
    return 'Mötesinbjudan';
  }

  return 'Kalenderinbjudan';
}

export function formatCalendarInviteWindow(
  invite: CalendarInvite | null | undefined,
  locale = 'sv-SE',
  fallbackTimeZone?: string
): string | null {
  if (!invite?.start) {
    return null;
  }

  const timeZone = invite.timeZone ?? fallbackTimeZone;
  const start = new Date(invite.start);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  if (invite.isAllDay) {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(timeZone ? { timeZone } : {}),
    }).format(start);
  }

  const startLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(start);

  if (!invite.end) {
    return `${startLabel}${timeZone ? ` (${timeZone})` : ''}`;
  }

  const end = new Date(invite.end);
  if (Number.isNaN(end.getTime())) {
    return `${startLabel}${timeZone ? ` (${timeZone})` : ''}`;
  }

  const endLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(end);

  return `${startLabel}–${endLabel}${timeZone ? ` (${timeZone})` : ''}`;
}

export function isInviteAttachmentDownloadable(attachment: Pick<EmailAttachment, 'attachmentId' | 'downloadable'>): boolean {
  return Boolean(attachment.attachmentId) && attachment.downloadable !== false;
}

export function buildCalendarInviteResponseText(
  invite: CalendarInvite,
  response: 'accept' | 'decline',
  options: {
    locale?: string;
    fallbackTimeZone?: string;
    bookingLink?: string;
  } = {}
): string {
  const slotLabel = formatCalendarInviteWindow(
    invite,
    options.locale ?? 'sv-SE',
    options.fallbackTimeZone
  );

  if (response === 'accept') {
    return [
      'Hej!',
      '',
      slotLabel
        ? `Den föreslagna tiden ${slotLabel} passar bra för mig.`
        : 'Den föreslagna tiden passar bra för mig.',
      'Jag bekräftar gärna mötet.',
    ].join('\n');
  }

  const lines = [
    'Hej!',
    '',
    slotLabel
      ? `Jag kan tyvärr inte den föreslagna tiden ${slotLabel}.`
      : 'Jag kan tyvärr inte den föreslagna tiden.',
  ];

  if (options.bookingLink) {
    lines.push(`Du får gärna boka en annan tid här i stället: ${options.bookingLink}`);
  } else {
    lines.push('Skicka gärna ett annat förslag så hittar vi en tid som fungerar.');
  }

  return lines.join('\n');
}

export function getCalendarInviteReplyRecipients(
  invite: CalendarInvite | null | undefined,
  participants: string[],
  accountEmail?: string | null
): string[] {
  const recipients = new Set<string>();

  if (invite?.organizer && invite.organizer !== accountEmail) {
    recipients.add(invite.organizer);
  }

  for (const participant of participants) {
    if (participant && participant !== accountEmail) {
      recipients.add(participant);
    }
  }

  return Array.from(recipients);
}
