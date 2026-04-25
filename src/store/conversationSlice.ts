import type { StateCreator } from 'zustand';

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'error';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions?: Array<{ name: string; args: Record<string, unknown>; result: string }>;
}

export interface ConversationSlice {
  messages: ConversationMessage[];
  status: AgentStatus;
  isPanelOpen: boolean;
  appendMessage: (msg: Omit<ConversationMessage, 'id' | 'timestamp'>) => void;
  setStatus: (status: AgentStatus) => void;
  setPanelOpen: (open: boolean) => void;
  clearConversation: () => void;
}

export const INITIAL_CONVERSATION_STATE = {
  messages: [] as ConversationMessage[],
  status: 'idle' as AgentStatus,
  isPanelOpen: false,
};

const MAX_HISTORY = 100;

export const createConversationSlice: StateCreator<ConversationSlice> = (set) => ({
  ...INITIAL_CONVERSATION_STATE,

  appendMessage: (msg) =>
    set((state) => {
      const newMessage: ConversationMessage = {
        ...msg,
        id: `msg-${crypto.randomUUID()}`,
        timestamp: Date.now(),
      };
      const updated = [...state.messages, newMessage];
      return { messages: updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated };
    }),

  setStatus: (status) => set({ status }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  clearConversation: () => set({ messages: [], status: 'idle' }),
});
