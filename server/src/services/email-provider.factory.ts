/**
 * EmailProviderFactory - Unified interface for all email providers.
 *
 * Routes operations to the correct service based on account provider type.
 * This is the ONLY entry point for email operations throughout the system.
 *
 * Supported providers:
 * - gmail: Google OAuth → GmailService
 * - imap: IMAP/SMTP → ImapService + SmtpService
 * - microsoft: (future) Microsoft Graph API
 */

import { prisma } from '../config/database';
import { gmailService } from './gmail.service';
import { imapService } from './imap.service';
import { smtpService } from './smtp.service';

export interface FetchThreadsResult {
  threads: any[];
  nextPageToken?: string | null;
}

export interface SendEmailOptions {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface SendEmailResult {
  messageId: string;
  threadId?: string;
}

export class EmailProviderFactory {
  /**
   * Get the provider type for an account
   */
  private async getProvider(accountId: string): Promise<string> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { provider: true, isActive: true },
    });

    if (!account.isActive) {
      throw new Error('This email account is disabled. Re-enable it in settings.');
    }

    return account.provider;
  }

  /**
   * Fetch threads/messages from any provider
   */
  async fetchThreads(
    accountId: string,
    options: { maxResults?: number; query?: string; pageToken?: string } = {}
  ): Promise<FetchThreadsResult> {
    const provider = await this.getProvider(accountId);

    switch (provider) {
      case 'gmail':
        return gmailService.fetchThreads(accountId, options);

      case 'imap': {
        // For IMAP, we fetch messages and the service groups them into threads
        const result = await imapService.fetchMessages(accountId, {
          limit: options.maxResults || 20,
          since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        });
        // Load the cached threads
        const threads = await prisma.emailThread.findMany({
          where: { accountId },
          orderBy: { lastMessageAt: 'desc' },
          take: options.maxResults || 20,
        });
        return { threads, nextPageToken: null };
      }

      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  /**
   * Fetch full messages for a thread from any provider
   */
  async fetchMessages(accountId: string, threadOrGmailId: string) {
    const provider = await this.getProvider(accountId);

    switch (provider) {
      case 'gmail':
        return gmailService.fetchMessages(accountId, threadOrGmailId);

      case 'imap':
        // For IMAP, messages are already cached during fetchThreads
        // Just return from database
        const thread = await prisma.emailThread.findFirst({
          where: { accountId, gmailThreadId: threadOrGmailId },
          include: {
            messages: { orderBy: { receivedAt: 'asc' } },
          },
        });
        return thread?.messages || [];

      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  /**
   * Send an email via any provider.
   * ONLY called after draft approval (safety gate is in DraftService).
   */
  async sendEmail(accountId: string, options: SendEmailOptions): Promise<SendEmailResult> {
    const provider = await this.getProvider(accountId);

    switch (provider) {
      case 'gmail':
        return gmailService.sendEmail(accountId, options);

      case 'imap':
        const result = await smtpService.sendEmail(accountId, {
          to: options.to,
          cc: options.cc,
          subject: options.subject,
          body: options.body,
          inReplyTo: options.inReplyTo,
          references: options.references,
        });
        return { messageId: result.messageId };

      default:
        throw new Error(`Unsupported email provider: ${provider}`);
    }
  }

  /**
   * Restore a thread from Trash back to Inbox.
   */
  async restoreThread(accountId: string, gmailThreadId: string): Promise<void> {
    const provider = await this.getProvider(accountId);
    switch (provider) {
      case 'gmail':
        return gmailService.restoreThread(accountId, gmailThreadId);
      case 'imap':
        // IMAP has no server-side trash — just update local label cache
        return;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get the last message ID from a thread (for reply headers).
   */
  async getLastMessageId(accountId: string, threadId: string): Promise<string | null> {
    const provider = await this.getProvider(accountId);

    switch (provider) {
      case 'gmail':
        return gmailService.getLastMessageId(accountId, threadId);

      case 'imap': {
        // Get from cached messages
        const lastMsg = await prisma.emailMessage.findFirst({
          where: {
            thread: { accountId, gmailThreadId: threadId },
          },
          orderBy: { receivedAt: 'desc' },
          select: { gmailMessageId: true },
        });
        return lastMsg?.gmailMessageId?.replace('imap_', '') || null;
      }

      default:
        return null;
    }
  }

  /**
   * Fetch attachment binary (base64) from the provider.
   */
  async getAttachment(accountId: string, gmailMessageId: string, attachmentId: string): Promise<string> {
    const provider = await this.getProvider(accountId);

    switch (provider) {
      case 'gmail':
        return gmailService.getAttachment(accountId, gmailMessageId, attachmentId);

      case 'imap':
        throw new Error('Attachment download is not yet supported for IMAP accounts.');

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Test connection for any provider type
   */
  async testConnection(
    provider: string,
    credentials: {
      // Gmail
      accessToken?: string;
      // IMAP
      imapHost?: string;
      imapPort?: number;
      imapUseSsl?: boolean;
      smtpHost?: string;
      smtpPort?: number;
      smtpUseSsl?: boolean;
      user?: string;
      password?: string;
    }
  ): Promise<{ success: boolean; error?: string; details?: any }> {
    switch (provider) {
      case 'imap': {
        if (!credentials.imapHost || !credentials.user || !credentials.password) {
          return { success: false, error: 'Missing IMAP credentials' };
        }

        // Test IMAP
        const imapResult = await imapService.testConnection({
          host: credentials.imapHost,
          port: credentials.imapPort || 993,
          useSsl: credentials.imapUseSsl ?? true,
          user: credentials.user,
          password: credentials.password,
        });

        if (!imapResult.success) {
          return { success: false, error: `IMAP failed: ${imapResult.error}` };
        }

        // Test SMTP if provided
        if (credentials.smtpHost) {
          const smtpResult = await smtpService.testConnection({
            host: credentials.smtpHost,
            port: credentials.smtpPort || 465,
            useSsl: credentials.smtpUseSsl ?? true,
            user: credentials.user,
            password: credentials.password,
          });

          if (!smtpResult.success) {
            return {
              success: false,
              error: `IMAP OK, but SMTP failed: ${smtpResult.error}`,
              details: { imapOk: true, smtpOk: false, mailboxes: imapResult.mailboxes },
            };
          }
        }

        return {
          success: true,
          details: { mailboxes: imapResult.mailboxes },
        };
      }

      case 'gmail':
        // Gmail connection is tested via OAuth flow
        return { success: true };

      default:
        return { success: false, error: `Unknown provider: ${provider}` };
    }
  }
}

// Singleton
export const emailProviderFactory = new EmailProviderFactory();
