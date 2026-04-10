import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 1rem',
  height: '48px',
  borderBottom: `1px solid hsl(${vars.color.border})`,
  backgroundColor: `hsl(${vars.color.card})`,
});

export const title = style({
  fontSize: '1.125rem',
  fontWeight: 600,
  fontFamily: vars.font.mono,
  color: `hsl(${vars.color.foreground})`,
});

export const actions = style({
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
});

export const themeButton = style({
  padding: '0.25rem 0.75rem',
  borderRadius: vars.radius.md,
  border: `1px solid hsl(${vars.color.border})`,
  backgroundColor: 'transparent',
  color: `hsl(${vars.color.foreground})`,
  cursor: 'pointer',
  fontSize: '0.8125rem',
  ':hover': {
    backgroundColor: `hsl(${vars.color.border})`,
  },
});
