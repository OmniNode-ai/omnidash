import type { CSSProperties } from 'react';
import type { ConversationMessage } from '@/store/conversationSlice';

interface MessageBubbleProps {
  message: ConversationMessage;
}

const userStyle: CSSProperties = {
  alignSelf: 'flex-end',
  backgroundColor: 'var(--ds-brand)',
  color: 'var(--ds-brand-ink)',
  padding: '0.5rem 0.75rem',
  borderRadius: '12px 12px 2px 12px',
  maxWidth: '85%',
  fontSize: '0.875rem',
  wordBreak: 'break-word',
};
const assistantStyle: CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: 'var(--ds-surface-2)',
  color: 'var(--ds-ink)',
  padding: '0.5rem 0.75rem',
  borderRadius: '12px 12px 12px 2px',
  maxWidth: '85%',
  fontSize: '0.875rem',
  wordBreak: 'break-word',
};
const actionStyle: CSSProperties = {
  marginTop: '0.25rem',
  padding: '0.25rem 0.5rem',
  backgroundColor: 'color-mix(in srgb, var(--ds-shadow-ink) 15%, transparent)',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'var(--ds-font-mono)',
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const style = message.role === 'user' ? userStyle : assistantStyle;
  return (
    <div style={style}>
      <div>{message.content}</div>
      {message.actions?.map((action, i) => (
        <div key={i} style={actionStyle}>
          {action.name}({JSON.stringify(action.args)}) → {action.result}
        </div>
      ))}
    </div>
  );
}
