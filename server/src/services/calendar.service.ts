import { calendar_v3, google } from 'googleapis';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { actionLogService } from './action-log.service';

const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_LIMIT = 6;
const DEFAULT_DAYS = 7;
const SLOT_STEP_MINUTES = 30;

type BusyPeriod = {
  start: string;
  end: string;
};

export type CalendarAvailabilitySlot = {
  start: string;
  end: string;
};

export type CalendarCreatedEvent = {
  id: string;
  htmlLink: string | null;
  summary: string | null;
  start: string;
  end: string;
  status: string | null;
};

export const MAIL_OS_TENTATIVE_HOLD_MARKER = 'Skapad från Mail OS som en tentativ reservation i Google Calendar.';

type AvailabilityOptions = {
  days?: number;
  limit?: number;
  slotMinutes?: number;
  timeZone?: string;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
};

type CreateTentativeEventOptions = {
  start: string;
  end: string;
  timeZone?: string;
  summary?: string | null;
  description?: string | null;
};

type CalendarUnsupportedResult = {
  supported: false;
  requiresReconnect: false;
  reason: string;
  timeZone: string;
};

type CalendarReconnectResult = {
  supported: true;
  requiresReconnect: true;
  reason: string;
  timeZone: string;
};

type CalendarAvailabilitySuccessResult = {
  supported: true;
  requiresReconnect: false;
  slots: CalendarAvailabilitySlot[];
  timeZone: string;
  days: number;
  limit: number;
  slotMinutes: number;
  windowStart: string;
  windowEnd: string;
};

type CalendarCreateEventSuccessResult = {
  supported: true;
  requiresReconnect: false;
  event: CalendarCreatedEvent;
  timeZone: string;
};

type CalendarReleaseEventSuccessResult = {
  supported: true;
  requiresReconnect: false;
  released: true;
  eventId: string;
  timeZone: string;
};

export function clampCalendarDays(days?: number): number {
  const value = Number(days);
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(14, Math.round(value)));
}

export function clampCalendarLimit(limit?: number): number {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(12, Math.round(value)));
}

export function clampSlotMinutes(slotMinutes?: number): number {
  const value = Number(slotMinutes);
  if (!Number.isFinite(value)) return DEFAULT_SLOT_MINUTES;
  return Math.max(15, Math.min(120, Math.round(value / 15) * 15));
}

export function resolveCalendarTimeZone(timeZone?: string): string {
  if (!timeZone) {
    return 'UTC';
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function buildCalendarEventSummary(subject?: string | null): string {
  const cleaned = (subject ?? '')
    .replace(/^((re|fw|fwd|sv):\s*)+/i, '')
    .trim();

  if (!cleaned) {
    return 'Tentativt möte';
  }

  return `Tentativt: ${cleaned}`;
}

export function buildCalendarEventDescription(options: {
  threadSubject?: string | null;
  participants?: string[];
} = {}): string {
  const lines = [MAIL_OS_TENTATIVE_HOLD_MARKER];

  if (options.threadSubject?.trim()) {
    lines.push(`Tråd: ${options.threadSubject.trim()}`);
  }

  const participants = [...new Set((options.participants ?? []).map((value) => value.trim()).filter(Boolean))];
  if (participants.length > 0) {
    lines.push(`Deltagare i tråden: ${participants.join(', ')}`);
  }

  lines.push('Ingen extern mötesinbjudan har skickats automatiskt.');
  return lines.join('\n');
}

export function isManagedTentativeHold(event: Pick<calendar_v3.Schema$Event, 'status' | 'description'> | null | undefined): boolean {
  if (!event) {
    return false;
  }

  if (event.status !== 'tentative') {
    return false;
  }

  return typeof event.description === 'string' && event.description.includes(MAIL_OS_TENTATIVE_HOLD_MARKER);
}

function roundUpToInterval(date: Date, minutes: number): Date {
  const intervalMs = minutes * 60_000;
  const next = Math.ceil(date.getTime() / intervalMs) * intervalMs;
  return new Date(next);
}

function getLocalParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    weekday: parts.weekday,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = getLocalParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getMinutesInDay(date: Date, timeZone: string): number {
  const parts = getLocalParts(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

function isWeekend(date: Date, timeZone: string): boolean {
  const { weekday } = getLocalParts(date, timeZone);
  return weekday === 'Sat' || weekday === 'Sun';
}

function isMinuteInQuietHours(minuteOfDay: number, quietHoursStart: number, quietHoursEnd: number): boolean {
  const start = Math.max(0, Math.min(23, quietHoursStart)) * 60;
  const end = Math.max(0, Math.min(23, quietHoursEnd)) * 60;

  if (start === end) {
    return false;
  }

  if (start < end) {
    return minuteOfDay >= start && minuteOfDay < end;
  }

  return minuteOfDay >= start || minuteOfDay < end;
}

function intersectsBusyRange(
  start: Date,
  end: Date,
  busyPeriods: Array<{ start: Date; end: Date }>
): boolean {
  return busyPeriods.some((busy) => start < busy.end && end > busy.start);
}

function isSlotAvailable(
  start: Date,
  end: Date,
  timeZone: string,
  quietHoursStart: number,
  quietHoursEnd: number,
  busyPeriods: Array<{ start: Date; end: Date }>
): boolean {
  const endEdge = new Date(end.getTime() - 60_000);

  if (isWeekend(start, timeZone) || isWeekend(endEdge, timeZone)) {
    return false;
  }

  if (getLocalDateKey(start, timeZone) !== getLocalDateKey(endEdge, timeZone)) {
    return false;
  }

  if (isMinuteInQuietHours(getMinutesInDay(start, timeZone), quietHoursStart, quietHoursEnd)) {
    return false;
  }

  if (isMinuteInQuietHours(getMinutesInDay(endEdge, timeZone), quietHoursStart, quietHoursEnd)) {
    return false;
  }

  return !intersectsBusyRange(start, end, busyPeriods);
}

export function buildAvailabilitySlots(options: {
  busy: BusyPeriod[];
  from: Date;
  to: Date;
  slotMinutes?: number;
  limit?: number;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  timeZone?: string;
}): CalendarAvailabilitySlot[] {
  const slotMinutes = clampSlotMinutes(options.slotMinutes);
  const limit = clampCalendarLimit(options.limit);
  const timeZone = resolveCalendarTimeZone(options.timeZone);
  const quietHoursStart = options.quietHoursStart ?? 22;
  const quietHoursEnd = options.quietHoursEnd ?? 7;
  const busyPeriods = options.busy
    .map((busy) => ({
      start: new Date(busy.start),
      end: new Date(busy.end),
    }))
    .filter((busy) => !Number.isNaN(busy.start.getTime()) && !Number.isNaN(busy.end.getTime()))
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const slots: CalendarAvailabilitySlot[] = [];
  const durationMs = slotMinutes * 60_000;
  const stepMinutes = Math.min(slotMinutes, SLOT_STEP_MINUTES);
  const stepMs = stepMinutes * 60_000;
  let cursor = roundUpToInterval(options.from, stepMinutes);

  while (cursor.getTime() + durationMs <= options.to.getTime() && slots.length < limit) {
    const end = new Date(cursor.getTime() + durationMs);
    if (isSlotAvailable(cursor, end, timeZone, quietHoursStart, quietHoursEnd, busyPeriods)) {
      slots.push({
        start: cursor.toISOString(),
        end: end.toISOString(),
      });
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}

function isCalendarReconnectError(error: any): boolean {
  if (typeof error?.message === 'string' && error.message.startsWith('REAUTH_REQUIRED:')) {
    return true;
  }

  const status = error?.response?.status ?? error?.status;
  const reason = error?.response?.data?.error?.errors?.[0]?.reason ?? error?.errors?.[0]?.reason;

  if (status === 401) {
    return true;
  }

  if (status === 403 && typeof reason === 'string' && reason === 'insufficientPermissions') {
    return true;
  }

  return false;
}

export class CalendarService {
  private async getClient(accountId: string): Promise<calendar_v3.Calendar> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    if (!account.accessTokenEncrypted || !account.refreshTokenEncrypted) {
      throw new Error(`REAUTH_REQUIRED:${account.emailAddress}`);
    }

    const accessToken = decrypt(account.accessTokenEncrypted);
    const refreshToken = decrypt(account.refreshTokenEncrypted);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.tokenExpiresAt?.getTime(),
    });

    const now = Date.now();
    const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
    if (expiresAt && expiresAt - now < 5 * 60 * 1000) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const updateData: Record<string, any> = {};
        if (credentials.access_token) updateData.accessTokenEncrypted = encrypt(credentials.access_token);
        if (credentials.refresh_token) updateData.refreshTokenEncrypted = encrypt(credentials.refresh_token);
        if (credentials.expiry_date) updateData.tokenExpiresAt = new Date(credentials.expiry_date);
        if (Object.keys(updateData).length > 0) {
          await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
        }
        oauth2Client.setCredentials(credentials);
      } catch (error: any) {
        const status = error?.response?.status ?? error?.status;
        if (status === 400 || status === 401) {
          await prisma.emailAccount.update({
            where: { id: accountId },
            data: { isActive: false, syncError: 'OAuth token revoked — please reconnect this account' },
          });
          actionLogService.log(account.userId, 'token_revoked', 'account', accountId, {
            email: account.emailAddress,
            reason: 'OAuth token refresh failed while loading Google Calendar',
          }).catch(() => {});
          throw new Error(`REAUTH_REQUIRED:${account.emailAddress}`);
        }
      }
    }

    oauth2Client.on('tokens', async (tokens) => {
      const updateData: Record<string, any> = {};
      if (tokens.access_token) updateData.accessTokenEncrypted = encrypt(tokens.access_token);
      if (tokens.refresh_token) updateData.refreshTokenEncrypted = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) updateData.tokenExpiresAt = new Date(tokens.expiry_date);
      if (Object.keys(updateData).length > 0) {
        await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
      }
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  async getAvailability(
    accountId: string,
    options: AvailabilityOptions = {}
  ): Promise<CalendarUnsupportedResult | (CalendarReconnectResult & { slots: [] }) | CalendarAvailabilitySuccessResult> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        userId: true,
      },
    });

    const timeZone = resolveCalendarTimeZone(options.timeZone);

    if (account.provider !== 'gmail') {
      return {
        supported: false,
        requiresReconnect: false,
        reason: 'Kalenderförslag stöds just nu bara för Gmail-konton.',
        timeZone,
      };
    }

    const days = clampCalendarDays(options.days);
    const limit = clampCalendarLimit(options.limit);
    const slotMinutes = clampSlotMinutes(options.slotMinutes);

    const settings = await prisma.userSettings.findUnique({
      where: { userId: account.userId },
      select: { quietHoursStart: true, quietHoursEnd: true },
    });

    const windowStart = new Date();
    const windowEnd = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);

    try {
      const calendar = await this.getClient(accountId);
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: windowStart.toISOString(),
          timeMax: windowEnd.toISOString(),
          items: [{ id: 'primary' }],
        },
      });

      const busy = (response.data.calendars?.primary?.busy ?? [])
        .filter((item): item is { start: string; end: string } => Boolean(item.start && item.end))
        .map((item) => ({
          start: item.start,
          end: item.end,
        }));

      return {
        supported: true,
        requiresReconnect: false,
        slots: buildAvailabilitySlots({
          busy,
          from: windowStart,
          to: windowEnd,
          slotMinutes,
          limit,
          quietHoursStart: options.quietHoursStart ?? settings?.quietHoursStart,
          quietHoursEnd: options.quietHoursEnd ?? settings?.quietHoursEnd,
          timeZone,
        }),
        timeZone,
        days,
        limit,
        slotMinutes,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };
    } catch (error: any) {
      if (isCalendarReconnectError(error)) {
        return {
          supported: true,
          requiresReconnect: true,
          slots: [],
          reason: 'Google Calendar-åtkomst saknas eller behöver kopplas om för det här kontot.',
          timeZone,
        };
      }

      throw error;
    }
  }

  async createTentativeEvent(
    accountId: string,
    options: CreateTentativeEventOptions
  ): Promise<CalendarUnsupportedResult | CalendarReconnectResult | CalendarCreateEventSuccessResult> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        userId: true,
        emailAddress: true,
      },
    });

    const timeZone = resolveCalendarTimeZone(options.timeZone);

    if (account.provider !== 'gmail') {
      return {
        supported: false,
        requiresReconnect: false,
        reason: 'Google Calendar-reservation stöds just nu bara för Gmail-konton.',
        timeZone,
      };
    }

    const start = new Date(options.start);
    const end = new Date(options.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new Error('Invalid calendar event time range');
    }
    if (start <= new Date()) {
      throw new Error('Cannot create a calendar event in the past');
    }

    try {
      const calendar = await this.getClient(accountId);
      const response = await calendar.events.insert({
        calendarId: 'primary',
        sendUpdates: 'none',
        requestBody: {
          summary: options.summary ?? buildCalendarEventSummary(),
          description: options.description ?? undefined,
          start: {
            dateTime: start.toISOString(),
            timeZone,
          },
          end: {
            dateTime: end.toISOString(),
            timeZone,
          },
          status: 'tentative',
          transparency: 'opaque',
          attendeesOmitted: true,
          guestsCanInviteOthers: false,
          guestsCanModify: false,
        },
      });

      const event = response.data;
      if (!event.id || !event.start?.dateTime || !event.end?.dateTime) {
        throw new Error('Google Calendar did not return a complete event payload');
      }

      await actionLogService.log(account.userId, 'calendar_hold_created', 'calendar_event', event.id, {
        accountId,
        accountEmail: account.emailAddress,
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime,
        htmlLink: event.htmlLink ?? null,
      }).catch(() => {});

      return {
        supported: true,
        requiresReconnect: false,
        timeZone,
        event: {
          id: event.id,
          htmlLink: event.htmlLink ?? null,
          summary: event.summary ?? null,
          start: event.start.dateTime,
          end: event.end.dateTime,
          status: event.status ?? null,
        },
      };
    } catch (error: any) {
      if (isCalendarReconnectError(error)) {
        return {
          supported: true,
          requiresReconnect: true,
          reason: 'Google Calendar skrivåtkomst saknas eller behöver kopplas om för det här kontot.',
          timeZone,
        };
      }

      throw error;
    }
  }

  async releaseTentativeEvent(
    accountId: string,
    eventId: string,
    options: { timeZone?: string } = {}
  ): Promise<CalendarUnsupportedResult | CalendarReconnectResult | CalendarReleaseEventSuccessResult> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        provider: true,
        userId: true,
        emailAddress: true,
      },
    });

    const timeZone = resolveCalendarTimeZone(options.timeZone);

    if (account.provider !== 'gmail') {
      return {
        supported: false,
        requiresReconnect: false,
        reason: 'Google Calendar-reservationer stöds just nu bara för Gmail-konton.',
        timeZone,
      };
    }

    try {
      const calendar = await this.getClient(accountId);
      const existing = await calendar.events.get({
        calendarId: 'primary',
        eventId,
      });

      if (!isManagedTentativeHold(existing.data)) {
        throw new Error('Only tentative Mail OS reservations can be released here');
      }

      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'none',
      });

      await actionLogService.log(account.userId, 'calendar_hold_released', 'calendar_event', eventId, {
        accountId,
        accountEmail: account.emailAddress,
        summary: existing.data.summary ?? null,
        start: existing.data.start?.dateTime ?? null,
        end: existing.data.end?.dateTime ?? null,
      }).catch(() => {});

      return {
        supported: true,
        requiresReconnect: false,
        released: true,
        eventId,
        timeZone,
      };
    } catch (error: any) {
      if (isCalendarReconnectError(error)) {
        return {
          supported: true,
          requiresReconnect: true,
          reason: 'Google Calendar skrivåtkomst saknas eller behöver kopplas om för det här kontot.',
          timeZone,
        };
      }

      const status = error?.response?.status ?? error?.status;
      if (status === 404) {
        throw new Error('Calendar event not found');
      }

      throw error;
    }
  }
}

export const calendarService = new CalendarService();
