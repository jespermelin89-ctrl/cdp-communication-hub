import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { authService } from '../services/auth.service';
import {
  buildCalendarEventDescription,
  buildCalendarEventSummary,
  calendarService,
  type CalendarInviteResponseStatus,
} from '../services/calendar.service';
import { sanitizeReturnTo } from '../utils/return-to';

export async function calendarRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/calendar/availability', async (request, reply) => {
    const schema = z.object({
      account_id: z.string().min(1),
      days: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      slot_minutes: z.coerce.number().optional(),
      time_zone: z.string().optional(),
      return_to: z.string().optional(),
    });

    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid query',
        details: parsed.error.issues,
      });
    }

    const { account_id, return_to, ...options } = parsed.data;

    const account = await prisma.emailAccount.findFirst({
      where: {
        id: account_id,
        userId: request.userId,
      },
      select: { id: true },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const result = await calendarService.getAvailability(account.id, {
      days: options.days,
      limit: options.limit,
      slotMinutes: options.slot_minutes,
      timeZone: options.time_zone,
    });

    if (result.supported && result.requiresReconnect) {
      return {
        ...result,
        reauthUrl: authService.getReauthUrl(account.id, {
          feature: 'calendar',
          returnTo: sanitizeReturnTo(return_to),
        }),
      };
    }

    return result;
  });

  fastify.post('/calendar/events', async (request, reply) => {
    const schema = z.object({
      account_id: z.string().min(1),
      thread_id: z.string().min(1).optional(),
      start: z.string().min(1),
      end: z.string().min(1),
      time_zone: z.string().optional(),
      return_to: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { account_id, thread_id, start, end, time_zone, return_to } = parsed.data;

    const account = await prisma.emailAccount.findFirst({
      where: {
        id: account_id,
        userId: request.userId,
      },
      select: { id: true, emailAddress: true },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    let thread:
      | {
          id: string;
          subject: string | null;
          participantEmails: string[];
        }
      | null = null;

    if (thread_id) {
      thread = await prisma.emailThread.findFirst({
        where: {
          id: thread_id,
          accountId: account.id,
          account: { userId: request.userId },
        },
        select: {
          id: true,
          subject: true,
          participantEmails: true,
        },
      });

      if (!thread) {
        return reply.code(404).send({ error: 'Thread not found' });
      }
    }

    const result = await calendarService.createTentativeEvent(account.id, {
      start,
      end,
      timeZone: time_zone,
      summary: buildCalendarEventSummary(thread?.subject),
      description: buildCalendarEventDescription({
        threadSubject: thread?.subject,
        participants: (thread?.participantEmails ?? []).filter((email) => email !== account.emailAddress),
      }),
    });

    if (result.supported && result.requiresReconnect) {
      return {
        ...result,
        reauthUrl: authService.getReauthUrl(account.id, {
          feature: 'calendar_write',
          returnTo: sanitizeReturnTo(return_to),
        }),
      };
    }

    return result;
  });

  fastify.post('/calendar/events/release', async (request, reply) => {
    const schema = z.object({
      account_id: z.string().min(1),
      event_id: z.string().min(1),
      time_zone: z.string().optional(),
      return_to: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { account_id, event_id, time_zone, return_to } = parsed.data;

    const account = await prisma.emailAccount.findFirst({
      where: {
        id: account_id,
        userId: request.userId,
      },
      select: { id: true },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    try {
      const result = await calendarService.releaseTentativeEvent(account.id, event_id, {
        timeZone: time_zone,
      });

      if (result.supported && result.requiresReconnect) {
        return {
          ...result,
          reauthUrl: authService.getReauthUrl(account.id, {
            feature: 'calendar_write',
            returnTo: sanitizeReturnTo(return_to),
          }),
        };
      }

      return result;
    } catch (error: any) {
      const message = error?.message ?? 'Could not release calendar event';
      if (message === 'Calendar event not found') {
        return reply.code(404).send({ error: message });
      }

      if (message === 'Only tentative Mail OS reservations can be released here') {
        return reply.code(400).send({ error: message });
      }

      throw error;
    }
  });

  fastify.post('/calendar/invites/respond', async (request, reply) => {
    const schema = z.object({
      account_id: z.string().min(1),
      invite_uid: z.string().min(1),
      invite_start: z.string().optional(),
      response_status: z.enum(['accepted', 'declined']),
      time_zone: z.string().optional(),
      return_to: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const {
      account_id,
      invite_uid,
      invite_start,
      response_status,
      time_zone,
      return_to,
    } = parsed.data;

    const account = await prisma.emailAccount.findFirst({
      where: {
        id: account_id,
        userId: request.userId,
      },
      select: { id: true },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    try {
      const result = await calendarService.respondToInvite(account.id, {
        inviteUid: invite_uid,
        inviteStart: invite_start,
        responseStatus: response_status as CalendarInviteResponseStatus,
        timeZone: time_zone,
      });

      if (result.supported && result.requiresReconnect) {
        return {
          ...result,
          reauthUrl: authService.getReauthUrl(account.id, {
            feature: 'calendar_write',
            returnTo: sanitizeReturnTo(return_to),
          }),
        };
      }

      return result;
    } catch (error: any) {
      const message = error?.message ?? 'Could not respond to calendar invite';
      if (message === 'Calendar invite not found') {
        return reply.code(404).send({ error: message });
      }

      throw error;
    }
  });
}
