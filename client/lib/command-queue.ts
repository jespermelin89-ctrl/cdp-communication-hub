/**
 * Offline command queue — IndexedDB via idb-keyval.
 * When the device is offline, chat commands are queued here.
 * On reconnect, flush() replays them in order.
 */

import { get, set } from 'idb-keyval';

export interface QueuedCommand {
  id: string;
  text: string;       // original user message text
  createdAt: number;
}

const QUEUE_KEY = 'cdp-command-queue';

export const commandQueue = {
  async add(text: string): Promise<QueuedCommand> {
    const queue = (await get<QueuedCommand[]>(QUEUE_KEY)) ?? [];
    const cmd: QueuedCommand = {
      id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`,
      text,
      createdAt: Date.now(),
    };
    queue.push(cmd);
    await set(QUEUE_KEY, queue);
    return cmd;
  },

  /**
   * Attempt to send each queued command via sendFn.
   * sendFn should return true on success, false/throw on failure.
   * Successfully sent commands are removed; failed ones stay.
   * Returns count of successfully flushed commands.
   */
  async flush(sendFn: (cmd: QueuedCommand) => Promise<boolean>): Promise<number> {
    const queue = (await get<QueuedCommand[]>(QUEUE_KEY)) ?? [];
    if (queue.length === 0) return 0;

    let sent = 0;
    const remaining: QueuedCommand[] = [];

    for (const cmd of queue) {
      try {
        const ok = await sendFn(cmd);
        if (ok) {
          sent++;
        } else {
          remaining.push(cmd);
        }
      } catch {
        remaining.push(cmd);
      }
    }

    await set(QUEUE_KEY, remaining);
    return sent;
  },

  async getAll(): Promise<QueuedCommand[]> {
    return (await get<QueuedCommand[]>(QUEUE_KEY)) ?? [];
  },

  async count(): Promise<number> {
    const queue = (await get<QueuedCommand[]>(QUEUE_KEY)) ?? [];
    return queue.length;
  },

  async clear(): Promise<void> {
    await set(QUEUE_KEY, []);
  },
};
