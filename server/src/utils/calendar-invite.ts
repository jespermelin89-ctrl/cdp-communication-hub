export type ParsedCalendarInvite = {
  uid: string | null;
  method: string | null;
  status: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  organizer: string | null;
  organizerName: string | null;
  start: string | null;
  end: string | null;
  timeZone: string | null;
  isAllDay: boolean;
};

function unfoldIcsLines(input: string): string[] {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function unescapeIcsValue(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const left = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [rawName, ...rawParams] = left.split(';');
  const params: Record<string, string> = {};

  for (const param of rawParams) {
    const [key, ...rest] = param.split('=');
    if (!key || rest.length === 0) continue;
    params[key.toUpperCase()] = rest.join('=');
  }

  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    ) as Record<string, string>;

    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );

    return asUtc - date.getTime();
  } catch {
    return null;
  }
}

function zonedDateTimeToIso(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}, timeZone: string): string | null {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = localAsUtc;

  for (let i = 0; i < 4; i++) {
    const offset = getTimeZoneOffsetMs(timeZone, new Date(guess));
    if (offset == null) return null;
    const adjusted = localAsUtc - offset;
    if (adjusted === guess) break;
    guess = adjusted;
  }

  return new Date(guess).toISOString();
}

function parseCalendarDateValue(
  value: string,
  params: Record<string, string>
): { iso: string | null; timeZone: string | null; isAllDay: boolean } {
  const cleaned = value.trim();
  const tzid = params.TZID ?? null;
  const isDateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(cleaned);

  if (isDateOnly) {
    const year = Number(cleaned.slice(0, 4));
    const month = Number(cleaned.slice(4, 6));
    const day = Number(cleaned.slice(6, 8));

    if (!year || !month || !day) {
      return { iso: null, timeZone: tzid, isAllDay: true };
    }

    return {
      iso: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString(),
      timeZone: tzid,
      isAllDay: true,
    };
  }

  const match = cleaned.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/
  );
  if (!match) {
    return { iso: null, timeZone: tzid, isAllDay: false };
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, isUtc] = match;
  const parts = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
    second: Number(secondRaw ?? '0'),
  };

  if (isUtc) {
    return {
      iso: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)).toISOString(),
      timeZone: tzid ?? 'UTC',
      isAllDay: false,
    };
  }

  if (tzid) {
    return {
      iso: zonedDateTimeToIso(parts, tzid),
      timeZone: tzid,
      isAllDay: false,
    };
  }

  return {
    iso: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)).toISOString(),
    timeZone: null,
    isAllDay: false,
  };
}

function parseOrganizer(value: string, params: Record<string, string>): { email: string | null; name: string | null } {
  const email = value.replace(/^mailto:/i, '').trim() || null;
  const name = params.CN ? unescapeIcsValue(params.CN) : null;
  return { email, name };
}

export function isCalendarInviteMimeType(mimeType?: string | null, filename?: string | null): boolean {
  const normalizedMimeType = (mimeType ?? '').toLowerCase();
  const normalizedFilename = (filename ?? '').toLowerCase();

  return normalizedMimeType === 'text/calendar'
    || normalizedMimeType === 'application/ics'
    || normalizedFilename.endsWith('.ics');
}

export function parseCalendarInvite(content: string): ParsedCalendarInvite | null {
  if (!content || !content.includes('BEGIN:VCALENDAR')) {
    return null;
  }

  const lines = unfoldIcsLines(content);
  let method: string | null = null;
  let inEvent = false;

  const invite: ParsedCalendarInvite = {
    uid: null,
    method: null,
    status: null,
    summary: null,
    description: null,
    location: null,
    organizer: null,
    organizerName: null,
    start: null,
    end: null,
    timeZone: null,
    isAllDay: false,
  };

  for (const line of lines) {
    const parsed = parseIcsLine(line);
    if (!parsed) continue;

    if (!inEvent && parsed.name === 'METHOD') {
      method = unescapeIcsValue(parsed.value).toUpperCase();
      continue;
    }

    if (parsed.name === 'BEGIN' && parsed.value.toUpperCase() === 'VEVENT') {
      inEvent = true;
      continue;
    }

    if (parsed.name === 'END' && parsed.value.toUpperCase() === 'VEVENT') {
      break;
    }

    if (!inEvent) continue;

    switch (parsed.name) {
      case 'UID':
        invite.uid = unescapeIcsValue(parsed.value) || null;
        break;
      case 'STATUS':
        invite.status = unescapeIcsValue(parsed.value).toUpperCase() || null;
        break;
      case 'SUMMARY':
        invite.summary = unescapeIcsValue(parsed.value) || null;
        break;
      case 'DESCRIPTION':
        invite.description = unescapeIcsValue(parsed.value) || null;
        break;
      case 'LOCATION':
        invite.location = unescapeIcsValue(parsed.value) || null;
        break;
      case 'ORGANIZER': {
        const organizer = parseOrganizer(parsed.value, parsed.params);
        invite.organizer = organizer.email;
        invite.organizerName = organizer.name;
        break;
      }
      case 'DTSTART': {
        const start = parseCalendarDateValue(parsed.value, parsed.params);
        invite.start = start.iso;
        invite.timeZone = start.timeZone ?? invite.timeZone;
        invite.isAllDay = start.isAllDay;
        break;
      }
      case 'DTEND': {
        const end = parseCalendarDateValue(parsed.value, parsed.params);
        invite.end = end.iso;
        invite.timeZone = end.timeZone ?? invite.timeZone;
        invite.isAllDay = invite.isAllDay || end.isAllDay;
        break;
      }
    }
  }

  invite.method = method;

  if (!invite.summary && !invite.start && !invite.organizer) {
    return null;
  }

  return invite;
}
