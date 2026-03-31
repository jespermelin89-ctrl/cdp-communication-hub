/**
 * ImapService - Fetch email from custom domain accounts via IMAP.
 *
 * Handles IMAP connections for non-Gmail accounts (custom domains like
 * jesper@company.se via Namecheap, Cloudflare, etc.)
 *
 * Uses the 'imapflow' library for modern IMAP with idle/push support.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../config/database';
import { decrypt } from '../utils/encryption';

interface ImapCredentials {
  host: string;
  port: number;
  useSsl: boolean;
  user: string;
  password: string;
}

export class ImapService {
  /**
   * Get IMAP credentials for an account (decrypting password)
   */
  private async getCredentials(accountId: string): Promise<ImapCredentials> {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
    });

    if (account.provider !== 'imap') {
      throw new Error(`Account ${accountId} is not an IMAP account (provider: ${account.provider})`);
    }

    if (!account.imapHost || !account.imapPort || !account.imapPasswordEncrypted) {
      throw new Error('IMAP account is missing host, port, or password configuration');
    }

    return {
      host: account.imapHost,
      port: account.imapPort,
      useSsl: account.imapUseSsl,
      user: account.emailAddress,
      password: decrypt(account.imapPasswordEncrypted),
    };
  }

  /**
   * Create an authenticated IMAP connection
   */
  private async connect(credentials: ImapCredentials): Promise<ImapFlow> {
    const client = new ImapFlow({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.useSsl,
      auth: {
        user: credentials.user,
        pass: credentials.password,
      },
      logger: false, // Disable verbose logging
    });

    await client.connect();
    return client;
  }

  /**
   * Fetch recent messages from IMAP and cache them in the database.
   * Groups messages into threads by subject (In-Reply-To/References when available).
   */
  async fetchMessages(
    accountId: string,
    options: { folder?: string; limit?: number; since?: Date } = {}
  ) {
    const { folder = 'INBOX', limit = 50, since } = options;
    const credentials = await this.getCredentials(accountId);
    const client = await this.connect(credentials);

    try {
      const lock = await client.getMailboxLock(folder);

      try {
        const searchQuery = since ? { since } : { all: true };
        const messageUids = await client.search(searchQuery, { uid: true });
        const recentUids = Array.isArray(messageUids)
          ? [...messageUids].sort((a, b) => a - b).slice(-limit)
          : [];

        const messages: any[] = [];
        if (recentUids.length > 0) {
          for await (const msg of client.fetch(
            recentUids,
            {
              envelope: true,
              bodyStructure: true,
              uid: true,
              flags: true,
              internalDate: true,
              headers: ['message-id', 'in-reply-to', 'references'],
            },
            { uid: true }
          )) {
            messages.push(msg);
          }
        }

        // Process messages: group into threads and cache
        const cachedThreads = new Map<string, string>(); // subject -> threadId
        const results = [];

        for (const msg of messages.reverse()) { // Process newest first
          const envelope = msg.envelope;
          if (!envelope) continue;

          const subject = envelope.subject || '(No Subject)';
          const from = envelope.from?.[0]
            ? `${envelope.from[0].name || ''} <${envelope.from[0].address}>`.trim()
            : 'unknown';
          const fromAddress = envelope.from?.[0]?.address || 'unknown';
          const toAddresses = (envelope.to || []).map((a: any) => a.address).filter(Boolean);
          const ccAddresses = (envelope.cc || []).map((a: any) => a.address).filter(Boolean);
          const messageId = msg.headers?.get('message-id')?.toString() || msg.uid?.toString() || '';
          const gmailMessageId = `imap_${messageId}`;
          const receivedAt = msg.internalDate || new Date();
          const isRead = msg.flags?.has('\\Seen') || false;

          // Thread grouping: use normalized subject
          const normalizedSubject = subject
            .replace(/^(Re|Fwd|Sv|VS|Aw):\s*/gi, '')
            .trim();
          const threadKey = `${accountId}:${normalizedSubject}`;

          // Find or create thread
          let thread = await prisma.emailThread.findFirst({
            where: {
              accountId,
              subject: { contains: normalizedSubject, mode: 'insensitive' },
            },
          });

          if (!thread) {
            thread = await prisma.emailThread.create({
              data: {
                accountId,
                gmailThreadId: gmailMessageId, // Use message ID as thread identifier
                subject,
                snippet: '', // Will be filled below
                lastMessageAt: receivedAt,
                participantEmails: [...new Set([fromAddress, ...toAddresses, ...ccAddresses])],
                messageCount: 1,
                labels: [folder],
                isRead,
              },
            });
          } else {
            // Update existing thread
            const participants = new Set([
              ...thread.participantEmails,
              fromAddress,
              ...toAddresses,
              ...ccAddresses,
            ]);
            const existingMessage = await prisma.emailMessage.findUnique({
              where: {
                threadId_gmailMessageId: {
                  threadId: thread.id,
                  gmailMessageId,
                },
              },
              select: { id: true },
            });
            await prisma.emailThread.update({
              where: { id: thread.id },
              data: {
                lastMessageAt: receivedAt > (thread.lastMessageAt || new Date(0)) ? receivedAt : thread.lastMessageAt,
                participantEmails: Array.from(participants),
                ...(existingMessage ? {} : { messageCount: { increment: 1 } }),
                isRead: isRead && thread.isRead,
              },
            });
          }

          // Fetch message body
          let bodyText = '';
          try {
            const downloadResult = await client.download(msg.seq.toString(), undefined, {
              uid: false,
            });
            if (downloadResult?.content) {
              const parsed: any = await simpleParser(downloadResult.content);
              bodyText = parsed.text || '';

              // Update thread snippet with latest message
              await prisma.emailThread.update({
                where: { id: thread.id },
                data: { snippet: bodyText.substring(0, 200) },
              });
            }
          } catch (e) {
            // Body download can fail; continue with empty body
          }

          // Cache the message
          await prisma.emailMessage.upsert({
            where: {
              threadId_gmailMessageId: {
                threadId: thread.id,
                gmailMessageId,
              },
            },
            update: {
              bodyText,
              receivedAt,
            },
            create: {
              threadId: thread.id,
              gmailMessageId,
              fromAddress,
              toAddresses,
              ccAddresses,
              subject,
              bodyText,
              bodyHtml: null,
              receivedAt,
            },
          });

          results.push({ threadId: thread.id, messageId, subject, from: fromAddress });
        }

        // Update account sync status
        await prisma.emailAccount.update({
          where: { id: accountId },
          data: { lastSyncAt: new Date(), syncError: null },
        });

        return { messages: results, count: results.length };
      } finally {
        lock.release();
      }
    } catch (error: any) {
      // Log sync error on account
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { syncError: error.message },
      });
      throw error;
    } finally {
      await client.logout();
    }
  }

  /**
   * Test IMAP connection (used when adding a new account)
   */
  async testConnection(credentials: {
    host: string;
    port: number;
    useSsl: boolean;
    user: string;
    password: string;
  }): Promise<{ success: boolean; error?: string; mailboxes?: string[] }> {
    try {
      const client = await this.connect(credentials);

      // List mailboxes to verify full access
      const mailboxes: string[] = [];
      const mbList = await client.list();
      for (const mb of mbList) {
        mailboxes.push(mb.path);
      }

      await client.logout();
      return { success: true, mailboxes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// Singleton
export const imapService = new ImapService();
