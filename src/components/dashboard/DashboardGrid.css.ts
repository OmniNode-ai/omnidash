import { style } from '@vanilla-extract/css';
import { vars } from '@/theme/tokens.css';

export const gridContainer = style({
  width: '100%',
  minHeight: '100%',
});

export const gridItem = style({
  backgroundColor: `hsl(${vars.color.card})`,
  border: `1px solid hsl(${vars.color.border})`,
  borderRadius: vars.radius.md,
  overflow: 'hidden',
});

export const gridItemEdit = style({
  cursor: 'move',
  boxShadow: `0 0 0 2px hsl(${vars.color.primary} / 0.3)`,
});
