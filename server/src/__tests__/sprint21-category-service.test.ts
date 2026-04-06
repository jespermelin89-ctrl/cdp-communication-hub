/**
 * Sprint 21 — Category Service Tests
 *
 * Covers category.service.ts:
 *   ensureDefaults  — idempotent system-category seeding
 *   getAll          — calls ensureDefaults, returns sorted list
 *   create          — slug generation from name
 *   createRule      — resolves categoryId from slug, stores rule
 *   matchRules      — 4 pattern types: exact, domain wildcard, glob wildcard, subject regex
 *   classifyThreads — batch match + timesApplied increment
 *   deleteCategory  — guards against system categories
 *   deleteRule      — delegates to Prisma
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    senderRule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../config/database';
import { categoryService } from '../services/category.service';

const USER_ID = 'user-cat';

const makeRule = (overrides: object) => ({
  id: 'r1',
  userId: USER_ID,
  senderPattern: 'test@example.com',
  subjectPattern: null,
  action: 'archive',
  categoryId: null,
  category: null,
  isActive: true,
  timesApplied: 0,
  ...overrides,
});

describe('Sprint 21 — Category Service', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── ensureDefaults ────────────────────────────────────────────────────────

  describe('ensureDefaults', () => {
    it('returns existing categories without seeding when already present', async () => {
      const existing = [{ id: 'c1', name: 'Important' }, { id: 'c2', name: 'Business' }];
      (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

      const result = await categoryService.ensureDefaults(USER_ID);

      expect(result).toBe(existing);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('creates 7 system categories when none exist', async () => {
      (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.category.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `c-${data.slug}`, ...data })
      );

      const result = await categoryService.ensureDefaults(USER_ID);

      expect(prisma.category.create).toHaveBeenCalledTimes(7);
      expect(result).toHaveLength(7);
    });

    it('marks seeded categories as isSystem: true', async () => {
      (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (prisma.category.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      await categoryService.ensureDefaults(USER_ID);

      const firstCall = (prisma.category.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(firstCall.data.isSystem).toBe(true);
      expect(firstCall.data.userId).toBe(USER_ID);
    });

    it('includes spam category in defaults', async () => {
      (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const created: any[] = [];
      (prisma.category.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: any) => {
        const item = { id: `c-${data.slug}`, ...data };
        created.push(item);
        return Promise.resolve(item);
      });

      await categoryService.ensureDefaults(USER_ID);

      const slugs = created.map((c) => c.slug);
      expect(slugs).toContain('spam');
      expect(slugs).toContain('important');
      expect(slugs).toContain('business');
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('generates slug from name (lowercase, hyphenated)', async () => {
      (prisma.category.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      await categoryService.create(USER_ID, { name: 'My Custom Category' });

      const createCall = (prisma.category.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.slug).toBe('my-custom-category');
    });

    it('strips special characters from slug', async () => {
      (prisma.category.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      await categoryService.create(USER_ID, { name: 'CI/CD & Deploys!' });

      const createCall = (prisma.category.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.slug).toBe('ci-cd-deploys');
    });

    it('strips leading/trailing hyphens from slug', async () => {
      (prisma.category.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      await categoryService.create(USER_ID, { name: '---Test---' });

      const createCall = (prisma.category.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.slug).not.toMatch(/^-|-$/);
    });
  });

  // ── matchRules ────────────────────────────────────────────────────────────

  describe('matchRules', () => {
    it('returns null when no rules exist', async () => {
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await categoryService.matchRules(USER_ID, 'anyone@test.com');
      expect(result).toBeNull();
    });

    it('exact match — case insensitive', async () => {
      const rule = makeRule({ senderPattern: 'NOREPLY@GITHUB.COM', action: 'archive' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'noreply@github.com');
      expect(result).toBe(rule);
    });

    it('exact match — does not match partial address', async () => {
      const rule = makeRule({ senderPattern: 'user@example.com' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'otheruser@example.com');
      expect(result).toBeNull();
    });

    it('domain wildcard — *@domain.com matches any sender at that domain', async () => {
      const rule = makeRule({ senderPattern: '*@github.com', action: 'archive' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'notifications@github.com');
      expect(result).toBe(rule);
    });

    it('domain wildcard — does not match different domain', async () => {
      const rule = makeRule({ senderPattern: '*@github.com' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'user@gitlab.com');
      expect(result).toBeNull();
    });

    it('domain wildcard — *@sub.domain.com matches exactly', async () => {
      const rule = makeRule({ senderPattern: '*@mail.skool.com' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'noreply@mail.skool.com');
      expect(result).toBe(rule);
    });

    it('glob wildcard *keyword* — matches sender containing keyword', async () => {
      const rule = makeRule({ senderPattern: '*skool*', action: 'classify' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'newsletter@skool.com');
      expect(result).toBe(rule);
    });

    it('glob wildcard *keyword* — does not match unrelated sender', async () => {
      const rule = makeRule({ senderPattern: '*skool*' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'user@gmail.com');
      expect(result).toBeNull();
    });

    it('glob wildcard is case-insensitive', async () => {
      const rule = makeRule({ senderPattern: '*GITHUB*' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(USER_ID, 'actions@github.com');
      expect(result).toBe(rule);
    });

    it('subject pattern — matches when sender is exact AND subject matches regex', async () => {
      const rule = makeRule({
        senderPattern: 'builds@ci.company.com',
        subjectPattern: 'CI.*failed',
        action: 'classify',
      });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(
        USER_ID,
        'builds@ci.company.com',
        'CI Pipeline failed'
      );
      expect(result).toBe(rule);
    });

    it('exact sender match fires before subject pattern check — returns rule regardless of subject', async () => {
      // Rule 1 (exact match) fires before Rule 4 (subject pattern).
      // A rule with senderPattern === sender is returned even if subject doesn't match subjectPattern.
      const rule = makeRule({
        senderPattern: 'builds@ci.company.com',
        subjectPattern: 'CI.*failed',
      });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);

      const result = await categoryService.matchRules(
        USER_ID,
        'builds@ci.company.com',
        'CI Pipeline succeeded' // does not match subjectPattern, but exact sender wins
      );
      // Exact match (rule 1) fires first — subjectPattern is not a filter when sender is exact
      expect(result).toBe(rule);
    });

    it('invalid regex in subjectPattern — skips rule gracefully (no throw)', async () => {
      const badRule = makeRule({
        senderPattern: 'builds@ci.company.com',
        subjectPattern: '[invalid regex((',
      });
      const goodRule = makeRule({ id: 'r2', senderPattern: 'builds@ci.company.com', subjectPattern: null });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([badRule, goodRule]);

      // Should not throw even with invalid regex
      await expect(
        categoryService.matchRules(USER_ID, 'builds@ci.company.com', 'subject')
      ).resolves.toBeDefined();
    });

    it('returns first matching rule (order preserved)', async () => {
      const rule1 = makeRule({ id: 'r1', senderPattern: '*github*', action: 'archive' });
      const rule2 = makeRule({ id: 'r2', senderPattern: '*@github.com', action: 'classify' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule1, rule2]);

      const result = await categoryService.matchRules(USER_ID, 'pr@github.com');
      // rule1 (*github*) should match first via glob wildcard
      expect(result?.id).toBe('r1');
    });

    it('queries only active rules', async () => {
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await categoryService.matchRules(USER_ID, 'test@test.com');

      expect(prisma.senderRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, isActive: true },
        })
      );
    });
  });

  // ── classifyThreads ───────────────────────────────────────────────────────

  describe('classifyThreads', () => {
    it('returns empty object when no threads match', async () => {
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await categoryService.classifyThreads(USER_ID, [
        { id: 't1', senderEmail: 'user@test.com' },
      ]);

      expect(result).toEqual({});
    });

    it('maps matched thread to category/action/rule', async () => {
      const rule = makeRule({ senderPattern: '*github*', action: 'archive', category: { name: 'Dev & CI/CD' } });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (prisma.senderRule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await categoryService.classifyThreads(USER_ID, [
        { id: 't1', senderEmail: 'pr@github.com' },
      ]);

      expect(result['t1']).toMatchObject({
        action: 'archive',
        rule: rule,
        category: { name: 'Dev & CI/CD' },
      });
    });

    it('increments timesApplied for matched rule', async () => {
      const rule = makeRule({ senderPattern: '*github*', action: 'archive' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (prisma.senderRule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await categoryService.classifyThreads(USER_ID, [
        { id: 't1', senderEmail: 'pr@github.com' },
      ]);

      expect(prisma.senderRule.update).toHaveBeenCalledWith({
        where: { id: rule.id },
        data: { timesApplied: { increment: 1 } },
      });
    });

    it('processes multiple threads independently', async () => {
      const rule = makeRule({ senderPattern: '*github*', action: 'archive' });
      (prisma.senderRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rule]);
      (prisma.senderRule.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await categoryService.classifyThreads(USER_ID, [
        { id: 't1', senderEmail: 'pr@github.com' },
        { id: 't2', senderEmail: 'invoice@stripe.com' }, // no match
        { id: 't3', senderEmail: 'actions@github.com' },
      ]);

      expect(Object.keys(result)).toEqual(['t1', 't3']);
      expect(result['t2']).toBeUndefined();
    });
  });

  // ── deleteCategory ────────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    it('throws when trying to delete a system category', async () => {
      (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'c1', isSystem: true,
      });

      await expect(categoryService.deleteCategory('c1')).rejects.toThrow(
        'Cannot delete system categories'
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('deletes non-system category', async () => {
      (prisma.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'c1', isSystem: false,
      });
      (prisma.category.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      await categoryService.deleteCategory('c1');

      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  // ── createRule ────────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('creates rule without categorySlug — categoryId is null', async () => {
      (prisma.senderRule.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      await categoryService.createRule(USER_ID, {
        senderPattern: '*@spam.com',
        action: 'trash',
      });

      const createCall = (prisma.senderRule.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.categoryId).toBeNull();
    });

    it('resolves categoryId from slug when categorySlug provided', async () => {
      (prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'existing' }]); // ensureDefaults: already exist
      (prisma.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'cat-dev' });
      (prisma.senderRule.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      await categoryService.createRule(USER_ID, {
        senderPattern: '*@github.com',
        action: 'classify',
        categorySlug: 'dev-cicd',
      });

      const createCall = (prisma.senderRule.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.categoryId).toBe('cat-dev');
    });

    it('sets subjectPattern to null when not provided', async () => {
      (prisma.senderRule.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'r1' });

      await categoryService.createRule(USER_ID, {
        senderPattern: '*@spam.com',
        action: 'trash',
      });

      const createCall = (prisma.senderRule.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.subjectPattern).toBeNull();
    });
  });
});
