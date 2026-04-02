/**
 * Category & Sender Rule routes
 *
 * GET    /categories                  — list all categories
 * POST   /categories                  — create custom category
 * DELETE /categories/:id              — delete custom category
 * GET    /categories/rules            — list all sender rules
 * POST   /categories/rules            — create a sender rule
 * DELETE /categories/rules/:id        — delete a rule
 * POST   /categories/classify         — run classification on recent threads
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { categoryService } from '../services/category.service';
import { prisma } from '../config/database';

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().max(500).optional(),
});

const CreateCategoryRuleSchema = z.object({
  sender_pattern: z.string().optional(),
  subject_pattern: z.string().optional(),
  action: z.string(),
  category_slug: z.string(),
  priority: z.number().int().min(0).max(100).optional(),
});

export default async function categoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // List categories
  app.get('/categories', async (req) => {
    const categories = await categoryService.getAll(req.userId!);
    return { categories };
  });

  // Create custom category
  app.post('/categories', async (req) => {
    const { name, color, icon, description } = CreateCategorySchema.parse(req.body);
    const category = await categoryService.create(req.userId!, { name, color, icon, description });
    return { category, message: `Category "${name}" created` };
  });

  // Delete category
  app.delete('/categories/:id', async (req) => {
    const { id } = req.params as { id: string };
    await categoryService.deleteCategory(id);
    return { message: 'Category deleted' };
  });

  // List sender rules
  app.get('/categories/rules', async (req) => {
    const rules = await categoryService.getRules(req.userId!);
    return { rules };
  });

  // Create sender rule
  app.post('/categories/rules', async (req) => {
    const { sender_pattern, subject_pattern, action, category_slug, priority } = CreateCategoryRuleSchema.parse(req.body);
    if (!sender_pattern) throw new Error('sender_pattern is required');

    const rule = await categoryService.createRule(req.userId!, {
      senderPattern: sender_pattern,
      subjectPattern: subject_pattern,
      action,
      categorySlug: category_slug,
      priority: priority !== undefined ? String(priority) : undefined,
    });

    return { rule, message: `Rule created: ${sender_pattern} → ${action}` };
  });

  // Delete sender rule
  app.delete('/categories/rules/:id', async (req) => {
    const { id } = req.params as { id: string };
    await categoryService.deleteRule(id);
    return { message: 'Rule deleted' };
  });

  // Classify recent threads against rules
  app.post('/categories/classify', async (req) => {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId!, isActive: true },
    });

    const threads = await prisma.emailThread.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
      include: { account: true },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });

    const toClassify = threads.map((t) => ({
      id: t.id,
      senderEmail: t.participantEmails.find((e) => e !== t.account.emailAddress) || t.participantEmails[0] || '',
      subject: t.subject || undefined,
    }));

    const results = await categoryService.classifyThreads(req.userId!, toClassify);
    const matchCount = Object.keys(results).length;

    return {
      classified: matchCount,
      total: threads.length,
      results,
      message: `${matchCount} of ${threads.length} threads matched rules`,
    };
  });
}
