'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ChatContextValue {
  selectedThreadIds: string[];
  setSelectedThreadIds: (ids: string[]) => void;
}

const ChatContext = createContext<ChatContextValue>({
  selectedThreadIds: [],
  setSelectedThreadIds: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  return (
    <ChatContext.Provider value={{ selectedThreadIds, setSelectedThreadIds }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}
