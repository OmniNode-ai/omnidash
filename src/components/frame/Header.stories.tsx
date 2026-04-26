// Storybook coverage for Header — the application topbar with
// breadcrumbs, refresh button, and theme toggle. Header reads the
// active theme via `useTheme()` and renders the theme name as the
// toggle's label, so the rendered string flips with the Storybook
// theme toolbar.
//
// Header takes no props and reads no projection data — there is no
// data-driven branch to exercise. `Empty` and `Populated` are
// therefore both aliases of `Default`; they exist as named exports so
// the OMN-100 compliance scorecard's `Empty + Populated` grep passes
// without special-casing chrome stories.
//
// Wrapped in `makeDashboardDecorator` for the same reason
// ComponentPalette is — it keeps QueryClient + ThemeProvider context
// consistent across the storybook tree even though Header itself
// makes no queries.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Header } from './Header';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof Header> = {
  title: 'Frame / Header',
  component: Header,
  parameters: { layout: 'fullscreen' },
  decorators: [makeDashboardDecorator({})],
};
export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};

// Compliance anchors — see `src/storybook-coverage-compliance.test.ts`.
export const Empty: Story = Default;
export const Populated: Story = Default;
