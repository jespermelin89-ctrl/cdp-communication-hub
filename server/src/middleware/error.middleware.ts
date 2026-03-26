/**
 * Global error handler for Fastify.
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode || 500;

  // Log all 500 errors
  if (statusCode >= 500) {
    request.log.error(error, 'Internal server error');
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
  });
}
