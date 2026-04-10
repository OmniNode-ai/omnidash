import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const palette = style({
  padding: '0.75rem',
  overflowY: 'auto',
  height: '100%',
});

export const categoryLabel = style({
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: `hsl(${vars.color.muted})`,
  padding: '0.5rem 0 0.25rem',
});

export const componentItem = style({
  padding: '0.5rem',
  marginBottom: '0.375rem',
  borderRadius: vars.radius.sm,
  border: `1px solid hsl(${vars.color.border})`,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  ':hover': {
    backgroundColor: `hsl(${vars.color.border})`,
  },
});

export const componentItemDisabled = style({
  opacity: 0.5,
  cursor: 'not-allowed',
});

export const componentName = style({
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: `hsl(${vars.color.foreground})`,
});

export const componentDescription = style({
  fontSize: '0.6875rem',
  color: `hsl(${vars.color.muted})`,
  marginTop: '0.125rem',
});

export const badge = style({
  display: 'inline-block',
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0.125rem 0.375rem',
  borderRadius: vars.radius.sm,
  backgroundColor: `hsl(${vars.color.destructive} / 0.15)`,
  color: `hsl(${vars.color.destructive})`,
  marginLeft: '0.5rem',
});
