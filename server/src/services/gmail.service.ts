/**
 * GmailService - SOLE GATEWAY to Gmail API
 *
 * No other component in the system talks directly to Gmail.
 * All Gmail operations go through this service.
 */

import { google, gmail_v1 } from 'googleapis';
import { prisma } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { actionLogService } from './action-log.service';
import {
  getHeader,
  parseEmailAddresses,
  extractBody,
  buildRfc2822Email,
  encodeBase64Url,
  decodeBase64Url,
} from '../utils/email-parser';
import {
  isCalendarInviteMimeType,
  parseCalendarInvite,
} from '../utils/calendar-invite';

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

    // Proactive refresh: if token expires within 5 minutes, refresh now
    const now = Date.now();
    const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
    if (expiresAt && expiresAt - now < 5 * 60 * 1000) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        const updateData: Record<string, any> = {};
        if (credentials.access_token) updateData.accessTokenEncrypted = encrypt(credentials.access_token);
        if (credentials.refresh_token) updateData.refreshTokenEncrypted = encrypt(credentials.refresh_token);
        if (credentials.expiry_date) updateData.tokenExpiresAt = new Date(credentials.expiry_date);
        if (Object.keys(updateData).length > 0) {
          await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
        }
        oauth2Client.setCredentials(credentials);
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        if (status === 400 || status === 401) {
          // Token permanently revoked — disable account and request re-auth
          await prisma.emailAccount.update({
            where: { id: accountId },
            data: { isActive: false, syncError: 'OAuth token revoked — please reconnect this account' },
          });
          actionLogService.log(account.userId, 'token_revoked', 'account', accountId, {
            email: account.emailAddress,
            reason: 'OAuth token refresh failed with 400/401',
          }).catch(() => {});
          throw new Error(`REAUTH_REQUIRED:${account.emailAddress}`);
        }
        // Unexpected network/server error — log but don't crash
        console.error(`[Gmail] Token refresh failed for account ${accountId}:`, (err as Error).message);
        throw new Error(`Gmail token refresh failed: ${(err as Error).message}`);
      }
    }

    // Auto-refresh: listen for new tokens from implicit refresh and persist them
    oauth2Client.on('tokens', async (tokens) => {
      const updateData: Record<string, any> = {};
      if (tokens.access_token) updateData.accessTokenEncrypted = encrypt(tokens.access_token);
      if (tokens.refresh_token) updateData.refreshTokenEncrypted = encrypt(tokens.refresh_token);
      if (tokens.expiry_date) updateData.tokenExpiresAt = new Date(tokens.expiry_date);
      if (Object.keys(updateData).length > 0) {
        await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
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

      // Extract List-Unsubscribe header (RFC 2369)
      const unsubscribeHeader = getHeader(headers, 'List-Unsubscribe');
      const unsubscribeUrl = unsubscribeHeader?.match(/<(https?:\/\/[^>]+)>/)?.[1] ?? null;

      const attachments: Array<{
        filename: string;
        mimeType: string;
        size: number;
        attachmentId: string;
        downloadable?: boolean;
        calendarInvite?: ReturnType<typeof parseCalendarInvite>;
      }> = [];

      const getPartContent = async (part: any): Promise<string | null> => {
        if (typeof part?.body?.data === 'string') {
          return decodeBase64Url(part.body.data);
        }

        if (part?.body?.attachmentId) {
          const response = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msg.id!,
            id: part.body.attachmentId,
          });

          if (typeof response.data.data === 'string') {
            return decodeBase64Url(response.data.data);
          }
        }

        return null;
      };

      const collectParts = async (part: any) => {
        if (!part) return;

        const mimeType = (part.mimeType ?? '') as string;
        const filename = (part.filename ?? '') as string;
        const size = Number(part.body?.size ?? 0);
        const attachmentId = (part.body?.attachmentId ?? '') as string;
        const isCalendarPart = isCalendarInviteMimeType(mimeType, filename);

        if (isCalendarPart) {
          let calendarInvite = null;

          try {
            const content = await getPartContent(part);
            if (content) {
              calendarInvite = parseCalendarInvite(content);
            }
          } catch {
            // Non-fatal — keep the attachment metadata even if invite parsing fails
          }

          if (calendarInvite || attachmentId) {
            attachments.push({
              filename: filename || 'invite.ics',
              mimeType: mimeType || 'text/calendar',
              size,
              attachmentId,
              downloadable: Boolean(attachmentId),
              ...(calendarInvite ? { calendarInvite } : {}),
            });
          }
        } else if (filename && attachmentId) {
          attachments.push({
            filename,
            mimeType,
            size,
            attachmentId,
            downloadable: true,
          });
        }

        if (part.parts) {
          for (const nestedPart of part.parts as any[]) {
            await collectParts(nestedPart);
          }
        }
      };

      await collectParts(msg.payload);

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
          attachments,
          unsubscribeUrl,
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
          attachments,
          unsubscribeUrl,
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
      bcc?: string[];
      subject: string;
      body: string;
      bodyHtml?: string;
      inReplyTo?: string;
      references?: string;
      threadId?: string; // Gmail thread ID for threading
      attachments?: Array<{ filename: string; mimeType: string; data: string }>;
    }
  ): Promise<{ messageId: string; threadId: string }> {
    const gmail = await this.getClient(accountId);

    const attachments = options.attachments ?? [];
    let encodedEmail: string;

    if (attachments.length > 0 || options.bodyHtml) {
      // Build multipart/mixed (with attachments) or multipart/alternative (HTML only)
      const outerBoundary = `bdry_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const altBoundary = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const lines: string[] = [];

      lines.push(`From: ${options.from}`);
      if (options.to.length) lines.push(`To: ${options.to.join(', ')}`);
      if (options.cc?.length) lines.push(`Cc: ${options.cc.join(', ')}`);
      if (options.bcc?.length) lines.push(`Bcc: ${options.bcc.join(', ')}`);
      lines.push(`Subject: =?UTF-8?B?${Buffer.from(options.subject || '').toString('base64')}?=`);
      if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
      if (options.references) lines.push(`References: ${options.references}`);
      lines.push('MIME-Version: 1.0');

      if (attachments.length > 0) {
        lines.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`);
        lines.push('');
        lines.push(`--${outerBoundary}`);
      }

      if (options.bodyHtml) {
        lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
        lines.push('');
        lines.push(`--${altBoundary}`);
        lines.push('Content-Type: text/plain; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('');
        lines.push(Buffer.from(options.body || '').toString('base64'));
        lines.push(`--${altBoundary}`);
        lines.push('Content-Type: text/html; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('');
        lines.push(Buffer.from(options.bodyHtml).toString('base64'));
        lines.push(`--${altBoundary}--`);
      } else {
        lines.push('Content-Type: text/plain; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('');
        lines.push(Buffer.from(options.body || '').toString('base64'));
      }

      for (const att of attachments) {
        lines.push(`--${outerBoundary}`);
        lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
        lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push('');
        lines.push(att.data); // Already base64
      }

      if (attachments.length > 0) {
        lines.push(`--${outerBoundary}--`);
      }

      const raw = Buffer.from(lines.join('\r\n'));
      encodedEmail = raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } else {
      const rawEmail = buildRfc2822Email({
        from: options.from,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        body: options.body,
        inReplyTo: options.inReplyTo,
        references: options.references,
      });
      encodedEmail = encodeBase64Url(rawEmail);
    }

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
   * Incremental sync using Gmail History API.
   * Much faster than a full sync — only fetches changes since the given historyId.
   * Falls back to triggering a regular fetchThreads() if history has expired (404).
   */
  async incrementalSync(accountId: string, sinceHistoryId: string): Promise<void> {
    const gmail = await this.getClient(accountId);

    try {
      const response = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: sinceHistoryId,
        historyTypes: ['messageAdded'],
      });

      const histories = response.data.history ?? [];
      const newGmailIds = new Set<string>();

      for (const history of histories) {
        for (const added of history.messagesAdded ?? []) {
          if (added.message?.id) newGmailIds.add(added.message.id);
        }
      }

      if (newGmailIds.size > 0) {
        // Find which message IDs we don't yet have locally
        const existing = await prisma.emailMessage.findMany({
          where: { gmailMessageId: { in: [...newGmailIds] } },
          select: { gmailMessageId: true },
        });
        const existingIds = new Set(existing.map((m) => m.gmailMessageId));
        const toFetch = [...newGmailIds].filter((id) => !existingIds.has(id));

        if (toFetch.length > 0) {
          // Get the thread IDs for the new messages and trigger a thread sync
          const threadIds = new Set<string>();
          for (const msgId of toFetch) {
            try {
              const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'metadata', metadataHeaders: ['Subject'] });
              if (msg.data.threadId) threadIds.add(msg.data.threadId);
            } catch {
              // ignore individual message errors
            }
          }
          // Re-fetch affected threads (reuses existing fetch + store logic)
          for (const gmailThreadId of threadIds) {
            await this.fetchMessages(accountId, gmailThreadId).catch(() => {});
          }
        }
      }

      // Update stored historyId
      if (response.data.historyId) {
        await prisma.emailAccount.update({
          where: { id: accountId },
          data: { gmailHistoryId: response.data.historyId.toString() },
        });
      }
    } catch (err: any) {
      if (err?.status === 404 || err?.code === 404) {
        // History expired — fall back to regular thread fetch
        console.warn(`[GmailPush] History expired for account ${accountId}, triggering regular sync`);
        await this.fetchThreads(accountId, { maxResults: 20 }).catch(() => {});
      } else {
        throw err;
      }
    }
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
  /**
   * Archive a Gmail thread (remove INBOX label).
   * SAFETY: Does NOT delete. Thread remains in All Mail.
   */
  /**
   * Modify Gmail thread labels — generic helper used by spam, archive, etc.
   */
  async modifyLabels(
    accountId: string,
    gmailThreadId: string,
    addLabelIds: string[],
    removeLabelIds: string[]
  ): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  async archiveThread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { removeLabelIds: ['INBOX'] },
    });
  }

  /**
   * Mark a Gmail thread as read (remove UNREAD label).
   */
  async markAsRead(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  /**
   * Star a Gmail thread (add STARRED label).
   */
  async starThread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { addLabelIds: ['STARRED'] },
    });
  }

  /**
   * Unstar a Gmail thread (remove STARRED label).
   */
  async unstarThread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { removeLabelIds: ['STARRED'] },
    });
  }

  /**
   * Mark a Gmail thread as unread (add UNREAD label).
   */
  async markAsUnread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { addLabelIds: ['UNREAD'] },
    });
  }

  /**
   * Restore a Gmail thread from Trash (add INBOX, remove TRASH).
   */
  async restoreThread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.modify({
      userId: 'me',
      id: gmailThreadId,
      requestBody: { addLabelIds: ['INBOX'], removeLabelIds: ['TRASH'] },
    });
  }

  /**
   * Move a Gmail thread to Trash.
   * SAFETY: Uses threads.trash — reversible within 30 days.
   * NEVER calls threads.delete (permanent — forbidden).
   */
  async trashThread(accountId: string, gmailThreadId: string): Promise<void> {
    const gmail = await this.getClient(accountId);
    await gmail.users.threads.trash({
      userId: 'me',
      id: gmailThreadId,
    });
  }

  /**
   * List all Gmail labels for an account.
   * Returns array of { id, name } objects.
   */
  async listLabels(accountId: string): Promise<Array<{ id: string; name: string }>> {
    const gmail = await this.getClient(accountId);
    const response = await gmail.users.labels.list({ userId: 'me' });
    return (response.data.labels ?? [])
      .filter((l): l is { id: string; name: string } => !!l.id && !!l.name)
      .map((l) => ({ id: l.id!, name: l.name! }));
  }

  /**
   * Create a Gmail label and return its ID.
   */
  async createLabel(accountId: string, name: string): Promise<string> {
    const gmail = await this.getClient(accountId);
    const response = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });
    if (!response.data.id) throw new Error(`Failed to create Gmail label "${name}"`);
    return response.data.id;
  }

  /**
   * Fetch attachment binary data from Gmail.
   * Returns base64-encoded data (standard base64, not base64url).
   */
  async getAttachment(accountId: string, gmailMessageId: string, attachmentId: string): Promise<string> {
    const gmail = await this.getClient(accountId);
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: gmailMessageId,
      id: attachmentId,
    });
    // Gmail returns base64url — convert to standard base64
    return (response.data.data || '').replace(/-/g, '+').replace(/_/g, '/');
  }

  /**
   * Fetch an inline image by Content-ID (cid:) reference.
   * Walks the MIME tree to find a part whose Content-ID matches, then fetches its binary data.
   */
  async getInlineImage(
    accountId: string,
    gmailMessageId: string,
    cid: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const gmail = await this.getClient(accountId);
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: gmailMessageId,
      format: 'full',
    });

    // Walk the MIME tree looking for a part with a matching Content-ID
    const normalizedCid = cid.replace(/^<|>$/g, '').toLowerCase();

    function findPart(part: any): { attachmentId: string; mimeType: string; data?: string } | null {
      if (!part) return null;
      const contentId = (part.headers as any[] | undefined)
        ?.find((h: any) => h.name?.toLowerCase() === 'content-id')
        ?.value?.replace(/^<|>$/g, '')
        .toLowerCase();

      if (contentId === normalizedCid) {
        if (part.body?.attachmentId) {
          return { attachmentId: part.body.attachmentId, mimeType: part.mimeType ?? 'image/png' };
        }
        // Small inline images are embedded directly in body.data
        if (part.body?.data) {
          return { attachmentId: '', mimeType: part.mimeType ?? 'image/png', data: part.body.data };
        }
      }

      if (part.parts) {
        for (const child of part.parts as any[]) {
          const found = findPart(child);
          if (found) return found;
        }
      }
      return null;
    }

    const found = findPart(response.data.payload);
    if (!found) return null;

    let base64: string;
    if (found.data) {
      // Already embedded
      base64 = found.data.replace(/-/g, '+').replace(/_/g, '/');
    } else {
      // Fetch via attachment API
      const att = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: gmailMessageId,
        id: found.attachmentId,
      });
      base64 = (att.data.data || '').replace(/-/g, '+').replace(/_/g, '/');
    }

    return { data: Buffer.from(base64, 'base64'), mimeType: found.mimeType };
  }

  /**
   * Search Gmail messages by query string.
   * Returns Gmail message stubs (id + threadId).
   */
  async searchMessages(accountId: string, query: string, maxResults = 10): Promise<Array<{ id: string; threadId?: string }>> {
    const gmail = await this.getClient(accountId);
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });
    return (response.data.messages || []) as Array<{ id: string; threadId?: string }>;
  }
}

// Singleton instance
export const gmailService = new GmailService();
