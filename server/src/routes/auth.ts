/**
 * Auth routes - Google OAuth flow and JWT management.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { detectProvider } from '../config/email-providers';

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/google - Get the Google OAuth consent URL
   */
  fastify.post('/auth/google', async (request, reply) => {
    const url = authService.getConsentUrl();
    return { url };
  });

  /**
   * GET /auth/google/callback - Handle OAuth callback
   * Google redirects here with ?code=...
   */
  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code) {
      return reply.code(400).send({
        error: 'Missing authorization code',
        message: 'No code parameter found in callback URL.',
      });
    }

    try {
      const result = await authService.handleCallback(code, state);

      if (result.addedAccount) {
        // Add-account mode: redirect to accounts page with success indicator
        // Keep the existing session token
        const frontendCallback = `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(result.token)}&added=${encodeURIComponent(result.account.email)}`;
        return reply.redirect(frontendCallback);
      }

      // Normal login: redirect with new token
      const frontendCallback = `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(result.token)}`;
      return reply.redirect(frontendCallback);
    } catch (error: any) {
      const frontendError = `${env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error.message)}`;
      return reply.redirect(frontendError);
    }
  });

  /**
   * POST /auth/connect - Smart connect endpoint for multi-provider OAuth
   * Takes email address, detects provider, returns appropriate auth URL or IMAP instructions
   * No auth required (user hasn't logged in yet)
   */
  fastify.post('/auth/connect', async (request, reply) => {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      token: z.string().optional(), // Existing JWT for add-account mode
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { email, token } = parsed.data;
    const provider = detectProvider(email);

    const response: any = {
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        icon: provider.icon,
        authMethod: provider.authMethod,
      },
    };

    // Handle OAuth providers
    if (provider.authMethod === 'oauth') {
      try {
        // Pass existing token so it's embedded in OAuth state for add-account flow
        response.authUrl = authService.getConsentUrlForEmail(email, token);
      } catch (error: any) {
        // OAuth not available for this provider or error generating URL
        if (provider.imapDefaults || provider.smtpDefaults) {
          // Provider supports IMAP as fallback
          response.requiresImap = true;
          response.message = error.message || `OAuth not available for ${provider.name}. Use IMAP instead.`;
          response.provider.imapDefaults = provider.imapDefaults;
          response.provider.smtpDefaults = provider.smtpDefaults;
        } else {
          return reply.code(400).send({
            error: 'Provider error',
            message: error.message,
          });
        }
      }
    } else {
      // IMAP provider
      response.requiresImap = true;
      if (provider.imapDefaults) {
        response.provider.imapDefaults = provider.imapDefaults;
      }
      if (provider.smtpDefaults) {
        response.provider.smtpDefaults = provider.smtpDefaults;
      }
    }

    return response;
  });

  /**
   * GET /auth/me - Get current authenticated user profile
   */
  fastify.get('/auth/me', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const profile = await authService.getProfile(request.userId);
    return { user: profile };
  });

  /**
   * POST /auth/admin/merge-accounts - TEMPORARY: Merge orphaned accounts
   * Moves email accounts from one user to another (for fixing the add-account bug).
   * Protected by a simple secret key.
   */
  fastify.post('/auth/admin/merge-accounts', async (request, reply) => {
    const { secret, target_email, source_email } = request.body as {
      secret?: string;
      target_email?: string; // Primary user email (e.g. jesper.melin89@gmail.com)
      source_email?: string; // Orphaned user email (e.g. jesper.melin@gmail.com)
    };

    // Simple protection — only allow with correct secret
    if (secret !== env.JWT_SECRET) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    if (!target_email || !source_email) {
      return reply.code(400).send({ error: 'target_email and source_email required' });
    }

    // Find both users
    const targetUser = await prisma.user.findUnique({ where: { email: target_email } });
    const sourceUser = await prisma.user.findUnique({ where: { email: source_email } });

    if (!targetUser) {
      return reply.code(404).send({ error: `Target user ${target_email} not found` });
    }
    if (!sourceUser) {
      return reply.code(404).send({ error: `Source user ${source_email} not found` });
    }

    // Find accounts belonging to the source user
    const sourceAccounts = await prisma.emailAccount.findMany({
      where: { userId: sourceUser.id },
    });

    const results: any[] = [];

    for (const account of sourceAccounts) {
      // Check if target user already has this email
      const existing = await prisma.emailAccount.findFirst({
        where: { userId: targetUser.id, emailAddress: account.emailAddress },
      });

      if (existing) {
        // Update existing with fresh tokens from the source account
        await prisma.emailAccount.update({
          where: { id: existing.id },
          data: {
            accessTokenEncrypted: account.accessTokenEncrypted,
            refreshTokenEncrypted: account.refreshTokenEncrypted,
            tokenExpiresAt: account.tokenExpiresAt,
          },
        });
        // Delete the source account
        await prisma.emailAccount.delete({ where: { id: account.id } });
        results.push({ email: account.emailAddress, action: 'updated_existing' });
      } else {
        // Move account to target user
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: { userId: targetUser.id, isDefault: false },
        });
        results.push({ email: account.emailAddress, action: 'moved_to_target' });
      }
    }

    // Clean up source user settings
    await prisma.userSettings.deleteMany({ where: { userId: sourceUser.id } });
    // Clean up source action logs
    await prisma.actionLog.deleteMany({ where: { userId: sourceUser.id } });
    // Delete the orphaned source user
    await prisma.user.delete({ where: { id: sourceUser.id } });

    return {
      message: 'Accounts merged successfully',
      target_user: targetUser.email,
      source_user_deleted: sourceUser.email,
      accounts: results,
    };
  });
}
