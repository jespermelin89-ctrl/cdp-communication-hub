/**
 * Brain Core Webhook Service — Sprint 6
 *
 * Sends outbound events to BRAIN-OS / Brain Core when important things happen
 * in the mail triage pipeline.
 *
 * Events:
 *   triage.high_priority   — high-priority thread kept in inbox
 *   triage.unknown_sender  — unknown sender moved to Granskning
 *   triage.completed       — triage round complete (summary)
 *   draft.ready            — AI auto-draft created, awaiting approval
 *
 * If BRAIN_CORE_WEBHOOK_URL is not set, all calls are silent no-ops.
 * Errors are logged but never re-thrown — webhook failures must not affect the mail pipeline.
 */

import crypto from 'crypto';
import { env } from '../config/env';

export type BrainCoreEventType =
  | 'triage.high_priority'
  | 'triage.unknown_sender'
  | 'triage.completed'
  | 'draft.ready';

export interface BrainCoreEventContext {
  organizationId?: string;
  userId?: string;
  accountId?: string;
  threadId?: string;
  gmailThreadId?: string;
  draftId?: string;
}

export interface BrainCoreEvent {
  type: BrainCoreEventType;
  data: Record<string, unknown>;
  context?: BrainCoreEventContext;
  eventId?: string;
}

function normalizeContextValue(value: string | undefined | null): string | null {
  return value && value.trim().length > 0 ? value : null;
}

/**
 * Send a single event to Brain Core.
 * Fire-and-forget safe: never throws.
 */
export async function notifyBrainCore(event: BrainCoreEvent): Promise<void> {
  const webhookUrl = env.BRAIN_CORE_WEBHOOK_URL;
  if (!webhookUrl) return; // Not configured — skip silently

  const payload = {
    contract_version: 'brain-core-webhook.v1',
    event_id: event.eventId ?? crypto.randomUUID(),
    event: event.type,
    data: event.data,
    context: {
      organization_id: normalizeContextValue(event.context?.organizationId ?? env.BRAIN_CORE_ORGANIZATION_ID ?? null),
      user_id: normalizeContextValue(event.context?.userId ?? null),
      account_id: normalizeContextValue(event.context?.accountId ?? null),
      thread_id: normalizeContextValue(event.context?.threadId ?? null),
      gmail_thread_id: normalizeContextValue(event.context?.gmailThreadId ?? null),
      draft_id: normalizeContextValue(event.context?.draftId ?? null),
    },
    timestamp: new Date().toISOString(),
    source: 'cdp-communication-hub',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.BRAIN_CORE_WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = env.BRAIN_CORE_WEBHOOK_SECRET;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(
        `[BrainCoreWebhook] ${event.type} → HTTP ${response.status} from ${webhookUrl}`
      );
    } else {
      console.log(`[BrainCoreWebhook] Sent: ${event.type}`);
    }
  } catch (err: any) {
    // Network errors (Brain Core offline, DNS failure, etc.) must not crash triage
    console.warn(`[BrainCoreWebhook] Failed to send ${event.type}: ${err?.message}`);
  }
}
