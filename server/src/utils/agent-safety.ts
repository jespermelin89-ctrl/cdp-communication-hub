export type AgentDraftAction = 'send' | 'schedule';

function getActionVerb(action: AgentDraftAction): string {
  return action === 'send' ? 'send' : 'schedule';
}

export function getAgentDraftStatusError(status: string, action: AgentDraftAction): string | null {
  if (status === 'approved') {
    return null;
  }

  if (status === 'pending') {
    return `Draft must be explicitly approved by a human before the agent can ${getActionVerb(action)} it.`;
  }

  return `Cannot ${getActionVerb(action)} a draft with status '${status}'.`;
}
