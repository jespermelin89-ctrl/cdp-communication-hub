/**
 * GmailPushService — Real-time Gmail notifications via Google Cloud Pub/Sub.
 *
 * Flow:
 *  1. watch() registers a Gmail mailbox watch → Google sends notifications to our Pub/Sub topic
 *  2. Google POSTs to /api/v1/webhooks/gmail when mail arrives
 *  3. handleNotification() runs an incremental sync for the affected account
 *     and returns { accountId, userId } so the caller can chain triage
 *
 * Requires:
 *  - GOOGLE_CLOUD_PROJECT_ID env var (or GMAIL_PUBSUB_TOPIC to set the topic directly)
 *  - A Pub/Sub topic: projects/{project}/topics/cdp-hub-gmail
 *  - A push subscription pointing to: {GMAIL_PUSH_WEBHOOK_URL}/api/v1/webhooks/gmail
 *
 * If neither GOOGLE_CLOUD_PROJECT_ID nor GMAIL_PUBSUB_TOPIC is set, all methods
 * are no-ops and the scheduler falls back to polling.
 */

import { google } from 'googleapis';
import { prisma } from '../config/database';
import { gmailService } from './gmail.service';
import { env } from '../config/env';

export interface PushAccountInfo {
  accountId: string;
  userId: string;
}

class GmailPushService {
  private readonly topicName: string;

  constructor() {
    // Prefer an explicit full topic name; fall back to building from project ID
    this.topicName =
      env.GMAIL_PUBSUB_TOPIC ||
      (env.GOOGLE_CLOUD_PROJECT_ID
        ? `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/topics/cdp-hub-gmail`
        : '');
  }

  get isEnabled(): boolean {
    return !!this.topicName;
  }

  /**
   * Register a Gmail push watch for one account.
   * Must be renewed every 7 days (Google enforces this).
   */
  async watch(accountId: string): Promise<{ historyId: string; expiration: string } | null> {
    if (!this.isEnabled) return null;

    const { gmail } = await this.getContext(accountId);

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: this.topicName,
        labelIds: ['INBOX'],
      },
    });

    const historyId = response.data.historyId?.toString() ?? '';
    const expiration = response.data.expiration?.toString() ?? '';

    await prisma.emailAccount.update({
      where: { id: accountId },
      data: {
        gmailHistoryId: historyId,
        gmailWatchExpiry: expiration ? new Date(parseInt(expiration)) : null,
      },
    });

    return { historyId, expiration };
  }

  /**
   * Renew watches for all active Gmail accounts.
   * Call once per day from the sync scheduler.
   */
  async renewAllWatches(): Promise<void> {
    if (!this.isEnabled) return;

    const accounts = await prisma.emailAccount.findMany({
      where: { provider: 'google', isActive: true },
    });

    for (const account of accounts) {
      try {
        await this.watch(account.id);
        console.log(`[GmailPush] Watch renewed for ${account.emailAddress}`);
      } catch (err) {
        console.error(`[GmailPush] Failed to renew watch for ${account.emailAddress}:`, err);
      }
    }
  }

  /**
   * Handle an incoming Pub/Sub push notification from Google.
   * Triggers incremental sync for the affected account.
   *
   * Returns { accountId, userId } so the caller can chain autoTriage,
   * or null if no matching account was found.
   */
  async handleNotification(data: {
    emailAddress: string;
    historyId: string;
  }): Promise<PushAccountInfo | null> {
    const account = await prisma.emailAccount.findFirst({
      where: {
        emailAddress: data.emailAddress,
        provider: 'google',
        isActive: true,
      },
      select: { id: true, userId: true, emailAddress: true },
    });

    if (!account) {
      console.warn(`[GmailPush] No active account found for ${data.emailAddress}`);
      return null;
    }

    await gmailService.incrementalSync(account.id, data.historyId);
    console.log(`[GmailPush] Incremental sync complete for ${account.emailAddress} (historyId: ${data.historyId})`);

    return { accountId: account.id, userId: account.userId };
  }

  /** Internal helper — get Gmail API client. */
  private async getContext(accountId: string) {
    const gmail = await (gmailService as any).getClient(accountId);
    return { gmail };
  }
}

export const gmailPushService = new GmailPushService();
