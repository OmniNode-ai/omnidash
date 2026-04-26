import { useState, useRef, useEffect, useCallback } from 'react';
import type { ConversationMessage } from '@/store/conversationSlice';
import { Text } from '@/components/ui/typography';
import { MessageBubble } from './MessageBubble';
import { SuggestedPrompts } from './SuggestedPrompts';
import * as s from './AgentChatPanel.css';

interface AgentChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onSend: (message: string) => Promise<string>;
  isAgentReady: boolean;
  isThinking?: boolean;
  messages?: ConversationMessage[];
}

export function AgentChatPanel({
  isOpen,
  onToggle,
  onSend,
  isAgentReady,
  isThinking,
  messages = [],
}: AgentChatPanelProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || !isAgentReady || isThinking) return;
      setInput('');
      await onSend(text);
    },
    [input, isAgentReady, isThinking, onSend]
  );

  if (!isOpen) return null;

  return (
    <aside className={s.panel} aria-label="AI Dashboard Assistant">
      <div className={s.panelHeader}>
        <span>AI Assistant</span>
        <button
          onClick={onToggle}
          aria-label="Close chat panel"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Text size="2xl" color="inherit">×</Text>
        </button>
      </div>

      {!isAgentReady ? (
        <div className={s.connectingState}>Connecting to AI model...</div>
      ) : (
        <>
          <div className={s.messageList} ref={listRef}>
            {messages.length === 0 && (
              <div style={{ padding: '1rem 0' }}>
                <Text
                  as="div"
                  size="lg"
                  color="secondary"
                  align="center"
                  style={{ padding: '1rem 1rem 0.5rem' }}
                >
                  Ask me to build or configure your dashboard.
                </Text>
                <SuggestedPrompts onSelect={(p) => setInput(p)} />
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isThinking && (
              <Text
                as="div"
                size="lg"
                color="secondary"
                style={{
                  alignSelf: 'flex-start',
                  padding: '0.25rem 0.5rem',
                }}
              >
                Thinking...
              </Text>
            )}
          </div>
          <form className={s.inputRow} onSubmit={handleSubmit}>
            <input
              className={s.input}
              role="textbox"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe what you want..."
              disabled={!!isThinking}
              aria-label="Message input"
            />
            <button
              className={s.sendButton}
              type="submit"
              disabled={!!isThinking || !input.trim()}
            >
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
