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
        const frontendCallback = `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(result.token)}&added=${encodeURIComponent(result.account.email)}`;
        return reply.redirect(frontendCallback);
      }

      if ((result as any).reauthed) {
        // Reauth mode: account restored — redirect with fresh token
        const frontendCallback = `${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(result.token)}&reauthed=${encodeURIComponent(result.account.email)}`;
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
    const { account_id } = request.query as { account_id?: string };
    if (!account_id) {
      return reply.code(400).send({ error: 'Missing account_id parameter' });
    }
    const url = authService.getReauthUrl(account_id);
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
}
