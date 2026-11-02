import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const sidebar = style({
  borderRight: `1px solid ${vars.color.border}`,
  backgroundColor: `${vars.color.card}`,
  padding: '0.75rem',
});

export const navSection = style({
  marginBottom: '1rem',
});

export const navLabel = style({
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: `${vars.color.muted}`,
  padding: '0.25rem 0.5rem',
});

export const navItem = style({
  display: 'block',
  padding: '0.375rem 0.5rem',
  borderRadius: vars.radius.sm,
  color: `${vars.color.foreground}`,
  textDecoration: 'none',
  fontSize: '0.8125rem',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: `${vars.color.border}`,
  },
});
