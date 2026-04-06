/**
 * Webhook routes — receives push notifications from external services.
 *
 * POST /webhooks/gmail — Google Cloud Pub/Sub push for Gmail notifications.
 *
 * NOTE: This route intentionally has NO auth middleware.
 * Google Cloud Pub/Sub sends unauthenticated POST requests.
 * Verification relies on the GOOGLE_PUBSUB_VERIFICATION_TOKEN env var
 * (bearer token set on the Pub/Sub push subscription).
 *
 * Flow:
 *  1. Validate Pub/Sub bearer token (if GOOGLE_PUBSUB_VERIFICATION_TOKEN is set)
 *  2. Decode base64 message data → { emailAddress, historyId }
 *  3. gmailPushService.handleNotification() — incremental Gmail sync
 *  4. autoTriageNewThreads() — fire-and-forget triage on newly synced threads
 */

import { FastifyInstance } from 'fastify';
import { gmailPushService } from '../services/gmail-push.service';
import { autoTriageNewThreads } from '../services/sync-scheduler.service';
import { env } from '../config/env';

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/gmail
   *
   * Pub/Sub sends:
   * {
   *   "message": {
   *     "data": "<base64-encoded JSON>",   // { emailAddress, historyId }
   *     "messageId": "...",
   *     "publishTime": "..."
   *   },
   *   "subscription": "projects/.../subscriptions/..."
   * }
   *
   * Always respond 200 — Google retries on non-2xx.
   */
  fastify.post('/webhooks/gmail', {
    config: { skipCsrf: true }, // mark for our CSRF hook to skip
  }, async (request, reply) => {
    try {
      // Verify Pub/Sub push token if configured
      const verificationToken = env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
      if (verificationToken) {
        const authHeader = request.headers['authorization'];
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (bearerToken !== verificationToken) {
          fastify.log.warn('[GmailPush] Invalid verification token — rejecting');
          return reply.code(200).send(); // 200 to prevent Google retries
        }
      }

      const body = request.body as any;
      const message = body?.message;

      if (!message?.data) {
        // Acknowledge empty/malformed messages so Google stops retrying
        return reply.code(200).send();
      }

      let decoded: { emailAddress?: string; historyId?: string };
      try {
        decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
      } catch {
        return reply.code(200).send();
      }

      if (!decoded.emailAddress || !decoded.historyId) {
        return reply.code(200).send();
      }

      const { emailAddress, historyId } = decoded as { emailAddress: string; historyId: string };

      // Fire-and-forget — don't block the 200 response
      ;(async () => {
        try {
          // Step 1: incremental sync → returns account info for triage
          const accountInfo = await gmailPushService.handleNotification({ emailAddress, historyId });

          // Step 2: triage newly synced threads (rule engine → AI → action executor)
          if (accountInfo) {
            await autoTriageNewThreads(accountInfo.accountId, accountInfo.userId);
          }
        } catch (err) {
          fastify.log.error({ err, emailAddress }, '[GmailPush] Notification handling or triage failed');
        }
      })();
    } catch (err) {
      fastify.log.error({ err }, '[GmailPush] Webhook error');
    }

    // Always 200 — Google retries on anything else
    return reply.code(200).send();
  });
}
