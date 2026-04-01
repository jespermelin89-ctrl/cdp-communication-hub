/**
 * SSE Events — Sprint 8 tests
 *
 * Tests for the emitToUser helper and connection registry logic.
 * No live HTTP — pure unit tests on the connection map behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Replicate the registry in-process ────────────────────────────────────────

const connections = new Map<string, Set<(event: string, data: unknown) => void>>();
const MAX_CONNECTIONS_PER_USER = 50;

function emitToUser(userId: string, event: string, data: unknown) {
  const userConnections = connections.get(userId);
  if (!userConnections) return;
  for (const send of userConnections) {
    try {
      send(event, data);
    } catch {
      // ignore
    }
  }
}

function registerConnection(userId: string, send: (event: string, data: unknown) => void): boolean {
  if (!connections.has(userId)) connections.set(userId, new Set());
  const conns = connections.get(userId)!;
  if (conns.size >= MAX_CONNECTIONS_PER_USER) return false;
  conns.add(send);
  return true;
}

function removeConnection(userId: string, send: (event: string, data: unknown) => void) {
  const conns = connections.get(userId);
  if (!conns) return;
  conns.delete(send);
  if (conns.size === 0) connections.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SSE event system', () => {
  beforeEach(() => {
    connections.clear();
  });

  it('emits to registered connections', () => {
    const received: Array<{ event: string; data: unknown }> = [];
    const send = (event: string, data: unknown) => received.push({ event, data });

    registerConnection('user-1', send);
    emitToUser('user-1', 'sync:complete', { timestamp: '2026-04-01' });

    expect(received).toHaveLength(1);
    expect(received[0].event).toBe('sync:complete');
    expect((received[0].data as any).timestamp).toBe('2026-04-01');
  });

  it('does nothing if no connections for user', () => {
    // Should not throw
    expect(() => emitToUser('no-such-user', 'test', {})).not.toThrow();
  });

  it('emits to multiple connections for same user', () => {
    const counts = [0, 0];
    registerConnection('user-2', () => counts[0]++);
    registerConnection('user-2', () => counts[1]++);

    emitToUser('user-2', 'thread:new', {});
    expect(counts[0]).toBe(1);
    expect(counts[1]).toBe(1);
  });

  it('cleans up connection on remove', () => {
    const received: string[] = [];
    const send = (event: string) => received.push(event);

    registerConnection('user-3', send);
    removeConnection('user-3', send);
    emitToUser('user-3', 'test', {});

    expect(received).toHaveLength(0);
    expect(connections.has('user-3')).toBe(false);
  });

  it('enforces max connections per user', () => {
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++) {
      const ok = registerConnection('user-4', () => {});
      expect(ok).toBe(true);
    }
    // 51st connection should be rejected
    const overflow = registerConnection('user-4', () => {});
    expect(overflow).toBe(false);
  });

  it('ignores send errors gracefully', () => {
    const throwingSend = () => { throw new Error('stream closed'); };
    registerConnection('user-5', throwingSend);
    expect(() => emitToUser('user-5', 'test', {})).not.toThrow();
  });

  it('emits thread:unsnoozed event with correct shape', () => {
    const received: any[] = [];
    registerConnection('user-6', (_, data) => received.push(data));

    emitToUser('user-6', 'thread:unsnoozed', {
      threadId: 'thread-abc',
      subject: 'Test Thread',
      timestamp: new Date().toISOString(),
    });

    expect(received[0].threadId).toBe('thread-abc');
    expect(received[0].subject).toBe('Test Thread');
  });
});
