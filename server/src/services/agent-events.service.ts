/**
 * Agent Event System — Webhooks + Job Tracking
 *
 * 1. Webhook registry: agents register URLs to receive events
 * 2. Event dispatch: internal code emits events, this service delivers them
 * 3. Job tracker: async operations get a job_id, agents can poll status
 *
 * Storage: in-memory (survives process lifetime, not restarts).
 * For CDP's scale (single-owner), this is sufficient.
 * Can be upgraded to DB-backed if needed.
 */

import crypto from 'crypto';

// ── Event Types ──────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'mail.received',
  'mail.classified',
  'draft.created',
  'draft.approved',
  'draft.sent',
  'triage.completed',
  'sync.completed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface AgentEvent {
  event: EventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// ── Webhook Registry ─────────────────────────────────────────────────────────

interface WebhookRegistration {
  id: string;
  url: string;
  events: EventType[];
  secret?: string;      // for HMAC-SHA256 verification
  created_at: string;
  last_delivery_at?: string;
  delivery_count: number;
  error_count: number;
  last_error?: string;
}

const webhooks = new Map<string, WebhookRegistration>();

export function registerWebhook(url: string, events: EventType[], secret?: string): WebhookRegistration {
  // Prevent duplicate URLs
  for (const wh of webhooks.values()) {
    if (wh.url === url) {
      // Update events instead of creating duplicate
      wh.events = events;
      if (secret) wh.secret = secret;
      return wh;
    }
  }

  const registration: WebhookRegistration = {
    id: crypto.randomUUID(),
    url,
    events,
    secret,
    created_at: new Date().toISOString(),
    delivery_count: 0,
    error_count: 0,
  };
  webhooks.set(registration.id, registration);
  return registration;
}

export function listWebhooks(): WebhookRegistration[] {
  return Array.from(webhooks.values());
}

export function deleteWebhook(id: string): boolean {
  return webhooks.delete(id);
}

/**
 * Dispatch an event to all subscribed webhooks.
 * Non-blocking — fires and forgets.
 */
export function dispatchEvent(event: AgentEvent): void {
  for (const wh of webhooks.values()) {
    if (!wh.events.includes(event.event)) continue;

    const payload = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CDP-Event': event.event,
      'X-CDP-Delivery-ID': crypto.randomUUID(),
    };

    // HMAC signature if secret is set
    if (wh.secret) {
      const signature = crypto.createHmac('sha256', wh.secret).update(payload).digest('hex');
      headers['X-CDP-Signature'] = `sha256=${signature}`;
    }

    fetch(wh.url, { method: 'POST', headers, body: payload })
      .then(() => {
        wh.delivery_count++;
        wh.last_delivery_at = new Date().toISOString();
      })
      .catch((err) => {
        wh.error_count++;
        wh.last_error = err?.message ?? 'Unknown error';
      });
  }
}

// ── Job Tracker ──────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface Job {
  id: string;
  action: string;
  status: JobStatus;
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

const jobs = new Map<string, Job>();

// Auto-cleanup: remove completed jobs older than 1 hour
const JOB_TTL_MS = 60 * 60 * 1000;

function cleanupOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if ((job.status === 'completed' || job.status === 'failed') && new Date(job.created_at).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createJob(action: string, params: Record<string, unknown>): string {
  cleanupOldJobs();
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    action,
    status: 'pending',
    params,
    created_at: new Date().toISOString(),
  });
  return id;
}

export function startJob(id: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = 'running';
    job.started_at = new Date().toISOString();
  }
}

export function completeJob(id: string, result: Record<string, unknown>): void {
  const job = jobs.get(id);
  if (job) {
    job.status = 'completed';
    job.result = result;
    job.completed_at = new Date().toISOString();
  }
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = 'failed';
    job.error = error;
    job.completed_at = new Date().toISOString();
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(limit = 20): Job[] {
  return Array.from(jobs.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
