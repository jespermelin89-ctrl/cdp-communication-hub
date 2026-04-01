/**
 * Webhook routes — receives push notifications from external services.
 *
 * POST /webhooks/gmail — Google Cloud Pub/Sub push for Gmail notifications.
 *
 * NOTE: This route intentionally has NO auth middleware.
 * Google Cloud Pub/Sub sends unauthenticated POST requests.
 * Verification relies on the GOOGLE_PUBSUB_VERIFICATION_TOKEN env var
 * (bearer token set on the Pub/Sub push subscription).
 */

import { FastifyInstance } from 'fastify';
import { gmailPushService } from '../services/gmail-push.service';

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

      // Fire-and-forget — don't block the 200 response
      gmailPushService.handleNotification({
        emailAddress: decoded.emailAddress,
        historyId: decoded.historyId,
      }).catch((err) => {
        fastify.log.error({ err, decoded }, '[GmailPush] Notification handling failed');
      });
    } catch (err) {
      fastify.log.error({ err }, '[GmailPush] Webhook error');
    }

    // Always 200 — Google retries on anything else
    return reply.code(200).send();
  });
}
