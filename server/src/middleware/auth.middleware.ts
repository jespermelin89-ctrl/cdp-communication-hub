/**
 * Authentication middleware - Verifies JWT on protected routes.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.service';
import { prisma } from '../config/database';
import { env } from '../config/env';

// Extend Fastify request with user info
declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // X-API-Key auth — for agent/Amanda calls that bypass OAuth
  const apiKey = request.headers['x-api-key'];
  if (apiKey && env.COMMAND_API_KEY && apiKey === env.COMMAND_API_KEY) {
    const account = await prisma.emailAccount.findFirst({ where: { isActive: true } });
    if (account) {
      request.userId = account.userId;
      request.userEmail = '';
      return;
    }
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Giltig API-nyckel men inga aktiva konton hittades.',
    });
  }

  // Standard JWT auth
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = authService.verifyJwt(token);

    request.userId = payload.userId;
    request.userEmail = payload.email;
  } catch (error: any) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token. Please re-authenticate.',
    });
  }
}
