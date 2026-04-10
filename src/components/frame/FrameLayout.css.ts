import { style } from '@vanilla-extract/css';

export const frameContainer = style({
  display: 'grid',
  gridTemplateColumns: '240px 1fr',
  gridTemplateRows: '48px 1fr',
  gridTemplateAreas: `
    "header header"
    "sidebar main"
  `,
  height: '100vh',
  overflow: 'hidden',
});

export const headerArea = style({
  gridArea: 'header',
});

export const sidebarArea = style({
  gridArea: 'sidebar',
  overflowY: 'auto',
});

export const mainArea = style({
  gridArea: 'main',
  overflowY: 'auto',
  padding: '1rem',
});
