/**
 * Agent Auth Service — Multi-key support with audit logging
 *
 * Supports both the legacy single COMMAND_API_KEY and named agent keys.
 * Each key has a label, optional rate limit, and request tracking.
 *
 * Named keys are stored in AGENT_API_KEYS env var as JSON:
 *   [{"label":"amanda","key":"ak_abc123"},{"label":"brain-os","key":"ak_def456"}]
 *
 * Falls back to COMMAND_API_KEY for backward compatibility.
 */

import { env } from '../config/env';

interface AgentKey {
  label: string;
  key: string;
  rate_limit?: number;  // requests per minute (0 = unlimited)
}

interface AgentRequestLog {
  agent: string;
  action: string;
  timestamp: string;
  success: boolean;
  duration_ms?: number;
}

// In-memory rate limiting
const rateLimitState = new Map<string, { count: number; window_start: number }>();

// Circular buffer for audit log (last 500 requests)
const auditLog: AgentRequestLog[] = [];
const MAX_AUDIT_LOG = 500;

// Parse named keys from env
function getNamedKeys(): AgentKey[] {
  const raw = process.env.AGENT_API_KEYS;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Validate an API key and return the agent label.
 * Returns null if invalid.
 */
export function validateAgentKey(key: string): { valid: boolean; agent: string; rateLimited?: boolean } {
  // Check named keys first
  const namedKeys = getNamedKeys();
  const namedMatch = namedKeys.find((k) => k.key === key);
  if (namedMatch) {
    // Rate limit check
    if (namedMatch.rate_limit && namedMatch.rate_limit > 0) {
      const now = Date.now();
      const state = rateLimitState.get(namedMatch.label);
      if (state && now - state.window_start < 60000) {
        if (state.count >= namedMatch.rate_limit) {
          return { valid: true, agent: namedMatch.label, rateLimited: true };
        }
        state.count++;
      } else {
        rateLimitState.set(namedMatch.label, { count: 1, window_start: now });
      }
    }
    return { valid: true, agent: namedMatch.label };
  }

  // Fall back to legacy single key
  if (env.COMMAND_API_KEY && key === env.COMMAND_API_KEY) {
    return { valid: true, agent: 'default' };
  }

  return { valid: false, agent: 'unknown' };
}

/**
 * Log an agent request for audit trail.
 */
export function logAgentRequest(agent: string, action: string, success: boolean, durationMs?: number): void {
  if (auditLog.length >= MAX_AUDIT_LOG) {
    auditLog.shift();
  }
  auditLog.push({
    agent,
    action,
    timestamp: new Date().toISOString(),
    success,
    duration_ms: durationMs,
  });
}

/**
 * Get the audit log (most recent first).
 */
export function getAuditLog(limit = 50, agent?: string): AgentRequestLog[] {
  let logs = [...auditLog].reverse();
  if (agent) {
    logs = logs.filter((l) => l.agent === agent);
  }
  return logs.slice(0, limit);
}

/**
 * Get per-agent stats.
 */
export function getAgentStats(): Record<string, { total: number; errors: number; last_seen: string | null }> {
  const stats: Record<string, { total: number; errors: number; last_seen: string | null }> = {};
  for (const log of auditLog) {
    if (!stats[log.agent]) {
      stats[log.agent] = { total: 0, errors: 0, last_seen: null };
    }
    stats[log.agent].total++;
    if (!log.success) stats[log.agent].errors++;
    stats[log.agent].last_seen = log.timestamp;
  }
  return stats;
}
