/**
 * CDP Hub — Structured Error Codes
 *
 * Machine-readable error codes for AI agent consumption.
 * Every error response includes: { success: false, error_code, message, details? }
 *
 * Format: DOMAIN_SPECIFIC_ERROR (uppercase, underscore-separated)
 */

export const ErrorCodes = {
  // ── Auth ──────────────────────────────────────────────────────────────
  AUTH_MISSING_API_KEY: 'AUTH_MISSING_API_KEY',
  AUTH_INVALID_API_KEY: 'AUTH_INVALID_API_KEY',
  AUTH_MISSING_JWT: 'AUTH_MISSING_JWT',
  AUTH_INVALID_JWT: 'AUTH_INVALID_JWT',
  AUTH_EXPIRED_JWT: 'AUTH_EXPIRED_JWT',
  AUTH_CSRF_MISMATCH: 'AUTH_CSRF_MISMATCH',
  AUTH_REAUTH_REQUIRED: 'AUTH_REAUTH_REQUIRED',

  // ── Agent ─────────────────────────────────────────────────────────────
  AGENT_UNKNOWN_ACTION: 'AGENT_UNKNOWN_ACTION',
  AGENT_MISSING_PARAM: 'AGENT_MISSING_PARAM',
  AGENT_INVALID_PARAM: 'AGENT_INVALID_PARAM',
  AGENT_NOT_CONFIGURED: 'AGENT_NOT_CONFIGURED',
  AGENT_BATCH_TOO_LARGE: 'AGENT_BATCH_TOO_LARGE',
  AGENT_BATCH_EMPTY: 'AGENT_BATCH_EMPTY',

  // ── Resource ──────────────────────────────────────────────────────────
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // ── Account ───────────────────────────────────────────────────────────
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_NONE_ACTIVE: 'ACCOUNT_NONE_ACTIVE',

  // ── Thread ────────────────────────────────────────────────────────────
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',

  // ── Draft ─────────────────────────────────────────────────────────────
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  DRAFT_NOT_APPROVED: 'DRAFT_NOT_APPROVED',
  DRAFT_INVALID_STATUS: 'DRAFT_INVALID_STATUS',
  DRAFT_MISSING_RECIPIENTS: 'DRAFT_MISSING_RECIPIENTS',

  // ── Validation ────────────────────────────────────────────────────────
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_URL: 'INVALID_URL',

  // ── Gmail ─────────────────────────────────────────────────────────────
  GMAIL_API_ERROR: 'GMAIL_API_ERROR',
  GMAIL_LABEL_NOT_FOUND: 'GMAIL_LABEL_NOT_FOUND',

  // ── Database ──────────────────────────────────────────────────────────
  DATABASE_ERROR: 'DATABASE_ERROR',

  // ── AI ────────────────────────────────────────────────────────────────
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',

  // ── Rules ──────────────────────────────────────────────────────────────
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  RULE_DUPLICATE: 'RULE_DUPLICATE',
  RULE_INVALID_ACTION: 'RULE_INVALID_ACTION',

  // ── Unsubscribe ───────────────────────────────────────────────────────
  UNSUBSCRIBE_NOT_AVAILABLE: 'UNSUBSCRIBE_NOT_AVAILABLE',
  UNSUBSCRIBE_FAILED: 'UNSUBSCRIBE_FAILED',

  // ── General ───────────────────────────────────────────────────────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Create a structured error response body.
 * Agents can parse error_code without understanding Swedish messages.
 */
export function agentError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    success: false as const,
    error_code: code,
    error: message,       // human-readable (Swedish or English)
    ...(details ? { details } : {}),
  };
}
