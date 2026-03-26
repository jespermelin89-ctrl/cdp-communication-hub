/**
 * GmailService - SOLE GATEWAY to Gmail API
 *
 * No other component in the system talks directly to Gmail.
 * All Gmail operations go through this service.
 */

import { google, gmail_v1 } from 'googleapis';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import {
  getHeader,
  parseEmailAddresses,
  extractBody,
  buildRfc2822Email,
  encodeBase64Url,
} from '../utils/email-parser';

interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}

export class GmailService {
  /**
   * Get an authenticated Gmail client for a specific account
   */
  private async getClient(accountId: string): Promise<gmail_v1.Gmail> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    const accessToken = decrypt(account.accessTokenEncrypted);
    const refreshToken = decrypt(account.refreshTokenEncrypted);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.tokenExpiresAt?.getTime(),
    });

    // Auto-refresh: listen for new tokens and persist them
    oauth2Client.on('tokens', async (tokens) => {
      const updateData: any = {};
      if (tokens.access_token) {
        updateData.accessTokenEncrypted = encrypt(tokens.access_token);
      }
      if (tokens.refresh_token) {
        updateData.refreshTokenEncrypted = encrypt(tokens.refresh_token);
      }
      if (tokens.expiry_date) {
        updateData.tokenExpiresAt = new Date(tokens.expiry_date);
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.emailAccount.update({
          where: { id: accountId },
          data: updateData,
        });
      }
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Fetch threads from Gmail and cache them in the database.
   * Returns cached thread records.
   */
  async fetchThreads(
    accountId: string,
    options: { maxResults?: number; query?: string; pageToken?: string } = {}
  ) {
    const gmail = await this.getClient(accountId);
    const { maxResults = 20, query, pageToken } = options;

    const response = await gmail.users.threads.list({
      userId: 'me',
      maxResults,
      q: query,
      pageToken,
    });

    const threads = response.data.threads || [];
    const cachedThreads = [];

    for (const thread of threads) {
      if (!thread.id) continue;

      // Fetch full thread data
      const fullThread = await gmail.users.threads.get({
        userId: 'me',
        id: thread.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
      });

      const messages = fullThread.data.messages || [];
      const lastMessage = messages[messages.length - 1];
      const firstMessage = messages[0];
      const headers = firstMessage?.payload?.headers || [];

      const subject = getHeader(headers, 'Subject') || '(No Subject)';
      const snippet = fullThread.data.snippet || '';

      // Collect all participants
      const participants = new Set<string>();
      for (const msg of messages) {
        const msgHeaders = msg.payload?.headers || [];
        const from = getHeader(msgHeaders, 'From');
        const to = getHeader(msgHeaders, 'To');
        const cc = getHeader(msgHeaders, 'Cc');
        if (from) parseEmailAddresses(from).forEach((e) => participants.add(e));
        if (to) parseEmailAddresses(to).forEach((e) => participants.add(e));
        if (cc) parseEmailAddresses(cc).forEach((e) => participants.add(e));
      }

      // Get the last message date
      const lastMsgDate = lastMessage?.internalDate
        ? new Date(parseInt(lastMessage.internalDate))
        : new Date();

      // Upsert thread in database
      const cached = await prisma.emailThread.upsert({
        where: {
          accountId_gmailThreadId: {
            accountId,
            gmailThreadId: thread.id,
          },
        },
        update: {
          subject,
          snippet,
          lastMessageAt: lastMsgDate,
          participantEmails: Array.from(participants),
          messageCount: messages.length,
          labels: (lastMessage?.labelIds as string[]) || [],
          isRead: !(lastMessage?.labelIds?.includes('UNREAD') ?? false),
        },
        create: {
          accountId,
          gmailThreadId: thread.id,
          subject,
          snippet,
          lastMessageAt: lastMsgDate,
          participantEmails: Array.from(participants),
          messageCount: messages.length,
          labels: (lastMessage?.labelIds as string[]) || [],
          isRead: !(lastMessage?.labelIds?.includes('UNREAD') ?? false),
        },
      });

      cachedThreads.push(cached);
    }

    return {
      threads: cachedThreads,
      nextPageToken: response.data.nextPageToken || null,
    };
  }

  /**
   * Fetch full messages for a thread and cache them.
   */
  async fetchMessages(accountId: string, gmailThreadId: string) {
    const gmail = await this.getClient(accountId);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: gmailThreadId,
      format: 'full',
    });

    const messages = response.data.messages || [];
    const cachedMessages = [];

    // Find the thread in our DB
    const thread = await prisma.emailThread.findFirst({
      where: { accountId, gmailThreadId },
    });

    if (!thread) {
      throw new Error(`Thread not found in database: ${gmailThreadId}`);
    }

    for (const msg of messages) {
      if (!msg.id) continue;

      const headers = msg.payload?.headers || [];
      const from = getHeader(headers, 'From') || '';
      const to = getHeader(headers, 'To') || '';
      const cc = getHeader(headers, 'Cc') || '';
      const subject = getHeader(headers, 'Subject') || '';

      const bodyText = extractBody(msg.payload, 'text/plain');
      const bodyHtml = extractBody(msg.payload, 'text/html');
      const receivedAt = msg.internalDate
        ? new Date(parseInt(msg.internalDate))
        : new Date();

      const cached = await prisma.emailMessage.upsert({
        where: {
          threadId_gmailMessageId: {
            threadId: thread.id,
            gmailMessageId: msg.id,
          },
        },
        update: {
          fromAddress: parseEmailAddresses(from)[0] || from,
          toAddresses: parseEmailAddresses(to),
          ccAddresses: parseEmailAddresses(cc),
          subject,
          bodyText,
          bodyHtml,
          receivedAt,
        },
        create: {
          threadId: thread.id,
          gmailMessageId: msg.id,
          fromAddress: parseEmailAddresses(from)[0] || from,
          toAddresses: parseEmailAddresses(to),
          ccAddresses: parseEmailAddresses(cc),
          subject,
          bodyText,
          bodyHtml,
          receivedAt,
        },
      });

      cachedMessages.push(cached);
    }

    return cachedMessages;
  }

  /**
   * Send an email via Gmail API.
   * This is ONLY called after a draft has been approved.
   */
  async sendEmail(
    accountId: string,
    options: {
      from: string;
      to: string[];
      cc?: string[];
      subject: string;
      body: string;
      inReplyTo?: string;
      references?: string;
      threadId?: string; // Gmail thread ID for threading
    }
  ): Promise<{ messageId: string; threadId: string }> {
    const gmail = await this.getClient(accountId);

    const rawEmail = buildRfc2822Email({
      from: options.from,
      to: options.to,
      cc: options.cc,
      subject: options.subject,
      body: options.body,
      inReplyTo: options.inReplyTo,
      references: options.references,
    });

    const encodedEmail = encodeBase64Url(rawEmail);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: options.threadId,
      },
    });

    return {
      messageId: response.data.id || '',
      threadId: response.data.threadId || '',
    };
  }

  /**
   * Get the last message ID from a Gmail thread (for In-Reply-To header)
   */
  async getLastMessageId(accountId: string, gmailThreadId: string): Promise<string | null> {
    const gmail = await this.getClient(accountId);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: gmailThreadId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) return null;

    const lastMessage = messages[messages.length - 1];
    const headers = lastMessage?.payload?.headers || [];
    return getHeader(headers, 'Message-ID') || null;
  }
}

// Singleton instance
export const gmailService = new GmailService();
