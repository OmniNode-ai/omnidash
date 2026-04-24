import type { Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '../src/styles/globals.css';

// Per OMN-103 (plan amendment to OMN-100 Task 3): the dashboard
// decorator `makeDashboardDecorator` from
// `src/storybook/decorators/withDashboardContext.tsx` is applied
// **explicitly per-story** rather than wired here in the global
// `decorators` array. Storybook composes (does not replace) decorator
// stacks, so a global default would double the QueryClient + ThemeProvider
// context for every widget story that supplies its own. See ADR
// `docs/adr/002-storybook-widget-coverage.md` for context.

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { Light: 'light', Dark: 'dark' },
      defaultTheme: 'Light',
      attributeName: 'data-theme',
      parentSelector: 'html',
    }),
  ],
};

export default preview;
