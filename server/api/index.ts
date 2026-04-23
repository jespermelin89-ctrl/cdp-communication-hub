/**
 * Vercel Serverless Function — wraps the entire Fastify app.
 *
 * All HTTP requests are routed here via vercel.json.
 * The Fastify instance is created once (cold start) and reused
 * across subsequent invocations within the same Lambda container.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: any;

async function getApp() {
  if (!app) {
    require('dotenv').config();
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.ready();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastify = await getApp();
  await fastify.server.emit('request', req, res);
}
