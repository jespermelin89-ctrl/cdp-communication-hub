/**
 * Global error handler for Fastify.
 * Returns structured error responses with machine-readable error_code.
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { ErrorCodes } from '../utils/error-codes';

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
      success: false,
      error_code: ErrorCodes.AUTH_REAUTH_REQUIRED,
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

  // Map HTTP status to error_code
  const errorCode = statusCode === 429 ? ErrorCodes.RATE_LIMITED
    : statusCode === 403 ? ErrorCodes.AUTH_CSRF_MISMATCH
    : statusCode === 401 ? ErrorCodes.AUTH_MISSING_JWT
    : statusCode === 404 ? ErrorCodes.RESOURCE_NOT_FOUND
    : statusCode >= 500 ? ErrorCodes.INTERNAL_ERROR
    : ErrorCodes.VALIDATION_ERROR;

  reply.code(statusCode).send({
    success: false,
    error_code: errorCode,
    error: error.name || 'Error',
    message,
    statusCode,
    requestId,
  });
}
