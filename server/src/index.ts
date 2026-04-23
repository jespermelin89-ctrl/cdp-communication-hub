/**
 * CDP Communication Hub - Server Entry Point (Standalone)
 *
 * Imports the reusable Fastify app from ./app, then adds:
 *  - fastify.listen() to bind the port
 *  - Background sync scheduler (setInterval-based)
 *  - Graceful shutdown handlers
 *
 * For Vercel serverless deployment, see api/index.ts instead.
 */

import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { startSyncScheduler, stopSyncScheduler } from './services/sync-scheduler.service';
import { autoSeedBrainCore } from './utils/auto-seed';
import { validateEnv } from './utils/env-check';
import { createApp } from './app';

async function main() {
  // Validate environment before starting
  validateEnv();

  const fastify = await createApp();

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
  console.log(`[AI] Provider: ${env.AI_PROVIDER} | Groq: ${env.GROQ_API_KEY ? 'SET' : 'MISSING'} | Anthropic: ${env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'} | OpenAI: ${env.OPENAI_API_KEY ? 'SET' : 'MISSING'}`);

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
