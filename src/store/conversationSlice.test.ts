import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createConversationSlice, INITIAL_CONVERSATION_STATE, type ConversationSlice } from './conversationSlice';

const useStore = create<ConversationSlice>()((...args) => createConversationSlice(...args));

describe('ConversationSlice', () => {
  beforeEach(() => {
    // Merge-reset state fields without overwriting action functions
    useStore.setState(INITIAL_CONVERSATION_STATE);
  });

  it('starts with empty messages and idle status', () => {
    const { messages, status } = useStore.getState();
    expect(messages).toHaveLength(0);
    expect(status).toBe('idle');
  });

  it('appends user and assistant messages', () => {
    const { appendMessage } = useStore.getState();
    appendMessage({ role: 'user', content: 'Add a cost panel' });
    appendMessage({ role: 'assistant', content: 'Adding cost-trend-panel...', actions: [] });
    expect(useStore.getState().messages).toHaveLength(2);
  });

  it('sets status to thinking and back to idle', () => {
    const { setStatus } = useStore.getState();
    setStatus('thinking');
    expect(useStore.getState().status).toBe('thinking');
    setStatus('idle');
    expect(useStore.getState().status).toBe('idle');
  });

  it('clears conversation history', () => {
    const { appendMessage, clearConversation } = useStore.getState();
    appendMessage({ role: 'user', content: 'Test' });
    clearConversation();
    expect(useStore.getState().messages).toHaveLength(0);
  });

  it('caps messages at MAX_HISTORY to prevent unbounded growth', () => {
    const { appendMessage } = useStore.getState();
    for (let i = 0; i < 120; i++) {
      appendMessage({ role: 'user', content: `msg ${i}` });
    }
    expect(useStore.getState().messages.length).toBeLessThanOrEqual(100);
  });

  it('setPanelOpen toggles panel visibility', () => {
    const { setPanelOpen } = useStore.getState();
    setPanelOpen(true);
    expect(useStore.getState().isPanelOpen).toBe(true);
    setPanelOpen(false);
    expect(useStore.getState().isPanelOpen).toBe(false);
  });

  it('clearConversation resets status to idle', () => {
    const { setStatus, clearConversation } = useStore.getState();
    setStatus('error');
    clearConversation();
    expect(useStore.getState().status).toBe('idle');
  });

  it('appended messages have id and timestamp', () => {
    const { appendMessage } = useStore.getState();
    appendMessage({ role: 'user', content: 'hello' });
    const msg = useStore.getState().messages[0];
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeGreaterThan(0);
  });
});
