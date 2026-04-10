import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const wrapper = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
});

export const componentHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.5rem 0.75rem',
  borderBottom: `1px solid hsl(${vars.color.border})`,
  minHeight: '32px',
});

export const componentTitle = style({
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color: `hsl(${vars.color.muted})`,
});

export const componentBody = style({
  flex: 1,
  overflow: 'auto',
  padding: '0.75rem',
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '0.5rem',
  color: `hsl(${vars.color.muted})`,
  textAlign: 'center',
  padding: '1rem',
});

export const emptyMessage = style({
  fontSize: '0.875rem',
  fontWeight: 500,
});

export const emptyHint = style({
  fontSize: '0.75rem',
  opacity: 0.7,
});

export const errorState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: `hsl(${vars.color.destructive})`,
  fontSize: '0.8125rem',
  padding: '1rem',
});

export const loadingState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: `hsl(${vars.color.muted})`,
  fontSize: '0.8125rem',
});
