/**
 * Authentication middleware - Verifies JWT on protected routes.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.service';

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
