/**
 * CDP Communication Hub - Fastify App Factory
 *
 * Creates and configures the Fastify instance with all plugins, middleware,
 * hooks, and routes. Does NOT call fastify.listen() or start background
 * schedulers — that is left to the caller (src/index.ts for standalone,
 * api/index.ts for Vercel serverless).
 */

import crypto from 'crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { prisma } from './config/database';
import { errorHandler } from './middleware/error.middleware';

// Routes
import { authRoutes } from './routes/auth';
import { accountRoutes } from './routes/accounts';
import { threadRoutes } from './routes/threads';
import { draftRoutes } from './routes/drafts';
import { aiRoutes } from './routes/ai';
import { commandCenterRoutes } from './routes/command-center';
import { actionLogRoutes } from './routes/action-logs';
import { providerRoutes } from './routes/providers';
import categoryRoutes from './routes/categories';
import chatRoutes from './routes/chat';
import { brainCoreRoutes } from './routes/brain-core';
import { brainCoreConnectorRoutes } from './routes/brain-core-connector';
import { brainSummaryRoutes } from './routes/brain-summary';
import agentRoutes from './routes/agent';
import { pushRoutes } from './routes/push';
import { docsRoutes } from './routes/docs';
import { openApiRoutes } from './routes/openapi';
import { webhookRoutes } from './routes/webhooks';
import { followUpRoutes } from './routes/follow-ups';
import { templatesRoutes } from './routes/templates';
import { analyticsRoutes } from './routes/analytics';
import { savedViewsRoutes } from './routes/views';
import { labelRoutes } from './routes/labels';
import { searchRoutes } from './routes/search';
import { eventRoutes } from './routes/events';
import { calendarRoutes } from './routes/calendar';
import { reviewRoutes } from './routes/review';
import { triageRoutes } from './routes/triage';
import { mcpRoutes } from './routes/mcp';

export async function createApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: env.NODE_ENV === 'development'
      ? {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
          },
        }
      : { level: 'info' },
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],      // needed for email rendering
        imgSrc: ["'self'", 'data:', 'https:'],         // allow external images in emails
        scriptSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // allow loading email images cross-origin
  });

  // Cookie plugin — required for CSRF double-submit
  await fastify.register(cookie);

  // Multipart — file uploads (max 25 MB, max 10 files per request)
  await fastify.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 10,
    },
  });

  // Rate limiting — 200 req/min per IP (CORS preflight + normal traffic)
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // Skip rate limiting for health checks
    skipOnError: true,
    keyGenerator: (request) => request.ip,
  });

  // CORS — allow all origins. API is protected by API key (agent) and
  // session cookie (frontend), so origin restriction adds no security.
  // Needed for Claude Cowork artifacts which run in sandboxed iframes
  // with unpredictable origins (null, blob:, CDN subdomains).
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Global error handler
  fastify.setErrorHandler(errorHandler);

  // Health check (root — Render/Vercel uses this)
  fastify.get('/health', async () => {
    let db = 'unknown';
    let activeAccounts = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'ok';
      activeAccounts = await prisma.emailAccount.count({ where: { isActive: true } });
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      activeAccounts,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // Response time logging for slow requests (> 2s)
  fastify.addHook('onResponse', async (request, reply) => {
    const elapsed = reply.elapsedTime;
    if (elapsed > 2000) {
      request.log.warn({ method: request.method, url: request.url, ms: Math.round(elapsed) }, 'Slow request');
    }
  });

  // CSRF double-submit cookie — set cookie on every response, validate on mutations
  fastify.addHook('onSend', async (request, reply) => {
    // Ensure a CSRF token cookie exists (httpOnly: false so JS can read it)
    const existing = request.cookies?.['csrf_token'];
    if (!existing) {
      const token = crypto.randomUUID();
      reply.setCookie('csrf_token', token, {
        path: '/',
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: false,
      });
    }
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (safeMethod) return;

    // API-key authenticated requests (agent/Amanda) are exempt — no browser session
    if (request.headers['x-api-key']) return;

    // Webhook routes are exempt — they receive from external services (Google Pub/Sub)
    if (request.url.includes('/webhooks/')) return;

    // Admin login verification is called server-to-server from Next.js — no CSRF cookie available
    if (request.url.includes('/auth/admin/verify')) return;

    const cookieToken = request.cookies?.['csrf_token'];
    const headerToken = request.headers['x-csrf-token'] as string | undefined;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return reply.code(403).send({
        success: false,
        error_code: 'AUTH_CSRF_MISMATCH',
        error: 'Forbidden',
        message: 'CSRF token mismatch — resend with X-CSRF-Token header',
      });
    }
  });

  // Register all routes under /api/v1
  await fastify.register(async (api) => {
    // Health check (also accessible through Vercel proxy at /api/v1/health)
    api.get('/health', async () => {
      let db = 'unknown';
      let activeAccounts = 0;
      try {
        await prisma.$queryRaw`SELECT 1`;
        db = 'ok';
        activeAccounts = await prisma.emailAccount.count({ where: { isActive: true } });
      } catch {
        db = 'error';
      }
      return {
        status: db === 'ok' ? 'ok' : 'degraded',
        db,
        activeAccounts,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    });

    await api.register(authRoutes);
    await api.register(accountRoutes);
    await api.register(threadRoutes);
    await api.register(draftRoutes);
    await api.register(aiRoutes);
    await api.register(commandCenterRoutes);
    await api.register(actionLogRoutes);
    await api.register(providerRoutes);
    await api.register(categoryRoutes);
    await api.register(chatRoutes);
    await api.register(brainCoreRoutes);
    await api.register(brainCoreConnectorRoutes);
    await api.register(brainSummaryRoutes);
    await api.register(agentRoutes, { prefix: '/agent' });
    await api.register(pushRoutes);
    await api.register(docsRoutes);
    await api.register(openApiRoutes);  // OpenAPI spec for AI agent discovery
    await api.register(webhookRoutes); // No auth — receives from Google Pub/Sub
    await api.register(followUpRoutes);
    await api.register(templatesRoutes);
    await api.register(analyticsRoutes);
    await api.register(savedViewsRoutes);
    await api.register(labelRoutes);
    await api.register(searchRoutes);
    await api.register(eventRoutes);
    await api.register(calendarRoutes);
    await api.register(reviewRoutes);  // Sprint 4: Granskning-vy + regelforslag
    await api.register(triageRoutes);  // Sprint 7: Triage report
  }, { prefix: '/api/v1' });

  // MCP Streamable HTTP — remote MCP server endpoint (outside /api/v1)
  // Allows Cowork/Claude Code to connect via URL instead of local process
  await fastify.register(mcpRoutes);

  return fastify;
}
