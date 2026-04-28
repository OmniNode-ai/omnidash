import type { Meta, StoryObj } from '@storybook/react-vite';
import CostTrend3D from './CostTrend3DBars';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostDataPoints } from '@/storybook/fixtures/cost';

// CostTrend3D is a raw three.js widget. Modern Storybook iframes support
// WebGL natively, so we render real bars rather than mocking the canvas.
// The widget needs space — bars + axis labels + scrollbar + legend stack
// vertically, and the 3D scene needs at least ~720px wide before the
// camera FOV starts cropping bars at the edges. A meta-level decorator
// wraps every story in an 800×500 container to guarantee the iframe has
// enough room for the WebGL pose to read clearly.
//
// The widget reads `cost-trends-3d` from the QueryClient cache. Stories
// pre-seed that cache via `makeDashboardDecorator({ prefetched })`. The
// dataset shape is the same `CostDataPoint[]` projection that
// `CostTrendPanel` consumes, so we reuse `buildCostDataPoints` from the
// shared cost fixture builder.

const meta: Meta<typeof CostTrend3D> = {
  title: 'Dashboard / CostTrend3D',
  component: CostTrend3D,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ minWidth: 800, minHeight: 500, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof CostTrend3D>;

// Empty: cache seeded with `[]` so the widget skips its WebGL render and
// falls into ComponentWrapper's empty-state branch.
export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: ['cost-trends-3d'], data: [] }],
    }),
  ],
};

// Loading: queries disabled so `useProjectionQuery` stays in pending
// state forever — ComponentWrapper renders its loading spinner.
export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

// Populated: 24 hourly buckets × 4 models = 96 data rows. Renders the
// full 3D scene — bars, grid, axis labels, scrollbar, model-filter
// legend chips.
export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        { queryKey: ['cost-trends-3d'], data: buildCostDataPoints(24) },
      ],
    }),
  ],
};

// LightTheme: same dataset as Populated but rendered against a forced
// `data-theme="light"` ancestor so the widget's LIGHT_THEME pastel
// palette + grey grid are visible without flipping the toolbar. The
// global `withThemeByDataAttribute` toolbar can still toggle the theme
// independently — this story just guarantees the light path is exercised
// by Storybook build / static checks even when the toolbar starts on
// dark.
export const LightTheme: Story = {
  args: { config: {} },
  decorators: [
    (Story) => (
      <div data-theme="light" style={{ background: '#ffffff' }}>
        <Story />
      </div>
    ),
    makeDashboardDecorator({
      prefetched: [
        { queryKey: ['cost-trends-3d'], data: buildCostDataPoints(24) },
      ],
    }),
  ],
};

// ManyBuckets: 96 hourly buckets × 4 models = 384 rows. Tests the
// scrollable timeline strip — the bar count exceeds what the camera can
// see at default zoom, so the HTML scrollbar below the canvas becomes
// the primary navigation surface.
export const ManyBuckets: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        { queryKey: ['cost-trends-3d'], data: buildCostDataPoints(96) },
      ],
    }),
  ],
};
