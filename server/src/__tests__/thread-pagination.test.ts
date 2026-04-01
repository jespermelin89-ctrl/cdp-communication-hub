import { describe, expect, it } from 'vitest';
import { buildThreadPage } from '../routes/threads';

describe('buildThreadPage', () => {
  it('uses the refetched page contents when new threads appear', () => {
    const initial = buildThreadPage(
      [
        { id: 'thread-old', lastMessageAt: new Date('2026-04-01T08:00:00Z') },
      ],
      5
    );

    const refetched = buildThreadPage(
      [
        { id: 'thread-new', lastMessageAt: new Date('2026-04-01T10:00:00Z') },
        { id: 'thread-old', lastMessageAt: new Date('2026-04-01T08:00:00Z') },
      ],
      5
    );

    expect(initial.threads.map((thread) => thread.id)).toEqual(['thread-old']);
    expect(refetched.threads.map((thread) => thread.id)).toEqual(['thread-new', 'thread-old']);
  });

  it('builds nextCursor from the sliced page after pagination', () => {
    const page = buildThreadPage(
      [
        { id: 'thread-3', lastMessageAt: new Date('2026-04-01T10:00:00Z') },
        { id: 'thread-2', lastMessageAt: new Date('2026-04-01T09:00:00Z') },
        { id: 'thread-1', lastMessageAt: new Date('2026-04-01T08:00:00Z') },
      ],
      2
    );

    expect(page.hasMoreCursor).toBe(true);
    expect(page.threads.map((thread) => thread.id)).toEqual(['thread-3', 'thread-2']);
    expect(page.nextCursor).toBe(
      Buffer.from('2026-04-01T09:00:00.000Z::thread-2').toString('base64')
    );
  });
});
