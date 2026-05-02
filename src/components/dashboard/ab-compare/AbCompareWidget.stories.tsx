import type { Meta, StoryObj } from '@storybook/react-vite';
import AbCompareWidget from './AbCompareWidget';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildAbCompareRows } from '@/storybook/fixtures/ab-compare';

/**
 * Stories for `AbCompareWidget`. The widget calls
 * `useProjectionQuery({ queryKey: ['ab-compare'], ... })` —
 * stories seed the QueryClient cache at that exact key via
 * `makeDashboardDecorator({ prefetched })`.
 *
 * Compliance scorecard (`src/storybook-coverage-compliance.test.ts`)
 * greps for `export const Empty` and `export const Populated` — both
 * must be present.
 */
const meta: Meta<typeof AbCompareWidget> = {
  title: 'Dashboard / AbCompareWidget',
  component: AbCompareWidget,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof AbCompareWidget>;

const AB_KEY = ['ab-compare'] as const;

export const Empty: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [{ queryKey: [...AB_KEY], data: [] }],
    }),
  ],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceError: true })],
};

/**
 * Populated — 4 models (2 local at $0, 2 cloud), showing savings banner.
 * This is the primary "money shot" story for the YC demo.
 */
export const Populated: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...AB_KEY],
          data: buildAbCompareRows({ modelCount: 4, includeLocalModel: true }),
        },
      ],
    }),
  ],
};

/** All models at non-zero cost — no green rows, savings banner still shows. */
export const AllCloudModels: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...AB_KEY],
          data: buildAbCompareRows({ modelCount: 4, includeLocalModel: false }),
        },
      ],
    }),
  ],
};

/** One model in the latest run errored. Error cell shows red. */
export const WithError: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...AB_KEY],
          data: buildAbCompareRows({ modelCount: 4, includeError: true }),
        },
      ],
    }),
  ],
};

/** Multiple runs — widget shows only the most-recent correlation_id. */
export const MultipleRuns: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...AB_KEY],
          data: buildAbCompareRows({ modelCount: 4, runCount: 3 }),
        },
      ],
    }),
  ],
};

/** Single model — no savings banner (needs ≥ 2 models to compare). */
export const SingleModel: Story = {
  args: { config: {} },
  decorators: [
    makeDashboardDecorator({
      prefetched: [
        {
          queryKey: [...AB_KEY],
          data: buildAbCompareRows({ modelCount: 1, includeLocalModel: true }),
        },
      ],
    }),
  ],
};
