/**
 * Provider routes - Email provider detection and OAuth support
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detectProvider, getAllProviders } from '../config/email-providers';
import { authService } from '../services/auth.service';

// Validation schema for provider detection
const DetectProviderSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function providerRoutes(fastify: FastifyInstance) {
  /**
   * POST /providers/detect - Detect email provider from address
   * No auth required (user hasn't logged in yet)
   *
   * Body: { email: string }
   * Returns: { provider: EmailProviderConfig, authUrl?: string }
   */
  fastify.post('/providers/detect', async (request, reply) => {
    const parsed = DetectProviderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: parsed.error.issues,
      });
    }

    const { email } = parsed.data;
    const provider = detectProvider(email);

    const response: any = {
      provider: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        icon: provider.icon,
        authMethod: provider.authMethod,
        domains: provider.domains,
      },
    };

    // Include IMAP defaults if available
    if (provider.imapDefaults) {
      response.provider.imapDefaults = provider.imapDefaults;
    }
    if (provider.smtpDefaults) {
      response.provider.smtpDefaults = provider.smtpDefaults;
    }

    // If OAuth provider, generate the consent URL
    if (provider.authMethod === 'oauth') {
      try {
        response.authUrl = authService.getConsentUrlForEmail(email);
      } catch (error) {
        // If URL generation fails, still return provider info
        response.requiresOauth = true;
      }
    }

    return response;
  });

  /**
   * GET /providers - List all supported email providers
   * No auth required (displayed before login)
   *
   * Returns: { providers: EmailProviderConfig[] }
   */
  fastify.get('/providers', async (request, reply) => {
    const providers = getAllProviders().map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      icon: p.icon,
      authMethod: p.authMethod,
      domains: p.domains,
      ...(p.imapDefaults && { imapDefaults: p.imapDefaults }),
      ...(p.smtpDefaults && { smtpDefaults: p.smtpDefaults }),
    }));

    return { providers };
  });
}
