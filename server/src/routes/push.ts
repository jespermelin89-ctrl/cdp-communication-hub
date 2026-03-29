/**
 * Web Push Subscription Routes
 *
 * POST /push/subscribe    — Save browser push subscription
 * DELETE /push/subscribe  — Remove subscription by endpoint
 * POST /push/test         — Send a test notification (dev only)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { sendPushToUser } from '../services/push.service';
import { env } from '../config/env';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function pushRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // POST /push/subscribe
  fastify.post('/push/subscribe', async (request, reply) => {
    const body = SubscribeBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid subscription', details: body.error.issues });
    }

    const { endpoint, keys } = body.data;

    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: request.userId, endpoint } },
      update: { p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: request.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    return reply.code(201).send({ ok: true });
  });

  // DELETE /push/subscribe
  fastify.delete('/push/subscribe', async (request, reply) => {
    const body = z.object({ endpoint: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'endpoint required' });

    await prisma.pushSubscription
      .deleteMany({
        where: { userId: request.userId, endpoint: body.data.endpoint },
      })
      .catch(() => {});

    return { ok: true };
  });

  // POST /push/test (dev only)
  fastify.post('/push/test', async (request, reply) => {
    if (env.NODE_ENV !== 'development') {
      return reply.code(403).send({ error: 'Only available in development' });
    }

    await sendPushToUser(request.userId, {
      title: '🔔 Testnotis',
      body: 'Web Push fungerar!',
      url: '/inbox',
    });

    return { ok: true };
  });
}
