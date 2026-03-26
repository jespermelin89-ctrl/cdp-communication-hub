'use client';

import type { Message } from '@/lib/types';

interface Props {
  messages: Message[];
  userEmail?: string;
}

export default function MessageList({ messages, userEmail }: Props) {
  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No messages in this thread yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, idx) => {
        const isFromUser = msg.fromAddress === userEmail;
        return (
          <div
            key={msg.id || idx}
            className={`p-4 rounded-lg border ${
              isFromUser
                ? 'bg-brand-50 border-brand-200 ml-8'
                : 'bg-white border-gray-200 mr-8'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900">
                  {msg.fromAddress}
                </span>
                {isFromUser && (
                  <span className="badge bg-brand-100 text-brand-700">You</span>
                )}
              </div>
              <time className="text-xs text-gray-400">
                {new Date(msg.receivedAt).toLocaleString('sv-SE')}
              </time>
            </div>

            {msg.toAddresses && msg.toAddresses.length > 0 && (
              <div className="text-xs text-gray-400 mb-2">
                To: {msg.toAddresses.join(', ')}
              </div>
            )}

            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {msg.bodyText || '(No text content)'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
