import { describe, expect, it } from 'vitest';
import { getAgentDraftStatusError } from '../utils/agent-safety';

describe('getAgentDraftStatusError', () => {
  it('allows approved drafts to be sent by the agent', () => {
    expect(getAgentDraftStatusError('approved', 'send')).toBeNull();
  });

  it('blocks pending drafts from agent sends', () => {
    expect(getAgentDraftStatusError('pending', 'send')).toContain('explicitly approved by a human');
  });

  it('blocks pending drafts from agent scheduling', () => {
    expect(getAgentDraftStatusError('pending', 'schedule')).toContain('explicitly approved by a human');
  });

  it('rejects terminal statuses for agent sends', () => {
    expect(getAgentDraftStatusError('sent', 'send')).toBe("Cannot send a draft with status 'sent'.");
    expect(getAgentDraftStatusError('failed', 'schedule')).toBe("Cannot schedule a draft with status 'failed'.");
  });
});
