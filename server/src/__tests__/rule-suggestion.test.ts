/**
 * Tests for rule-suggestion.service.ts (Sprint 4)
 *
 * Pure unit tests — all DB calls mocked.
 * Covers: checkAndCreateSuggestion, generateSuggestions, acceptSuggestion, dismissSuggestion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    triageLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    ruleSuggestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    classificationRule: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../config/database';

const mockTriageLog = prisma.triageLog as {
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
};
const mockRuleSuggestion = prisma.ruleSuggestion as {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const mockClassificationRule = prisma.classificationRule as {
  create: ReturnType<typeof vi.fn>;
};

import {
  checkAndCreateSuggestion,
  generateSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  getPendingSuggestions,
} from '../services/rule-suggestion.service';

beforeEach(() => vi.clearAllMocks());

// ──────────────────────────────────────────────
// checkAndCreateSuggestion
// ──────────────────────────────────────────────

describe('checkAndCreateSuggestion', () => {
  it('does nothing when trash count is below threshold', async () => {
    mockTriageLog.count.mockResolvedValue(1); // < 2

    await checkAndCreateSuggestion('newsletter@example.com', 'user-1');

    expect(mockRuleSuggestion.findFirst).not.toHaveBeenCalled();
    expect(mockRuleSuggestion.create).not.toHaveBeenCalled();
  });

  it('creates a suggestion when threshold is met', async () => {
    mockTriageLog.count.mockResolvedValue(2);
    mockRuleSuggestion.findFirst.mockResolvedValue(null); // no existing suggestion

    await checkAndCreateSuggestion('promo@shop.com', 'user-1');

    expect(mockRuleSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          senderPattern: '*@shop.com',
          suggestedAction: 'trash',
          triggerCount: 2,
          status: 'pending',
        }),
      })
    );
  });

  it('derives domain pattern correctly from email', async () => {
    mockTriageLog.count.mockResolvedValue(3);
    mockRuleSuggestion.findFirst.mockResolvedValue(null);

    await checkAndCreateSuggestion('no-reply@mail.instagram.com', 'user-1');

    expect(mockRuleSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderPattern: '*@mail.instagram.com' }),
      })
    );
  });

  it('updates trigger count for existing pending suggestion', async () => {
    mockTriageLog.count.mockResolvedValue(5);
    mockRuleSuggestion.findFirst.mockResolvedValue({
      id: 'sug-001',
      status: 'pending',
      triggerCount: 3,
    });

    await checkAndCreateSuggestion('news@example.com', 'user-1');

    expect(mockRuleSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sug-001' },
        data: { triggerCount: 5 },
      })
    );
    expect(mockRuleSuggestion.create).not.toHaveBeenCalled();
  });

  it('does not re-open an accepted suggestion', async () => {
    mockTriageLog.count.mockResolvedValue(10);
    mockRuleSuggestion.findFirst.mockResolvedValue({
      id: 'sug-002',
      status: 'accepted',
      triggerCount: 4,
    });

    await checkAndCreateSuggestion('promo@shop.com', 'user-1');

    expect(mockRuleSuggestion.update).not.toHaveBeenCalled();
    expect(mockRuleSuggestion.create).not.toHaveBeenCalled();
  });

  it('does not re-open a dismissed suggestion', async () => {
    mockTriageLog.count.mockResolvedValue(8);
    mockRuleSuggestion.findFirst.mockResolvedValue({
      id: 'sug-003',
      status: 'dismissed',
      triggerCount: 2,
    });

    await checkAndCreateSuggestion('spam@example.com', 'user-1');

    expect(mockRuleSuggestion.update).not.toHaveBeenCalled();
    expect(mockRuleSuggestion.create).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// generateSuggestions
// ──────────────────────────────────────────────

describe('generateSuggestions', () => {
  it('creates suggestions for domains with ≥2 trash events', async () => {
    mockTriageLog.findMany.mockResolvedValue([
      { senderEmail: 'a@newsletter.com' },
      { senderEmail: 'b@newsletter.com' }, // same domain, count=2 → suggest
      { senderEmail: 'solo@unique.com' },   // count=1 → no suggestion
    ]);
    mockRuleSuggestion.findFirst.mockResolvedValue(null); // no existing
    mockRuleSuggestion.create.mockResolvedValue({});
    mockRuleSuggestion.findMany.mockResolvedValue([
      {
        id: 'sug-new',
        senderPattern: '*@newsletter.com',
        suggestedAction: 'trash',
        triggerCount: 2,
        status: 'pending',
        createdAt: new Date(),
      },
    ]);

    const result = await generateSuggestions('user-1');

    expect(mockRuleSuggestion.create).toHaveBeenCalledTimes(1);
    expect(mockRuleSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderPattern: '*@newsletter.com' }),
      })
    );
    expect(result).toHaveLength(1);
  });

  it('skips domains with fewer than 2 trash events', async () => {
    mockTriageLog.findMany.mockResolvedValue([
      { senderEmail: 'once@example.com' },
    ]);
    mockRuleSuggestion.findMany.mockResolvedValue([]);

    const result = await generateSuggestions('user-1');

    expect(mockRuleSuggestion.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// acceptSuggestion
// ──────────────────────────────────────────────

describe('acceptSuggestion', () => {
  it('creates a ClassificationRule and marks suggestion accepted', async () => {
    mockRuleSuggestion.findFirst.mockResolvedValue({
      id: 'sug-100',
      userId: 'user-1',
      senderPattern: '*@spam.com',
      suggestedAction: 'trash',
      triggerCount: 3,
      status: 'pending',
    });
    mockClassificationRule.create.mockResolvedValue({});
    mockRuleSuggestion.update.mockResolvedValue({});

    const result = await acceptSuggestion('sug-100', 'user-1');

    expect(mockClassificationRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          senderPatterns: ['*@spam.com'],
          action: 'trash',
          isActive: true,
        }),
      })
    );
    expect(mockRuleSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sug-100' },
        data: { status: 'accepted' },
      })
    );
    expect(result.created).toBe(true);
  });

  it('still marks accepted even if rule already exists (unique constraint)', async () => {
    mockRuleSuggestion.findFirst.mockResolvedValue({
      id: 'sug-101',
      userId: 'user-1',
      senderPattern: '*@existing.com',
      suggestedAction: 'trash',
      triggerCount: 2,
      status: 'pending',
    });
    const uniqueErr = new Error('Unique constraint failed on field: category_key');
    mockClassificationRule.create.mockRejectedValue(uniqueErr);
    mockRuleSuggestion.update.mockResolvedValue({});

    const result = await acceptSuggestion('sug-101', 'user-1');

    expect(result.created).toBe(false);
    expect(mockRuleSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'accepted' } })
    );
  });

  it('throws when suggestion not found', async () => {
    mockRuleSuggestion.findFirst.mockResolvedValue(null);

    await expect(acceptSuggestion('no-such-id', 'user-1')).rejects.toThrow(
      'Suggestion not found or already resolved'
    );
  });
});

// ──────────────────────────────────────────────
// dismissSuggestion
// ──────────────────────────────────────────────

describe('dismissSuggestion', () => {
  it('marks suggestion as dismissed', async () => {
    mockRuleSuggestion.findFirst.mockResolvedValue({ id: 'sug-200' });
    mockRuleSuggestion.update.mockResolvedValue({});

    await dismissSuggestion('sug-200', 'user-1');

    expect(mockRuleSuggestion.update).toHaveBeenCalledWith({
      where: { id: 'sug-200' },
      data: { status: 'dismissed' },
    });
  });

  it('throws when suggestion not found', async () => {
    mockRuleSuggestion.findFirst.mockResolvedValue(null);

    await expect(dismissSuggestion('missing', 'user-1')).rejects.toThrow('Suggestion not found');
  });
});

// ──────────────────────────────────────────────
// Domain pattern helpers (inline tests)
// ──────────────────────────────────────────────

describe('domain pattern extraction', () => {
  it('extracts *@domain from a normal email', () => {
    const email = 'newsletter@example.com';
    const domain = email.split('@')[1]?.toLowerCase().trim();
    expect(domain).toBe('example.com');
    expect(`*@${domain}`).toBe('*@example.com');
  });

  it('handles subdomain emails correctly', () => {
    const email = 'no-reply@mail.instagram.com';
    const domain = email.split('@')[1]?.toLowerCase().trim();
    expect(`*@${domain}`).toBe('*@mail.instagram.com');
  });

  it('derives stable categoryKey from pattern', () => {
    const pattern = '*@spam.com';
    const key = `auto_${pattern.replace(/^\*@/, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
    expect(key).toBe('auto_spam_com');
  });

  it('handles patterns with hyphens and dots', () => {
    const pattern = '*@mail.my-app.io';
    const key = `auto_${pattern.replace(/^\*@/, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
    expect(key).toBe('auto_mail_my_app_io');
  });
});
