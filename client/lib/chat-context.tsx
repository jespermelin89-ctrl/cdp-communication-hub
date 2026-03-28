'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ChatContextValue {
  selectedThreadIds: string[];
  setSelectedThreadIds: (ids: string[]) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ChatContext = createContext<ChatContextValue>({
  selectedThreadIds: [],
  setSelectedThreadIds: () => {},
  isOpen: false,
  setIsOpen: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ChatContext.Provider value={{ selectedThreadIds, setSelectedThreadIds, isOpen, setIsOpen }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}
