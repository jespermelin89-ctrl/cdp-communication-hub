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
import { normalizeBookingLinkInput } from '../utils/booking-link';
import { sanitizeReturnTo } from '../utils/return-to';

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
        const frontendCallback = `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(result.token)}&added=${encodeURIComponent(result.account.email)}`;
        return reply.redirect(frontendCallback);
      }

      if ((result as any).reauthed) {
        // Reauth mode: account restored — redirect with fresh token
        const params = new URLSearchParams({
          token: result.token,
          reauthed: result.account.email,
        });
        if ((result as any).feature) {
          params.set('feature', (result as any).feature);
        }
        if ((result as any).returnTo) {
          params.set('return_to', (result as any).returnTo);
        }
        const frontendCallback = `${env.FRONTEND_URL}/auth/callback?${params.toString()}`;
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
   * GET /auth/google/reauth - Re-authenticate a revoked Gmail account.
   * No auth required — the user may have lost their session.
   * Redirects to Google OAuth with reauth state so the callback can restore the account.
   */
  fastify.get('/auth/google/reauth', async (request, reply) => {
    const querySchema = z.object({
      account_id: z.string().min(1),
      feature: z.enum(['calendar', 'calendar_write']).optional(),
      return_to: z.string().min(1).optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Missing account_id parameter' });
    }
    const { account_id, feature, return_to } = parsed.data;
    const url = authService.getReauthUrl(account_id, {
      feature,
      returnTo: sanitizeReturnTo(return_to),
    });
    return reply.redirect(url);
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
   * GET /user/settings - Get user settings (includes quiet hours, digest, theme)
   */
  fastify.get('/user/settings', {
    preHandler: authMiddleware,
  }, async (request) => {
    const { prisma } = await import('../config/database');
    const settings = await prisma.userSettings.findUnique({ where: { userId: request.userId } });
    return { settings };
  });

  const UpdateUserSettingsSchema = z.object({
    quietHoursStart: z.number().optional(),
    quietHoursEnd: z.number().optional(),
    digestEnabled: z.boolean().optional(),
    digestTime: z.number().optional(),
    uiTheme: z.string().optional(),
    bookingLink: z.string().nullable().optional(),
    undoSendDelay: z.number().int().min(0).max(30).optional(),
    hasCompletedOnboarding: z.boolean().optional(),
    notificationSound: z.boolean().optional(),
    externalImages: z.enum(['ask', 'allow', 'block']).optional(),
    compactMode: z.boolean().optional(),
  });

  /**
   * PATCH /user/settings - Update user settings
   */
  fastify.patch('/user/settings', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    const { prisma } = await import('../config/database');
    const body = UpdateUserSettingsSchema.parse(request.body);

    const allowed: Record<string, unknown> = {};
    if (body.quietHoursStart !== undefined) allowed.quietHoursStart = Number(body.quietHoursStart);
    if (body.quietHoursEnd !== undefined) allowed.quietHoursEnd = Number(body.quietHoursEnd);
    if (body.digestEnabled !== undefined) allowed.digestEnabled = Boolean(body.digestEnabled);
    if (body.digestTime !== undefined) allowed.digestTime = Number(body.digestTime);
    if (body.uiTheme !== undefined) allowed.uiTheme = body.uiTheme;
    try {
      const bookingLink = normalizeBookingLinkInput(body.bookingLink);
      if (bookingLink !== undefined) allowed.bookingLink = bookingLink;
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
    if (body.undoSendDelay !== undefined) allowed.undoSendDelay = Math.max(0, Math.min(30, Number(body.undoSendDelay)));
    if (body.hasCompletedOnboarding !== undefined) allowed.hasCompletedOnboarding = Boolean(body.hasCompletedOnboarding);
    if (body.notificationSound !== undefined) allowed.notificationSound = Boolean(body.notificationSound);
    if (body.externalImages !== undefined && ['ask', 'allow', 'block'].includes(body.externalImages)) allowed.externalImages = body.externalImages;
    if (body.compactMode !== undefined) allowed.compactMode = Boolean(body.compactMode);

    const settings = await prisma.userSettings.upsert({
      where: { userId: request.userId },
      update: allowed,
      create: { userId: request.userId, ...allowed },
    });
    return { settings };
  });
}
