import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const panel = style({
  padding: '0.75rem',
  borderTop: `1px solid hsl(${vars.color.border})`,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '0.5rem',
});

export const title = style({
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: `hsl(${vars.color.foreground})`,
});

export const discardButton = style({
  padding: '0.2rem 0.5rem',
  borderRadius: vars.radius.sm,
  border: `1px solid hsl(${vars.color.border})`,
  backgroundColor: 'transparent',
  color: `hsl(${vars.color.foreground})`,
  cursor: 'pointer',
  fontSize: '0.75rem',
  ':hover': {
    backgroundColor: `hsl(${vars.color.border})`,
  },
});
