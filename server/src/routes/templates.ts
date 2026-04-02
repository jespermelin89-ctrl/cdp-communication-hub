/**
 * Email Template routes
 *
 * GET    /templates             — List templates
 * POST   /templates             — Create template
 * PATCH  /templates/:id         — Update template
 * DELETE /templates/:id         — Delete template
 * POST   /templates/:id/use     — Increment usageCount, return template
 * POST   /templates/generate    — AI generate template from instructions
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authMiddleware } from '../middleware/auth.middleware';
import { aiService } from '../services/ai.service';

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(500).optional(),
  body_text: z.string().optional(),
  body_html: z.string().optional(),
  category: z.string().max(100).optional(),
  variables: z.record(z.unknown()).optional(),
});

const UpdateTemplateSchema = CreateTemplateSchema.partial();

export async function templatesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /templates
  fastify.get('/templates', async (request) => {
    const templates = await prisma.emailTemplate.findMany({
      where: { userId: request.userId },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    });
    return { templates };
  });

  // POST /templates — create
  fastify.post('/templates', async (request, reply) => {
    const body = CreateTemplateSchema.parse(request.body);

    const template = await prisma.emailTemplate.create({
      data: {
        userId: request.userId,
        name: body.name,
        subject: body.subject ?? null,
        bodyText: body.body_text ?? null,
        bodyHtml: body.body_html ?? null,
        category: body.category ?? null,
        variables: body.variables ? (body.variables as any) : null,
      },
    });

    return { template };
  });

  // PATCH /templates/:id — update
  fastify.patch('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateTemplateSchema.parse(request.body);

    const existing = await prisma.emailTemplate.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.subject !== undefined && { subject: body.subject }),
        ...(body.body_text !== undefined && { bodyText: body.body_text }),
        ...(body.body_html !== undefined && { bodyHtml: body.body_html }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.variables !== undefined && { variables: body.variables as any }),
      },
    });

    return { template };
  });

  // DELETE /templates/:id
  fastify.delete('/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.emailTemplate.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    await prisma.emailTemplate.delete({ where: { id } });
    return { ok: true };
  });

  // POST /templates/:id/use — increment usageCount, return template
  fastify.post('/templates/:id/use', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.emailTemplate.findFirst({
      where: { id, userId: request.userId },
    });
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const template = await prisma.emailTemplate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });

    return { template };
  });

  // POST /templates/generate — AI generates template from instructions
  fastify.post('/templates/generate', async (request, reply) => {
    const body = request.body as { instructions: string; name?: string; category?: string };

    if (!body.instructions) {
      return reply.code(400).send({ error: 'instructions is required' });
    }

    try {
      const prompt = `Skriv en e-postmall baserat på följande instruktion. Svara med JSON i formatet:
{"subject": "...", "body_text": "...", "body_html": "..."}

Instruktion: ${body.instructions}

Skriv på svenska om inte instruktionen specificerar annat. Gör mallen professionell och klar för användning.`;

      const result = await aiService.chat('Du är en expert på att skriva e-postmallar.', prompt);
      let parsed: { subject?: string; body_text?: string; body_html?: string } = {};

      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        parsed = { body_text: result };
      }

      const template = await prisma.emailTemplate.create({
        data: {
          userId: request.userId,
          name: body.name ?? `AI-mall ${new Date().toLocaleDateString('sv-SE')}`,
          subject: parsed.subject ?? null,
          bodyText: parsed.body_text ?? null,
          bodyHtml: parsed.body_html ?? null,
          category: body.category ?? 'ai-generated',
        },
      });

      return { template };
    } catch (err: any) {
      return reply.code(500).send({ error: 'AI generation failed', message: err.message });
    }
  });
}
