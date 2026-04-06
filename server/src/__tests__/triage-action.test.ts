/**
 * Tests for triage-action.service.ts (Sprint 1)
 *
 * Pure unit tests — all external dependencies mocked.
 * Covers: mapRuleActionToTriage, mapAIToTriageAction, executeAction, dedup logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mocks — factories use only vi.fn() (no top-level vars, avoids hoisting issues)
// ──────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    triageLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    contactProfile: {
      findFirst: vi.fn(),
    },
    classificationRule: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../services/gmail.service', () => ({
  gmailService: {
    trashThread: vi.fn(),
    modifyLabels: vi.fn(),
    listLabels: vi.fn(),
    createLabel: vi.fn(),
  },
}));

vi.mock('../services/push.service', () => ({
  sendPushToUser: vi.fn(),
}));

// ──────────────────────────────────────────────
// Import mocked modules to access mock fns
// ──────────────────────────────────────────────

import { prisma } from '../config/database';
import { gmailService } from '../services/gmail.service';
import { sendPushToUser } from '../services/push.service';

import {
  mapRuleActionToTriage,
  mapAIToTriageAction,
  TriageActionService,
  type TriageDecision,
} from '../services/triage-action.service';

// ──────────────────────────────────────────────
// Typed mock accessors
// ──────────────────────────────────────────────

const mockTriageLog = prisma.triageLog as {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};
const mockContactProfile = prisma.contactProfile as { findFirst: ReturnType<typeof vi.fn> };
const mockClassificationRule = prisma.classificationRule as { findFirst: ReturnType<typeof vi.fn> };
const mockGmail = gmailService as {
  trashThread: ReturnType<typeof vi.fn>;
  modifyLabels: ReturnType<typeof vi.fn>;
  listLabels: ReturnType<typeof vi.fn>;
  createLabel: ReturnType<typeof vi.fn>;
};
const mockPush = sendPushToUser as ReturnType<typeof vi.fn>;

// ──────────────────────────────────────────────
// Helper: build a minimal TriageDecision
// ──────────────────────────────────────────────

function makeDecision(overrides: Partial<TriageDecision> = {}): TriageDecision {
  return {
    threadId: 'thread-uuid-1',
    gmailThreadId: 'gmail-thread-1',
    accountId: 'account-1',
    userId: 'user-1',
    classification: 'spam',
    priority: 'low',
    action: 'trash',
    source: 'rule_engine',
    confidence: 1.0,
    reason: 'Matchad regel: Test',
    senderEmail: 'test@example.com',
    subject: 'Test Subject',
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Reset all mocks before each test
// ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTriageLog.create.mockResolvedValue({});
  mockTriageLog.findFirst.mockResolvedValue(null);
  mockContactProfile.findFirst.mockResolvedValue(null);
  mockClassificationRule.findFirst.mockResolvedValue(null);
  mockGmail.trashThread.mockResolvedValue(undefined);
  mockGmail.modifyLabels.mockResolvedValue(undefined);
  mockGmail.listLabels.mockResolvedValue([]);
  mockGmail.createLabel.mockResolvedValue('label-123');
  mockPush.mockResolvedValue(undefined);
});

// ──────────────────────────────────────────────
// mapRuleActionToTriage — pure function
// ──────────────────────────────────────────────

describe('mapRuleActionToTriage', () => {
  it('maps trash → trash', () => {
    expect(mapRuleActionToTriage('trash')).toBe('trash');
  });

  it('maps trash_after_log → trash_after_log', () => {
    expect(mapRuleActionToTriage('trash_after_log')).toBe('trash_after_log');
  });

  it('maps notify_then_trash → notify_then_trash', () => {
    expect(mapRuleActionToTriage('notify_then_trash')).toBe('notify_then_trash');
  });

  it('maps keep_inbox → keep_inbox', () => {
    expect(mapRuleActionToTriage('keep_inbox')).toBe('keep_inbox');
  });

  it('maps label_review → label_review', () => {
    expect(mapRuleActionToTriage('label_review')).toBe('label_review');
  });

  it('maps auto_draft → auto_draft', () => {
    expect(mapRuleActionToTriage('auto_draft')).toBe('auto_draft');
  });

  it('maps auto_archive → trash (radera direkt per spec)', () => {
    expect(mapRuleActionToTriage('auto_archive')).toBe('trash');
  });

  it('maps group_and_summarize → trash_after_log', () => {
    expect(mapRuleActionToTriage('group_and_summarize')).toBe('trash_after_log');
  });

  it('maps notify → notify_then_trash', () => {
    expect(mapRuleActionToTriage('notify')).toBe('notify_then_trash');
  });

  it('maps flag_immediately → keep_inbox', () => {
    expect(mapRuleActionToTriage('flag_immediately')).toBe('keep_inbox');
  });

  it('maps unknown action → keep_inbox (safe default)', () => {
    expect(mapRuleActionToTriage('unknown_action')).toBe('keep_inbox');
  });
});

// ──────────────────────────────────────────────
// mapAIToTriageAction
// ──────────────────────────────────────────────

describe('mapAIToTriageAction', () => {
  it('spam is always trash', async () => {
    const action = await mapAIToTriageAction('spam', 'high', 0.95, 'spammer@evil.com', 'Buy now!', 'user-1');
    expect(action).toBe('trash');
  });

  it('operational/low → trash', async () => {
    const action = await mapAIToTriageAction('operational', 'low', 0.9, 'noreply@render.com', 'Deploy OK', 'user-1');
    expect(action).toBe('trash');
  });

  it('operational/medium with fail subject → notify_then_trash', async () => {
    const action = await mapAIToTriageAction('operational', 'medium', 0.9, 'noreply@render.com', 'Deploy failed', 'user-1');
    expect(action).toBe('notify_then_trash');
  });

  it('personal/high with known ContactProfile → keep_inbox', async () => {
    mockContactProfile.findFirst.mockResolvedValue({ id: 'contact-1' });
    const action = await mapAIToTriageAction('personal', 'high', 0.9, 'friend@example.com', 'Hey!', 'user-1');
    expect(action).toBe('keep_inbox');
  });

  it('personal/high with unknown sender → label_review', async () => {
    const action = await mapAIToTriageAction('personal', 'high', 0.9, 'unknown@example.com', 'Hello', 'user-1');
    expect(action).toBe('label_review');
  });

  it('lead/medium with known sender → keep_inbox', async () => {
    mockContactProfile.findFirst.mockResolvedValue({ id: 'contact-1' });
    const action = await mapAIToTriageAction('lead', 'medium', 0.85, 'lead@biz.com', 'Partnership', 'user-1');
    expect(action).toBe('keep_inbox');
  });

  it('low confidence + unknown sender → label_review regardless of classification', async () => {
    const action = await mapAIToTriageAction('partner', 'high', 0.6, 'suspicious@example.com', 'Offer', 'user-1');
    expect(action).toBe('label_review');
  });
});

// ──────────────────────────────────────────────
// TriageActionService.executeAction
// ──────────────────────────────────────────────

describe('TriageActionService.executeAction', () => {
  let service: TriageActionService;

  beforeEach(() => {
    service = new TriageActionService();
  });

  it('trash: calls gmailService.trashThread and logs to triage_log', async () => {
    const decision = makeDecision({ action: 'trash' });
    await service.executeAction(decision);

    expect(mockGmail.trashThread).toHaveBeenCalledWith('account-1', 'gmail-thread-1');
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'trash', threadId: 'thread-uuid-1' }),
      })
    );
  });

  it('keep_inbox: no Gmail API call, still logs', async () => {
    const decision = makeDecision({ action: 'keep_inbox', classification: 'personal', priority: 'high' });
    await service.executeAction(decision);

    expect(mockGmail.trashThread).not.toHaveBeenCalled();
    expect(mockGmail.modifyLabels).not.toHaveBeenCalled();
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'keep_inbox' }),
      })
    );
  });

  it('label_review: creates Granskning if not exists, moves thread out of INBOX', async () => {
    mockGmail.listLabels.mockResolvedValue([]);
    mockGmail.createLabel.mockResolvedValue('new-label-id');

    const decision = makeDecision({ action: 'label_review', accountId: 'account-fresh-1' });
    await service.executeAction(decision);

    expect(mockGmail.createLabel).toHaveBeenCalledWith('account-fresh-1', 'Granskning');
    expect(mockGmail.modifyLabels).toHaveBeenCalledWith(
      'account-fresh-1',
      'gmail-thread-1',
      ['new-label-id'],
      ['INBOX']
    );
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'label_review' }),
      })
    );
  });

  it('label_review: uses existing Granskning label without creating new one', async () => {
    const freshService = new TriageActionService();
    mockGmail.listLabels.mockResolvedValue([{ id: 'existing-label', name: 'Granskning' }]);

    const decision = makeDecision({ action: 'label_review', accountId: 'account-fresh-2' });
    await freshService.executeAction(decision);

    expect(mockGmail.createLabel).not.toHaveBeenCalled();
    expect(mockGmail.modifyLabels).toHaveBeenCalledWith(
      'account-fresh-2',
      'gmail-thread-1',
      ['existing-label'],
      ['INBOX']
    );
  });

  it('trash_after_log: logs with trash_after_log then trashes', async () => {
    const decision = makeDecision({ action: 'trash_after_log', classification: 'skool_all' });
    await service.executeAction(decision);

    expect(mockGmail.trashThread).toHaveBeenCalledWith('account-1', 'gmail-thread-1');
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'trash_after_log' }),
      })
    );
  });

  it('notify_then_trash: sends push and trashes on first occurrence', async () => {
    mockTriageLog.findFirst.mockResolvedValue(null);

    const decision = makeDecision({ action: 'notify_then_trash', subject: 'Deploy failed: my-app' });
    await service.executeAction(decision);

    expect(mockPush).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: expect.stringContaining('Deploy fel') })
    );
    expect(mockGmail.trashThread).toHaveBeenCalledWith('account-1', 'gmail-thread-1');
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'notify_then_trash' }),
      })
    );
  });

  it('notify_then_trash: dedup — trashes silently when already notified in last 6h', async () => {
    mockTriageLog.findFirst.mockResolvedValue({ id: 'existing-log' });

    const decision = makeDecision({ action: 'notify_then_trash', subject: 'Deploy failed: my-app' });
    await service.executeAction(decision);

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGmail.trashThread).toHaveBeenCalledWith('account-1', 'gmail-thread-1');
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'trash' }),
      })
    );
  });

  it('auto_draft: treated as keep_inbox — no Gmail call, logs keep_inbox', async () => {
    const decision = makeDecision({ action: 'auto_draft' });
    await service.executeAction(decision);

    expect(mockGmail.trashThread).not.toHaveBeenCalled();
    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'keep_inbox' }),
      })
    );
  });

  it('does NOT throw if Gmail API fails — swallows error silently', async () => {
    mockGmail.trashThread.mockRejectedValue(new Error('Gmail API error'));
    const decision = makeDecision({ action: 'trash' });
    await expect(service.executeAction(decision)).resolves.toBeUndefined();
  });

  it('logs senderEmail, subject, source and confidence correctly', async () => {
    const decision = makeDecision({
      action: 'trash',
      senderEmail: 'noreply@render.com',
      subject: 'Deploy failed: production',
      source: 'rule_engine',
      confidence: 1.0,
    });
    await service.executeAction(decision);

    expect(mockTriageLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderEmail: 'noreply@render.com',
          subject: 'Deploy failed: production',
          source: 'rule_engine',
          confidence: 1.0,
        }),
      })
    );
  });
});
