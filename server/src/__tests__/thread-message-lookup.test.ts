/**
 * Tests for message lookup criteria used by attachment/inline routes.
 *
 * The API must accept both the local EmailMessage.id and the provider
 * gmailMessageId because different clients and views may reference either.
 */

import { describe, expect, it } from 'vitest';
import { buildMessageLookupWhere } from '../routes/threads';

describe('buildMessageLookupWhere', () => {
  it('matches both local database id and gmail message id for the same thread', () => {
    expect(buildMessageLookupWhere('thread-1', 'msg-123')).toEqual({
      OR: [
        { id: 'msg-123', threadId: 'thread-1' },
        { gmailMessageId: 'msg-123', threadId: 'thread-1' },
      ],
    });
  });
});
