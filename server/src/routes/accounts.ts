/**
 * Account routes - Manage connected email accounts.
 * Supports Gmail (OAuth), IMAP/SMTP (custom domain), and future providers.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { encrypt } from '../utils/encryption';
import { emailProviderFactory } from '../services/email-provider.factory';
import { actionLogService } from '../services/action-log.service';
import { startSyncNow } from '../services/sync-scheduler.service';

// Validation schema for adding IMAP/SMTP accounts
const AddImapAccountSchema = z.object({
  email_address: z.string().email(),
  display_name: z.string().optional(),
  label: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  imap_host: z.string().min(1),
  imap_port: z.number().int().positive().default(993),
  imap_use_ssl: z.boolean().default(true),
  smtp_host: z.string().min(1),
  smtp_port: z.number().int().positive().default(465),
  smtp_use_ssl: z.boolean().default(true),
  password: z.string().min(1),
});

// Validation schema for updating account settings
const UpdateAccountSchema = z.object({
  display_name: z.string().optional(),
  label: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  is_active: z.boolean().optional(),
  signature: z.string().max(2000).nullable().optional(),
  account_type: z.enum(['personal', 'team', 'shared']).optional(),
  team_members: z.array(z.string().email()).optional(),
  ai_handling: z.enum(['normal', 'separate', 'notify_only']).optional(),
});

export async function accountRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /accounts - List all connected accounts for the user
   */
  fastify.get('/accounts', async (request) => {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: request.userId },
      select: {
        id: true,
        emailAddress: true,
        displayName: true,
        provider: true,
        isDefault: true,
        isActive: true,
        label: true,
        color: true,
        badges: true,
        signature: true,
        accountType: true,
        teamMembers: true,
        aiHandling: true,
        lastSyncAt: true,
        syncError: true,
        createdAt: true,
        _count: { select: { threads: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Flatten _count into threadCount
    const accountsWithCount = accounts.map(({ _count, ...a }) => ({
      ...a,
      threadCount: _count.threads,
    }));

    return { accounts: accountsWithCount };
  });

  /**
   * POST /accounts/imap - Connect a custom domain email via IMAP/SMTP
   */
  fastify.post('/accounts/imap', async (request, reply) => {
    const parsed = AddImapAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const data = parsed.data;

    // Check if account already exists
    const existing = await prisma.emailAccount.findFirst({
      where: { userId: request.userId, emailAddress: data.email_address },
    });
    if (existing) {
      return reply.code(409).send({ error: 'This email address is already connected.' });
    }

    // Test connection before saving
    const testResult = await emailProviderFactory.testConnection('imap', {
      imapHost: data.imap_host,
      imapPort: data.imap_port,
      imapUseSsl: data.imap_use_ssl,
      smtpHost: data.smtp_host,
      smtpPort: data.smtp_port,
      smtpUseSsl: data.smtp_use_ssl,
      user: data.email_address,
      password: data.password,
    });

    if (!testResult.success) {
      return reply.code(400).send({
        error: 'Connection test failed',
        message: testResult.error,
        details: testResult.details,
      });
    }

    // Save account with encrypted password
    const account = await prisma.emailAccount.create({
      data: {
        userId: request.userId,
        provider: 'imap',
        emailAddress: data.email_address,
        displayName: data.display_name || null,
        label: data.label || null,
        color: data.color || null,
        imapHost: data.imap_host,
        imapPort: data.imap_port,
        imapUseSsl: data.imap_use_ssl,
        smtpHost: data.smtp_host,
        smtpPort: data.smtp_port,
        smtpUseSsl: data.smtp_use_ssl,
        imapPasswordEncrypted: encrypt(data.password),
        isDefault: false,
        isActive: true,
      },
    });

    await actionLogService.log(request.userId, 'account_connected', 'account', account.id, {
      email: data.email_address,
      provider: 'imap',
      imapHost: data.imap_host,
    });

    return reply.code(201).send({
      account: {
        id: account.id,
        emailAddress: account.emailAddress,
        provider: account.provider,
        label: account.label,
      },
      message: 'IMAP/SMTP account connected successfully.',
      mailboxes: testResult.details?.mailboxes,
    });
  });

  /**
   * POST /accounts/test-imap - Test IMAP/SMTP connection without saving
   */
  fastify.post('/accounts/test-imap', async (request, reply) => {
    const parsed = AddImapAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const data = parsed.data;

    const result = await emailProviderFactory.testConnection('imap', {
      imapHost: data.imap_host,
      imapPort: data.imap_port,
      imapUseSsl: data.imap_use_ssl,
      smtpHost: data.smtp_host,
      smtpPort: data.smtp_port,
      smtpUseSsl: data.smtp_use_ssl,
      user: data.email_address,
      password: data.password,
    });

    return result;
  });

  /**
   * PATCH /accounts/:id - Update account settings (label, color, active status)
   */
  fastify.patch('/accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateAccountSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input', details: parsed.error.issues });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: {
        ...(parsed.data.display_name !== undefined && { displayName: parsed.data.display_name }),
        ...(parsed.data.label !== undefined && { label: parsed.data.label }),
        ...(parsed.data.color !== undefined && { color: parsed.data.color }),
        ...(parsed.data.is_active !== undefined && { isActive: parsed.data.is_active }),
        ...(parsed.data.signature !== undefined && { signature: parsed.data.signature }),
        ...(parsed.data.account_type !== undefined && { accountType: parsed.data.account_type }),
        ...(parsed.data.team_members !== undefined && { teamMembers: parsed.data.team_members }),
        ...(parsed.data.ai_handling !== undefined && { aiHandling: parsed.data.ai_handling }),
      },
      select: {
        id: true,
        emailAddress: true,
        displayName: true,
        provider: true,
        isDefault: true,
        isActive: true,
        label: true,
        color: true,
        signature: true,
        accountType: true,
        teamMembers: true,
        aiHandling: true,
      },
    });

    return { account: updated };
  });

  /**
   * POST /accounts/set-default - Set a default sender account
   */
  fastify.post('/accounts/set-default', async (request, reply) => {
    const { account_id } = request.body as { account_id: string };

    if (!account_id) {
      return reply.code(400).send({ error: 'account_id is required' });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id: account_id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    await prisma.$transaction([
      prisma.emailAccount.updateMany({
        where: { userId: request.userId },
        data: { isDefault: false },
      }),
      prisma.emailAccount.update({
        where: { id: account_id },
        data: { isDefault: true },
      }),
      prisma.userSettings.upsert({
        where: { userId: request.userId },
        update: { defaultAccountId: account_id },
        create: { userId: request.userId, defaultAccountId: account_id },
      }),
    ]);

    return { message: 'Default account updated', account_id };
  });

  /**
   * DELETE /accounts/:id - Disconnect an account
   */
  fastify.delete('/accounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    // Don't allow deleting the last account
    const accountCount = await prisma.emailAccount.count({
      where: { userId: request.userId },
    });

    if (accountCount <= 1) {
      return reply.code(400).send({
        error: 'Cannot delete your only email account. Connect another account first.',
      });
    }

    await prisma.emailAccount.delete({ where: { id } });

    await actionLogService.log(request.userId, 'account_disconnected', 'account', id, {
      email: account.emailAddress,
      provider: account.provider,
    });

    return { message: 'Account disconnected', email: account.emailAddress };
  });

  /**
   * POST /accounts/:id/sync — Trigger immediate sync for a specific account
   */
  fastify.post('/accounts/:id/sync', async (request, reply) => {
    const { id } = request.params as { id: string };

    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
    });
    if (!account) return reply.code(404).send({ error: 'Account not found' });

    // Trigger global sync (runs all active accounts — scoped sync not critical for this)
    startSyncNow().catch(() => {});
    return { message: 'Synkronisering startad' };
  });

  // ============================================================
  // BADGE MANAGEMENT
  // Badges: multi_person | ai_managed | shared_inbox
  // ============================================================

  const VALID_BADGES = ['multi_person', 'ai_managed', 'shared_inbox'];

  /**
   * POST /accounts/:id/badges - Add a badge to an account
   */
  fastify.post('/accounts/:id/badges', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { badge } = request.body as { badge: string };

    if (!badge || !VALID_BADGES.includes(badge)) {
      return reply.code(400).send({
        error: `Invalid badge. Must be one of: ${VALID_BADGES.join(', ')}`,
      });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    // Add badge if not already present
    const currentBadges = account.badges || [];
    if (currentBadges.includes(badge)) {
      return { account: { id, badges: currentBadges }, message: 'Badge already set' };
    }

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: { badges: [...currentBadges, badge] },
      select: { id: true, emailAddress: true, badges: true },
    });

    return { account: updated, message: `Badge '${badge}' added` };
  });

  /**
   * DELETE /accounts/:id/badges/:badge - Remove a badge from an account
   */
  fastify.delete('/accounts/:id/badges/:badge', async (request, reply) => {
    const { id, badge } = request.params as { id: string; badge: string };

    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
    });

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const currentBadges = account.badges || [];
    const updated = await prisma.emailAccount.update({
      where: { id },
      data: { badges: currentBadges.filter((b: string) => b !== badge) },
      select: { id: true, emailAddress: true, badges: true },
    });

    return { account: updated, message: `Badge '${badge}' removed` };
  });

  // ============================================================
  // SPRINT 3 — Signature endpoints
  // ============================================================

  /**
   * GET /accounts/:id/signature — Get signature for an account.
   */
  fastify.get('/accounts/:id/signature', async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: request.userId },
      select: { id: true, emailAddress: true, signature: true, signatureHtml: true, useSignatureOnNew: true, useSignatureOnReply: true },
    });
    if (!account) return reply.code(404).send({ error: 'Account not found' });
    return { signature: account };
  });

  /**
   * PUT /accounts/:id/signature — Save/update signature for an account.
   */
  fastify.put('/accounts/:id/signature', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { text, html, useOnNew, useOnReply } = request.body as {
      text?: string;
      html?: string;
      useOnNew?: boolean;
      useOnReply?: boolean;
    };

    const account = await prisma.emailAccount.findFirst({ where: { id, userId: request.userId } });
    if (!account) return reply.code(404).send({ error: 'Account not found' });

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: {
        ...(text !== undefined && { signature: text }),
        ...(html !== undefined && { signatureHtml: html }),
        ...(useOnNew !== undefined && { useSignatureOnNew: useOnNew }),
        ...(useOnReply !== undefined && { useSignatureOnReply: useOnReply }),
      },
      select: { id: true, emailAddress: true, signature: true, signatureHtml: true, useSignatureOnNew: true, useSignatureOnReply: true },
    });
    return { signature: updated };
  });
}
