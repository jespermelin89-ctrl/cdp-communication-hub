/**
 * Global error handler for Fastify.
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = (request.id as string) || crypto.randomUUID().slice(0, 8);

  // REAUTH_REQUIRED — OAuth token revoked for a Gmail account
  if (error.message?.startsWith('REAUTH_REQUIRED:')) {
    const email = error.message.slice('REAUTH_REQUIRED:'.length);
    return reply.code(401).send({
      error: 'REAUTH_REQUIRED',
      reauth: true,
      message: `OAuth token revoked — reconnect the account: ${email}`,
      email,
      requestId,
    });
  }

  const statusCode = error.statusCode || 500;
  const userId = (request as any).userId || 'anonymous';

  // Log all 500 errors with structured context
  if (statusCode >= 500) {
    request.log.error({ err: error, requestId, userId }, 'Internal server error');
  }

  // Don't leak internal error details in production
  const message =
    process.env.NODE_ENV === 'production' && statusCode >= 500
      ? 'Internal server error'
      : error.message;

  reply.code(statusCode).send({
    error: error.name || 'Error',
    message,
    statusCode,
    requestId,
  });
}
