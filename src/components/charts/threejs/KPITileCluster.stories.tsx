/**
 * Storybook coverage for KPITileCluster — the generic KPI tile grid primitive.
 *
 * Stories cover:
 * - Empty (no projectionData rows)
 * - Populated (3 tiles with valid projection rows)
 * - MixedNullity (2 tiles populated, 1 tile field absent → missing-field empty state)
 * - Each empty-state reason code: no-data, missing-field, upstream-blocked, schema-invalid
 *
 * ADR 002 compliance: `Empty` and `Populated` exports are required by
 * `src/storybook-coverage-compliance.test.ts` Phase 2 grep.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { KPITileCluster } from './KPITileCluster';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import type { KPITileMetricConfig, EmptyStateConfig } from '@/../../shared/types/chart-config';

const THREE_TILES: KPITileMetricConfig[] = [
  { field: 'total_cost_usd', label: 'Total Cost', format: '$,.4f' },
  { field: 'total_savings_usd', label: 'Total Savings', format: '$,.2f' },
  { field: 'total_tokens', label: 'Total Tokens' },
];

const POPULATED_ROWS = [
  { total_cost_usd: 12.3456, total_savings_usd: 3.21, total_tokens: 456789 },
];

const DEFAULT_EMPTY_STATE: EmptyStateConfig = {
  defaultMessage: 'No cost data yet',
  reasons: {
    'upstream-blocked': { message: 'Cost pipeline is blocked', cta: 'Check pipeline status' },
    'schema-invalid': { message: 'Projection schema mismatch — contact platform team' },
  },
};

const meta: Meta<typeof KPITileCluster> = {
  title: 'Charts / KPITileCluster',
  component: KPITileCluster,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof KPITileCluster>;

// ----- ADR 002 required exports -----------------------------------------

export const Empty: Story = {
  args: {
    projectionData: [],
    tiles: THREE_TILES,
    emptyState: DEFAULT_EMPTY_STATE,
  },
  decorators: [makeDashboardDecorator()],
};

export const Populated: Story = {
  args: {
    projectionData: POPULATED_ROWS,
    tiles: THREE_TILES,
    emptyState: DEFAULT_EMPTY_STATE,
  },
  decorators: [makeDashboardDecorator()],
};

// ----- Per-tile mixed nullity -------------------------------------------

export const MixedNullity: Story = {
  args: {
    projectionData: [{ total_cost_usd: 12.3456, total_tokens: 456789 }],
    tiles: THREE_TILES,
    emptyState: DEFAULT_EMPTY_STATE,
  },
  decorators: [makeDashboardDecorator()],
};

// ----- Per-reason empty states ------------------------------------------

export const EmptyReason_UpstreamBlocked: Story = {
  name: 'EmptyReason: upstream-blocked',
  args: {
    projectionData: [],
    tiles: [
      {
        field: 'total_cost_usd',
        label: 'Total Cost',
        emptyState: {
          reasons: {
            'no-data': { message: 'Cost pipeline is blocked', cta: 'Check pipeline status' },
          },
        },
      },
    ],
    emptyState: { defaultMessage: 'Upstream blocked' },
  },
  decorators: [makeDashboardDecorator()],
};

export const EmptyReason_SchemaInvalid: Story = {
  name: 'EmptyReason: schema-invalid',
  args: {
    projectionData: [{ total_cost_usd: 'not-a-number-object' as unknown as number }],
    tiles: [
      {
        field: 'total_cost_usd',
        label: 'Total Cost',
        emptyState: {
          reasons: {
            'schema-invalid': { message: 'Projection schema mismatch' },
          },
        },
      },
    ],
  },
  decorators: [makeDashboardDecorator()],
};
