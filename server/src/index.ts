/**
 * CDP Communication Hub - Server Entry Point
 *
 * AI-powered communication overlay on Gmail.
 * Draft-first, approval-required, logged actions, no auto-send/delete.
 */

import crypto from 'crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase, prisma } from './config/database';
import { errorHandler } from './middleware/error.middleware';
import { startSyncScheduler, stopSyncScheduler } from './services/sync-scheduler.service';
import { autoSeedBrainCore } from './utils/auto-seed';

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
import { brainSummaryRoutes } from './routes/brain-summary';
import agentRoutes from './routes/agent';
import { pushRoutes } from './routes/push';
import { docsRoutes } from './routes/docs';

async function main() {
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

  // Rate limiting — 200 req/min per IP (CORS preflight + normal traffic)
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    // Skip rate limiting for health checks
    skipOnError: true,
    keyGenerator: (request) => request.ip,
  });

  // CORS — support main URL + Vercel preview deploys
  await fastify.register(cors, {
    origin: (origin, cb) => {
      const allowed = env.FRONTEND_URL;
      if (!origin || origin === allowed || origin.endsWith('.vercel.app')) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  // Global error handler
  fastify.setErrorHandler(errorHandler);

  // Health check (root — Render uses this)
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

    const cookieToken = request.cookies?.['csrf_token'];
    const headerToken = request.headers['x-csrf-token'] as string | undefined;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return reply.code(403).send({
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
    await api.register(brainSummaryRoutes);
    await api.register(agentRoutes, { prefix: '/agent' });
    await api.register(pushRoutes);
    await api.register(docsRoutes);
  }, { prefix: '/api/v1' });

  // Start server FIRST (so Render sees the port binding)
  try {
    await fastify.listen({ port: env.PORT, host: env.HOST });
    console.log(`
╔═══════════════════════════════════════════════╗
║   CDP Communication Hub - Server Running      ║
║   Port: ${env.PORT}                                ║
║   Mode: ${env.NODE_ENV.padEnd(11)}                     ║
║   API:  http://${env.HOST}:${env.PORT}/api/v1         ║
╚═══════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Log AI provider status
  console.log(`[AI] Provider: ${env.AI_PROVIDER} | Groq: ${env.GROQ_API_KEY ? 'SET' : 'MISSING'} | Anthropic: ${env.ANTHROPIC_API_KEY ? `SET (${env.ANTHROPIC_API_KEY.slice(0, 8)}…)` : 'MISSING'} | OpenAI: ${env.OPENAI_API_KEY ? 'SET' : 'MISSING'}`);

  // Connect database AFTER server is listening
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.warn('⚠️ Server running without database. API routes requiring DB will fail.');
  } else {
    // Start background sync scheduler once DB is confirmed ready
    startSyncScheduler();
    // Auto-seed Brain Core if empty (runs once, safe on every restart)
    autoSeedBrainCore().catch((err) => console.error('[auto-seed] Fel:', err));
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      stopSyncScheduler();
      await fastify.close();
      await disconnectDatabase();
      process.exit(0);
    });
  });
}

main();
