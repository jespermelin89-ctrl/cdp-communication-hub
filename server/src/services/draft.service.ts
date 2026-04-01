/**
 * DraftService - Full draft lifecycle management.
 *
 * CRITICAL: This service enforces the approval gate.
 * The send method MUST verify status === 'approved' before calling Gmail.
 * This is the single most important safety mechanism in the system.
 */

import { prisma } from '../config/database';
import { emailProviderFactory } from './email-provider.factory';
import { actionLogService } from './action-log.service';
import type { CreateDraftInput, UpdateDraftInput } from '../utils/validators';

export class DraftService {
  /**
   * Create a new draft (always starts as 'pending').
   */
  async create(userId: string, input: CreateDraftInput) {
    // Fetch account signature and append if set
    const account = await prisma.emailAccount.findFirst({
      where: { id: input.account_id, userId },
      select: { signature: true },
    });
    const bodyWithSignature = account?.signature
      ? `${input.body_text}\n\n--\n${account.signature}`
      : input.body_text;

    const draft = await prisma.draft.create({
      data: {
        userId,
        accountId: input.account_id,
        threadId: input.thread_id || null,
        toAddresses: input.to_addresses,
        ccAddresses: input.cc_addresses || [],
        bccAddresses: input.bcc_addresses || [],
        subject: input.subject,
        bodyText: bodyWithSignature,
        bodyHtml: (input as any).body_html ?? null,
        status: 'pending', // ALWAYS starts as pending
      },
      include: {
        account: { select: { emailAddress: true } },
        thread: { select: { subject: true, gmailThreadId: true } },
      },
    });

    // Log the creation
    await actionLogService.log(userId, 'draft_created', 'draft', draft.id, {
      to: input.to_addresses,
      subject: input.subject,
      accountEmail: draft.account.emailAddress,
    });

    return draft;
  }

  /**
   * Update a draft. ONLY allowed while status is 'pending'.
   */
  async update(draftId: string, userId: string, input: UpdateDraftInput) {
    // Verify draft exists and is pending
    const existing = await prisma.draft.findFirst({
      where: { id: draftId, userId },
    });

    if (!existing) {
      throw new Error('Draft not found');
    }

    if (existing.status !== 'pending') {
      throw new Error(`Cannot edit draft with status '${existing.status}'. Only pending drafts can be edited.`);
    }

    return prisma.draft.update({
      where: { id: draftId },
      data: {
        ...(input.to_addresses && { toAddresses: input.to_addresses }),
        ...(input.cc_addresses && { ccAddresses: input.cc_addresses }),
        ...(input.bcc_addresses && { bccAddresses: input.bcc_addresses }),
        ...(input.subject && { subject: input.subject }),
        ...(input.body_text && { bodyText: input.body_text }),
        ...((input as any).body_html !== undefined && { bodyHtml: (input as any).body_html }),
      },
      include: {
        account: { select: { emailAddress: true } },
      },
    });
  }

  /**
   * Approve a draft. Changes status from 'pending' to 'approved'.
   */
  async approve(draftId: string, userId: string) {
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status !== 'pending') {
      throw new Error(`Cannot approve draft with status '${draft.status}'. Only pending drafts can be approved.`);
    }

    const approved = await prisma.draft.update({
      where: { id: draftId },
      data: {
        status: 'approved',
        approvedAt: new Date(),
      },
      include: {
        account: { select: { emailAddress: true } },
      },
    });

    await actionLogService.log(userId, 'draft_approved', 'draft', draftId, {
      subject: approved.subject,
      to: approved.toAddresses,
    });

    return approved;
  }

  /**
   * SEND a draft via Gmail.
   *
   * CRITICAL SAFETY GATE:
   * This method MUST verify status === 'approved' before sending.
   * Uses a database transaction to prevent race conditions.
   */
  async send(draftId: string, userId: string) {
    // Use transaction to prevent race conditions
    return prisma.$transaction(async (tx) => {
      // Step 1: Load draft and VERIFY status
      const draft = await tx.draft.findFirst({
        where: { id: draftId, userId },
        include: {
          account: true,
          thread: true,
        },
      });

      if (!draft) {
        throw new Error('Draft not found');
      }

      // *** CRITICAL CHECK - THE SAFETY GATE ***
      if (draft.status !== 'approved') {
        throw new Error(
          `SECURITY: Cannot send draft with status '${draft.status}'. ` +
          `Only approved drafts can be sent. This is a non-negotiable safety rule.`
        );
      }

      try {
        // Step 2: Get reply headers if this is a thread reply
        let inReplyTo: string | undefined;
        let references: string | undefined;
        let gmailThreadIdForSend: string | undefined;

        if (draft.thread) {
          gmailThreadIdForSend = draft.thread.gmailThreadId;
          const lastMsgId = await emailProviderFactory.getLastMessageId(
            draft.accountId,
            draft.thread.gmailThreadId
          );
          if (lastMsgId) {
            inReplyTo = lastMsgId;
            references = lastMsgId;
          }
        }

        // Step 3: Send via provider (Gmail, SMTP, etc.)
        const draftAttachments = (draft.attachments as any[] | null) ?? [];
        const result = await emailProviderFactory.sendEmail(draft.accountId, {
          from: draft.account.emailAddress,
          to: draft.toAddresses,
          cc: draft.ccAddresses,
          bcc: draft.bccAddresses,
          subject: draft.subject,
          body: draft.bodyText,
          bodyHtml: draft.bodyHtml ?? undefined,
          inReplyTo,
          references,
          threadId: gmailThreadIdForSend,
          attachments: draftAttachments.map((a: any) => ({
            filename: String(a.filename ?? ''),
            mimeType: String(a.mimeType ?? 'application/octet-stream'),
            size: Number(a.size ?? 0),
            data: String(a.data ?? ''),
          })),
        });

        // Step 4: Update draft status to 'sent'
        const sentDraft = await tx.draft.update({
          where: { id: draftId },
          data: {
            status: 'sent',
            gmailMessageId: result.messageId,
            sentAt: new Date(),
          },
        });

        // If thread exists, mark it as sent by user
        if (draft.threadId) {
          await prisma.emailThread.update({
            where: { id: draft.threadId },
            data: { isSentByUser: true },
          }).catch(() => {}); // non-critical
        }

        // Step 5: Log the send action
        await actionLogService.logInTransaction(tx, userId, 'draft_sent', 'draft', draftId, {
          gmailMessageId: result.messageId,
          to: draft.toAddresses,
          subject: draft.subject,
        });

        return sentDraft;
      } catch (error: any) {
        // Step 6: On failure, update status to 'failed'
        await tx.draft.update({
          where: { id: draftId },
          data: {
            status: 'failed',
            errorMessage: error.message || 'Unknown error during send',
          },
        });

        await actionLogService.logInTransaction(tx, userId, 'draft_send_failed', 'draft', draftId, {
          error: error.message,
        });

        throw new Error(`Failed to send email: ${error.message}`);
      }
    });
  }

  /**
   * Discard a draft. Can discard pending or approved drafts.
   * Cannot discard already sent drafts.
   */
  async discard(draftId: string, userId: string) {
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status === 'sent') {
      throw new Error('Cannot discard a draft that has already been sent.');
    }

    if (draft.status === 'discarded') {
      throw new Error('Draft is already discarded.');
    }

    const discarded = await prisma.draft.update({
      where: { id: draftId },
      data: { status: 'discarded' },
    });

    await actionLogService.log(userId, 'draft_discarded', 'draft', draftId, {
      subject: discarded.subject,
      previousStatus: draft.status,
    });

    return discarded;
  }

  /**
   * List drafts with optional filters.
   */
  async list(userId: string, options: {
    status?: string;
    accountId?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { status, accountId, page = 1, limit = 20 } = options;

    const where: any = { userId };
    if (status) where.status = status;
    if (accountId) where.accountId = accountId;

    const [drafts, total] = await Promise.all([
      prisma.draft.findMany({
        where,
        include: {
          account: { select: { emailAddress: true } },
          thread: { select: { subject: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.draft.count({ where }),
    ]);

    return {
      drafts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single draft by ID.
   */
  async getById(draftId: string, userId: string) {
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId },
      include: {
        account: { select: { emailAddress: true } },
        thread: { select: { subject: true, gmailThreadId: true, participantEmails: true } },
      },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    return draft;
  }
}

// Singleton
export const draftService = new DraftService();
