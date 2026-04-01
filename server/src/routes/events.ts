/**
 * SSE Events — Sprint 4
 *
 * GET /events/stream?token={jwt}
 * Server-Sent Events endpoint for real-time inbox updates.
 *
 * Emits:
 *   thread:new        — new thread synced
 *   thread:updated    — thread classification/priority changed
 *   draft:status      — draft status changed
 *   sync:complete     — sync cycle done
 *   notification      — generic push notification
 *   thread:unsnoozed  — thread un-snoozed
 */

import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Connection registry: userId → Set of response writers
const connections = new Map<string, Set<(event: string, data: unknown) => void>>();

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 50;

/**
 * Emit an event to all open SSE connections for a user.
 */
export function emitToUser(userId: string, event: string, data: unknown) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;
  for (const send of userConnections) {
    try {
      send(event, data);
    } catch {
      // Connection likely closed — will be cleaned up on next heartbeat
    }
  }
}

export async function eventRoutes(fastify: FastifyInstance) {
  /**
   * GET /events/stream?token={jwt}
   * Auth via JWT query param so EventSource (no custom headers) can auth.
   */
  fastify.get('/events/stream', async (request, reply) => {
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.code(401).send({ error: 'Missing token' });
    }

    let userId: string;
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as { userId?: string; sub?: string };
      userId = decoded.userId ?? decoded.sub ?? '';
      if (!userId) throw new Error('No userId');
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    // Limit connections per user
    if (!connections.has(userId)) connections.set(userId, new Set());
    const userConns = connections.get(userId)!;
    if (userConns.size >= MAX_CONNECTIONS_PER_USER) {
      return reply.code(429).send({ error: 'Too many connections' });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering
    });

    // Helper to write an SSE event
    function send(event: string, data: unknown) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      reply.raw.write(payload);
    }

    // Register connection
    userConns.add(send);

    // Send initial connected event
    send('connected', { userId, timestamp: new Date().toISOString() });

    // Heartbeat
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(':keepalive\n\n');
      } catch {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    function cleanup() {
      clearInterval(heartbeat);
      userConns.delete(send);
      if (userConns.size === 0) connections.delete(userId);
    }

    // Cleanup on client disconnect
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    // Keep the connection open (never resolve)
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
      request.raw.on('error', resolve);
    });
  });
}
