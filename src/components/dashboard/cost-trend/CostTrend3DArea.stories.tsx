import type { Meta, StoryObj } from '@storybook/react-vite';
import CostTrend3DArea from './CostTrend3DArea';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildCostDataPoints } from '@/storybook/fixtures/cost';

// CostTrend3DArea is the area-ribbon variant of the 3D Cost Trend widget.
// Same data shape and theme palette as CostTrend3DBars, just one filled
// ribbon per model instead of per-cell columns. Layout requirements are
// identical — the camera FOV needs ~720px wide for the ribbons to read
// clearly without edge cropping.
//
// The widget reads from `cost-trends-3d-area` in the QueryClient cache;
// stories pre-seed that cache via `makeDashboardDecorator`.

const meta: Meta<typeof CostTrend3DArea> = {
  title: 'Dashboard / CostTrend3DArea',
  component: CostTrend3DArea,
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
type Story = StoryObj<typeof CostTrend3DArea>;

// Empty: cache seeded with `[]` so the widget falls into ComponentWrapper's
// empty-state branch and never spins up a WebGL context.
export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: ['cost-trends-3d-area'], data: [] }],
    }),
  ],
};

// Populated: 24 hourly buckets × 4 models. Renders the full ribbon
// scene against the dark theme.
export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        { queryKey: ['cost-trends-3d-area'], data: buildCostDataPoints(24) },
      ],
    }),
  ],
};

// LightTheme: same dataset but rendered against a forced `data-theme="light"`
// so the LIGHT_THEME pastel palette is exercised by static Storybook builds.
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
        { queryKey: ['cost-trends-3d-area'], data: buildCostDataPoints(24) },
      ],
    }),
  ],
};
