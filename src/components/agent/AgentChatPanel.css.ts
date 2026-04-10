import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

const slideIn = keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});

export const panel = style({
  position: 'fixed',
  right: 0,
  top: 0,
  bottom: 0,
  width: '360px',
  backgroundColor: `hsl(${vars.color.card})`,
  borderLeft: `1px solid hsl(${vars.color.border})`,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 100,
  animation: `${slideIn} 200ms ease-out`,
  boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
});

export const panelHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  borderBottom: `1px solid hsl(${vars.color.border})`,
  fontSize: '0.875rem',
  fontWeight: 600,
});

export const messageList = style({
  flex: 1,
  overflowY: 'auto',
  padding: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
});

export const inputRow = style({
  padding: '0.75rem',
  borderTop: `1px solid hsl(${vars.color.border})`,
  display: 'flex',
  gap: '0.5rem',
});

export const input = style({
  flex: 1,
  padding: '0.5rem 0.75rem',
  borderRadius: '6px',
  border: `1px solid hsl(${vars.color.border})`,
  backgroundColor: `hsl(${vars.color.background})`,
  color: `hsl(${vars.color.foreground})`,
  fontSize: '0.875rem',
  outline: 'none',
  ':focus': {
    borderColor: `hsl(${vars.color.primary})`,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const sendButton = style({
  padding: '0.5rem 1rem',
  borderRadius: '6px',
  backgroundColor: `hsl(${vars.color.primary})`,
  color: 'hsl(var(--primary-foreground))',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const connectingState = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: `hsl(${vars.color.muted})`,
  fontSize: '0.875rem',
});
