import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart } from './BarChart';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';

const meta: Meta<typeof BarChart> = {
  title: 'Charts / BarChart',
  component: BarChart,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof BarChart>;

const POPULATED_ROWS = [
  { repo: 'omniclaude', cost_usd: 12.45 },
  { repo: 'omnimarket', cost_usd: 8.30 },
  { repo: 'omnibase_core', cost_usd: 5.10 },
  { repo: 'omnidash', cost_usd: 3.75 },
  { repo: 'omnibase_infra', cost_usd: 2.20 },
];

export const Empty: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [],
    fieldMappings: { x: 'repo', y: 'cost_usd' },
    emptyState: {
      reasons: {
        'no-data': { message: 'No cost data available yet' },
        'upstream-blocked': { message: 'Cost pipeline is blocked upstream' },
        'schema-invalid': { message: 'Cost projection failed schema validation' },
      },
      defaultMessage: 'No data',
    },
  },
};

export const Populated: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: POPULATED_ROWS,
    fieldMappings: { x: 'repo', y: 'cost_usd' },
    emptyState: {
      defaultMessage: 'No data',
    },
  },
};

export const PopulatedGrouped: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [
      { repo: 'omniclaude', window: '24h', cost_usd: 4.10 },
      { repo: 'omniclaude', window: '7d', cost_usd: 12.45 },
      { repo: 'omnimarket', window: '24h', cost_usd: 2.80 },
      { repo: 'omnimarket', window: '7d', cost_usd: 8.30 },
      { repo: 'omnidash', window: '24h', cost_usd: 1.25 },
      { repo: 'omnidash', window: '7d', cost_usd: 3.75 },
    ],
    fieldMappings: { x: 'repo', y: 'cost_usd', group: 'window' },
    emptyState: { defaultMessage: 'No data' },
  },
};

export const EmptyMissingField: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [{ repo: 'omniclaude' }] as Record<string, unknown>[],
    fieldMappings: { x: 'repo', y: 'cost_usd' },
    emptyState: {
      reasons: {
        'missing-field': { message: 'cost_usd field is missing from projection data' },
      },
      defaultMessage: 'No data',
    },
  },
};

export const EmptyUpstreamBlocked: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [],
    fieldMappings: { x: 'repo', y: 'cost_usd' },
    emptyState: {
      reasons: {
        'no-data': {
          message: 'Cost pipeline is blocked upstream',
          cta: 'Check omnimarket node status',
        },
      },
      defaultMessage: 'No data',
    },
  },
};

export const EmptySchemaInvalid: Story = {
  decorators: [makeDashboardDecorator({})],
  args: {
    projectionData: [{ repo: 'omniclaude', cost_usd: null }] as Record<string, unknown>[],
    fieldMappings: { x: 'repo', y: 'cost_usd' },
    emptyState: {
      reasons: {
        'schema-invalid': {
          message: 'Projection data failed schema validation — cost_usd must be numeric',
        },
      },
      defaultMessage: 'No data',
    },
  },
};
