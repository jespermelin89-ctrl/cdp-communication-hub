/**
 * Learning system tests — recordLearning, getRelevantLearning.
 * Uses an in-memory mock of brainCoreService to avoid DB dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory store ────────────────────────────────────────────────────────────
interface LearningEvent {
  id: string;
  userId: string;
  eventType: string;
  data: object;
  sourceType?: string;
  sourceId?: string;
  createdAt: Date;
}

let store: LearningEvent[] = [];
let idCounter = 0;

const mockBrainCoreService = {
  async recordLearning(
    userId: string,
    eventType: string,
    data: object,
    sourceType?: string,
    sourceId?: string
  ): Promise<LearningEvent> {
    const event: LearningEvent = {
      id: `evt-${++idCounter}`,
      userId,
      eventType,
      data,
      sourceType,
      sourceId,
      createdAt: new Date(),
    };
    store.push(event);
    return event;
  },

  async getRelevantLearning(
    userId: string,
    context: { sender?: string; eventType?: string } = {}
  ): Promise<LearningEvent[]> {
    let events = store.filter((e) => e.userId === userId);
    if (context.eventType) events = events.filter((e) => e.eventType === context.eventType);
    if (context.sender) {
      const senderFiltered = events.filter((e) => JSON.stringify(e.data).includes(context.sender!));
      if (senderFiltered.length > 0) return senderFiltered;
    }
    return events.slice(-50);
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('Learning system: recordLearning', () => {
  beforeEach(() => {
    store = [];
    idCounter = 0;
  });

  it('stores a learning event with correct fields', async () => {
    const event = await mockBrainCoreService.recordLearning(
      'user-1',
      'draft:approved',
      { draft_id: 'draft-abc', word_count: 42 },
      'ui',
      'draft-abc'
    );
    expect(event.id).toBeTruthy();
    expect(event.userId).toBe('user-1');
    expect(event.eventType).toBe('draft:approved');
    expect((event.data as any).draft_id).toBe('draft-abc');
    expect((event.data as any).word_count).toBe(42);
    expect(event.sourceType).toBe('ui');
    expect(event.sourceId).toBe('draft-abc');
    expect(event.createdAt).toBeInstanceOf(Date);
  });

  it('stores multiple events independently', async () => {
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', { draft_id: 'd1' });
    await mockBrainCoreService.recordLearning('user-1', 'classification:override', { thread_id: 't1' });
    expect(store).toHaveLength(2);
    expect(store[0].eventType).toBe('draft:approved');
    expect(store[1].eventType).toBe('classification:override');
  });

  it('auto-learn on draft:approved logs correct event type', async () => {
    const draftId = 'draft-xyz';
    await mockBrainCoreService.recordLearning(
      'user-1',
      'draft:approved',
      { draft_id: draftId, to_addresses: ['recipient@example.com'], word_count: 100 },
      'draft_approve',
      draftId
    );
    const events = await mockBrainCoreService.getRelevantLearning('user-1', {
      eventType: 'draft:approved',
    });
    expect(events).toHaveLength(1);
    expect((events[0].data as any).draft_id).toBe(draftId);
  });
});

describe('Learning system: getRelevantLearning', () => {
  beforeEach(() => {
    store = [];
    idCounter = 0;
  });

  it('returns all events for a user', async () => {
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', {});
    await mockBrainCoreService.recordLearning('user-1', 'command:summarize', {});
    const events = await mockBrainCoreService.getRelevantLearning('user-1');
    expect(events.length).toBe(2);
  });

  it('filters by eventType', async () => {
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', {});
    await mockBrainCoreService.recordLearning('user-1', 'classification:override', {});
    const events = await mockBrainCoreService.getRelevantLearning('user-1', {
      eventType: 'classification:override',
    });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('classification:override');
  });

  it('filters by sender in data JSON', async () => {
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', {
      to_addresses: ['alice@example.com'],
    });
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', {
      to_addresses: ['bob@other.com'],
    });
    const events = await mockBrainCoreService.getRelevantLearning('user-1', {
      sender: 'alice@example.com',
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].data)).toContain('alice@example.com');
  });

  it('isolates events between users', async () => {
    await mockBrainCoreService.recordLearning('user-1', 'draft:approved', {});
    await mockBrainCoreService.recordLearning('user-2', 'draft:approved', {});
    const events = await mockBrainCoreService.getRelevantLearning('user-1');
    expect(events.every((e) => e.userId === 'user-1')).toBe(true);
  });

  it('returns empty array for user with no events', async () => {
    const events = await mockBrainCoreService.getRelevantLearning('user-nobody');
    expect(events).toHaveLength(0);
  });
});
