export type ThreadMutationAction =
  | 'archive'
  | 'trash'
  | 'restore'
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'spam';

const ACTION_LABELS: Record<ThreadMutationAction, string> = {
  archive: 'archive threads',
  trash: 'move threads to trash',
  restore: 'restore threads',
  read: 'mark threads as read',
  unread: 'mark threads as unread',
  star: 'star threads',
  unstar: 'remove thread stars',
  spam: 'report spam',
};

export function getThreadMutationUnsupportedError(
  provider: string,
  action: ThreadMutationAction
): string | null {
  if (provider === 'gmail') {
    return null;
  }

  const actionLabel = ACTION_LABELS[action];

  if (provider === 'imap') {
    return `IMAP accounts can sync and send real email, but they cannot yet ${actionLabel} back in the original mailbox. This action is currently limited to Gmail accounts.`;
  }

  return `Provider '${provider}' does not yet support remote thread actions such as ${actionLabel}.`;
}
