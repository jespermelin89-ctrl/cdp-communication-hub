/**
 * Tests for seedBrainCore service.
 *
 * Verifies that the service:
 *  1. Calls upsert for every writing mode, voice attribute, classification rule and contact
 *  2. Returns correct counts
 *  3. Is idempotent (upsert is called with correct where-keys)
 *  4. Passes userId to every record
 *
 * Uses Prisma mock — no DB needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock ──────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    writingMode: { upsert: vi.fn() },
    voiceAttribute: { upsert: vi.fn() },
    classificationRule: { upsert: vi.fn() },
    contactProfile: { upsert: vi.fn() },
  },
}));

import { seedBrainCore } from '../services/seed-brain-core.service';
import { prisma } from '../config/database';

const mockWritingMode = vi.mocked(prisma.writingMode);
const mockVoiceAttribute = vi.mocked(prisma.voiceAttribute);
const mockClassificationRule = vi.mocked(prisma.classificationRule);
const mockContactProfile = vi.mocked(prisma.contactProfile);

const USER_ID = 'test-user-seed';

// ── Setup: all upserts resolve immediately ────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockWritingMode.upsert.mockResolvedValue({} as any);
  mockVoiceAttribute.upsert.mockResolvedValue({} as any);
  mockClassificationRule.upsert.mockResolvedValue({} as any);
  mockContactProfile.upsert.mockResolvedValue({} as any);
});

// ── Count assertions ─────────────────────────────────────────────────────────

describe('seedBrainCore — return counts', () => {
  it('returns correct writingModes count (3)', async () => {
    const result = await seedBrainCore(USER_ID);
    expect(result.writingModes).toBe(3);
  });

  it('returns correct voiceAttributes count (6)', async () => {
    const result = await seedBrainCore(USER_ID);
    expect(result.voiceAttributes).toBe(6);
  });

  it('returns correct classificationRules count (14)', async () => {
    const result = await seedBrainCore(USER_ID);
    expect(result.classificationRules).toBe(14);
  });

  it('returns correct contacts count (2)', async () => {
    const result = await seedBrainCore(USER_ID);
    expect(result.contacts).toBe(2);
  });
});

// ── Upsert call count assertions ──────────────────────────────────────────────

describe('seedBrainCore — upsert call counts', () => {
  it('calls writingMode.upsert exactly 3 times', async () => {
    await seedBrainCore(USER_ID);
    expect(mockWritingMode.upsert).toHaveBeenCalledTimes(3);
  });

  it('calls voiceAttribute.upsert exactly 6 times', async () => {
    await seedBrainCore(USER_ID);
    expect(mockVoiceAttribute.upsert).toHaveBeenCalledTimes(6);
  });

  it('calls classificationRule.upsert exactly 14 times', async () => {
    await seedBrainCore(USER_ID);
    expect(mockClassificationRule.upsert).toHaveBeenCalledTimes(14);
  });

  it('calls contactProfile.upsert exactly 2 times', async () => {
    await seedBrainCore(USER_ID);
    expect(mockContactProfile.upsert).toHaveBeenCalledTimes(2);
  });
});

// ── userId propagation ────────────────────────────────────────────────────────

describe('seedBrainCore — userId propagation', () => {
  it('passes userId to every writingMode upsert create', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockWritingMode.upsert.mock.calls) {
      expect(call[0].create.userId).toBe(USER_ID);
    }
  });

  it('passes userId to every voiceAttribute upsert create', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockVoiceAttribute.upsert.mock.calls) {
      expect(call[0].create.userId).toBe(USER_ID);
    }
  });

  it('passes userId to every classificationRule upsert create', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockClassificationRule.upsert.mock.calls) {
      expect(call[0].create.userId).toBe(USER_ID);
    }
  });

  it('passes userId to every contactProfile upsert create', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockContactProfile.upsert.mock.calls) {
      expect(call[0].create.userId).toBe(USER_ID);
    }
  });
});

// ── Idempotency — where-key shape ─────────────────────────────────────────────

describe('seedBrainCore — idempotency (upsert where-keys)', () => {
  it('uses userId_modeKey compound key for writingMode', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockWritingMode.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('userId_modeKey');
      expect(call[0].where.userId_modeKey.userId).toBe(USER_ID);
      expect(typeof call[0].where.userId_modeKey.modeKey).toBe('string');
    }
  });

  it('uses userId_attribute compound key for voiceAttribute', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockVoiceAttribute.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('userId_attribute');
      expect(call[0].where.userId_attribute.userId).toBe(USER_ID);
    }
  });

  it('uses userId_categoryKey compound key for classificationRule', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockClassificationRule.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('userId_categoryKey');
      expect(call[0].where.userId_categoryKey.userId).toBe(USER_ID);
    }
  });

  it('uses userId_emailAddress compound key for contactProfile', async () => {
    await seedBrainCore(USER_ID);
    for (const call of mockContactProfile.upsert.mock.calls) {
      expect(call[0].where).toHaveProperty('userId_emailAddress');
      expect(call[0].where.userId_emailAddress.userId).toBe(USER_ID);
    }
  });
});

// ── Data integrity spot-checks ────────────────────────────────────────────────

describe('seedBrainCore — data spot-checks', () => {
  it('seeds casual_sv writing mode', async () => {
    await seedBrainCore(USER_ID);
    const calls = mockWritingMode.upsert.mock.calls.map((c) => c[0].create);
    const casualSv = calls.find((c) => c.modeKey === 'casual_sv');
    expect(casualSv).toBeDefined();
    expect(casualSv!.signOff).toBe('/Jesper');
    expect(casualSv!.name).toBe('Svenska vardaglig');
  });

  it('seeds tone voice attribute with high score', async () => {
    await seedBrainCore(USER_ID);
    const calls = mockVoiceAttribute.upsert.mock.calls.map((c) => c[0].create);
    const tone = calls.find((c) => c.attribute === 'tone');
    expect(tone).toBeDefined();
    expect(tone!.score).toBeGreaterThanOrEqual(0.8);
  });

  it('seeds kronofogden as high-priority classification rule', async () => {
    await seedBrainCore(USER_ID);
    const calls = mockClassificationRule.upsert.mock.calls.map((c) => c[0].create);
    const kronofogden = calls.find((c) => c.categoryKey === 'kronofogden');
    expect(kronofogden).toBeDefined();
    expect(kronofogden!.priority).toBe('high');
    expect(kronofogden!.action).toBe('flag_immediately');
  });

  it('seeds newsletter as low-priority auto-archive rule', async () => {
    await seedBrainCore(USER_ID);
    const calls = mockClassificationRule.upsert.mock.calls.map((c) => c[0].create);
    const newsletter = calls.find((c) => c.categoryKey === 'newsletter');
    expect(newsletter).toBeDefined();
    expect(newsletter!.priority).toBe('low');
    expect(newsletter!.action).toBe('auto_archive');
  });

  it('seeds Render and GitHub as contacts', async () => {
    await seedBrainCore(USER_ID);
    const emails = mockContactProfile.upsert.mock.calls.map(
      (c) => c[0].create.emailAddress
    );
    expect(emails).toContain('no-reply@render.com');
    expect(emails).toContain('notifications@github.com');
  });
});

// ── Isolation: different userId ───────────────────────────────────────────────

describe('seedBrainCore — multi-user isolation', () => {
  it('uses correct userId when called with a different user', async () => {
    const OTHER_USER = 'other-user-456';
    await seedBrainCore(OTHER_USER);
    for (const call of mockWritingMode.upsert.mock.calls) {
      expect(call[0].create.userId).toBe(OTHER_USER);
    }
  });
});
