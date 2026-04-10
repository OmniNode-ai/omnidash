import type { CSSProperties } from 'react';
import type { ConversationMessage } from '@/store/conversationSlice';

interface MessageBubbleProps {
  message: ConversationMessage;
}

const userStyle: CSSProperties = {
  alignSelf: 'flex-end',
  backgroundColor: 'hsl(var(--primary))',
  color: 'hsl(var(--primary-foreground))',
  padding: '0.5rem 0.75rem',
  borderRadius: '12px 12px 2px 12px',
  maxWidth: '85%',
  fontSize: '0.875rem',
  wordBreak: 'break-word',
};
const assistantStyle: CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: 'hsl(var(--muted))',
  color: 'hsl(var(--foreground))',
  padding: '0.5rem 0.75rem',
  borderRadius: '12px 12px 12px 2px',
  maxWidth: '85%',
  fontSize: '0.875rem',
  wordBreak: 'break-word',
};
const actionStyle: CSSProperties = {
  marginTop: '0.25rem',
  padding: '0.25rem 0.5rem',
  backgroundColor: 'rgba(0,0,0,0.15)',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'monospace',
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
