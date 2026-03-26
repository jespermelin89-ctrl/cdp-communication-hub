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
import { authMiddleware } from '../middleware/auth.middleware';
import { categoryService } from '../services/category.service';
import { prisma } from '../config/database';

export default async function categoryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // List categories
  app.get('/categories', async (req) => {
    const categories = await categoryService.getAll(req.userId!);
    return { categories };
  });

  // Create custom category
  app.post('/categories', async (req) => {
    const { name, color, icon, description } = req.body as any;
    if (!name) throw new Error('name is required');
    const category = await categoryService.create(req.userId!, { name, color, icon, description });
    return { category, message: `Category "${name}" created` };
  });

  // Delete category
  app.delete('/categories/:id', async (req) => {
    const { id } = req.params as any;
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
    const { sender_pattern, subject_pattern, action, category_slug, priority } = req.body as any;
    if (!sender_pattern || !action) throw new Error('sender_pattern and action are required');

    const rule = await categoryService.createRule(req.userId!, {
      senderPattern: sender_pattern,
      subjectPattern: subject_pattern,
      action,
      categorySlug: category_slug,
      priority,
    });

    return { rule, message: `Rule created: ${sender_pattern} → ${action}` };
  });

  // Delete sender rule
  app.delete('/categories/rules/:id', async (req) => {
    const { id } = req.params as any;
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
