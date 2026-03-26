/**
 * CDP Communication Hub - Server Entry Point
 *
 * AI-powered communication overlay on Gmail.
 * Draft-first, approval-required, logged actions, no auto-send/delete.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
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

async function main() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
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

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // Register all routes under /api/v1
  await fastify.register(async (api) => {
    // Health check (also accessible through Vercel proxy)
    api.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }));

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

  // Connect database AFTER server is listening
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.warn('⚠️ Server running without database. API routes requiring DB will fail.');
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      await fastify.close();
      await disconnectDatabase();
      process.exit(0);
    });
  });
}

main();
