import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const container = style({
  display: 'flex',
  height: '100%',
  gap: 0,
});

export const gridArea = style({
  flex: 1,
  overflowY: 'auto',
});

export const paletteArea = style({
  width: '280px',
  borderLeft: `1px solid hsl(${vars.color.border})`,
  overflowY: 'auto',
});

export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.5rem 1rem',
  borderBottom: `1px solid hsl(${vars.color.border})`,
});

export const dashboardName = style({
  fontSize: '1rem',
  fontWeight: 600,
  color: `hsl(${vars.color.foreground})`,
});

export const toolbarActions = style({
  display: 'flex',
  gap: '0.5rem',
});

export const button = style({
  padding: '0.25rem 0.75rem',
  borderRadius: vars.radius.sm,
  border: `1px solid hsl(${vars.color.border})`,
  backgroundColor: 'transparent',
  color: `hsl(${vars.color.foreground})`,
  cursor: 'pointer',
  fontSize: '0.8125rem',
  ':hover': {
    backgroundColor: `hsl(${vars.color.border})`,
  },
});

export const buttonPrimary = style({
  backgroundColor: `hsl(${vars.color.primary})`,
  color: 'white',
  border: 'none',
  ':hover': {
    opacity: 0.9,
  },
});

export const emptyState = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '200px',
  color: `hsl(${vars.color.muted})`,
  fontSize: '0.875rem',
});
