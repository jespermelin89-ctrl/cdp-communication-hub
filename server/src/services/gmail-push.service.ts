/**
 * GmailPushService — Real-time Gmail notifications via Google Cloud Pub/Sub.
 *
 * Flow:
 *  1. watch() registers a Gmail mailbox watch → Google sends notifications to our Pub/Sub topic
 *  2. Google POSTs to /api/v1/webhooks/gmail when mail arrives
 *  3. handleNotification() runs an incremental sync for the affected account
 *
 * Requires:
 *  - GOOGLE_CLOUD_PROJECT_ID env var
 *  - A Pub/Sub topic: projects/{project}/topics/cdp-hub-gmail
 *  - A push subscription pointing to: {BACKEND_URL}/api/v1/webhooks/gmail
 *
 * If GOOGLE_CLOUD_PROJECT_ID is not set, all methods are no-ops and
 * the scheduler falls back to polling.
 */

import { google } from 'googleapis';
import { prisma } from '../config/database';
import { gmailService } from './gmail.service';

class GmailPushService {
  private readonly topicName: string;

  constructor() {
    const project = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.topicName = project ? `projects/${project}/topics/cdp-hub-gmail` : '';
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

    const { gmail, account } = await this.getContext(accountId);

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
      } catch (err) {
        console.error(`[GmailPush] Failed to renew watch for ${account.emailAddress}:`, err);
      }
    }
  }

  /**
   * Handle an incoming Pub/Sub push notification from Google.
   * Triggers incremental sync for the affected account.
   */
  async handleNotification(data: { emailAddress: string; historyId: string }): Promise<void> {
    const account = await prisma.emailAccount.findFirst({
      where: {
        emailAddress: data.emailAddress,
        provider: 'google',
        isActive: true,
      },
    });

    if (!account) {
      console.warn(`[GmailPush] No active account found for ${data.emailAddress}`);
      return;
    }

    await gmailService.incrementalSync(account.id, data.historyId);
  }

  /** Internal helper — get Gmail API client + account record. */
  private async getContext(accountId: string) {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const gmail = await (gmailService as any).getClient(accountId);
    return { gmail, account };
  }
}

export const gmailPushService = new GmailPushService();
