import type { Meta, StoryObj } from '@storybook/react-vite';
import { DemoReadinessView } from './DemoReadinessWidget';

const meta: Meta<typeof DemoReadinessView> = {
  title: 'Dashboard/DemoReadiness',
  component: DemoReadinessView,
};

export default meta;
type Story = StoryObj<typeof DemoReadinessView>;

const readAt = '2026-09-27T12:05:00Z';
const baseRow = {
  node_id: 'demo_rehearsal',
  run_id: 'rehearsal-1',
  status: 'GREEN',
  dashboard_configuration: 'CONFIGURED',
  dry_run: false,
  observed_at: '2026-09-27T12:00:00Z',
  evidence_path: '/lab/evidence/rehearsal-1.json',
  failure_count: 0,
  demo_blocker_count: null,
  demo_degraded_count: null,
  total_finding_count: null,
  source_event_id: '00000000-0000-0000-0000-000000000001',
  projection_cursor: 1,
};

export const Unconfigured: Story = {
  args: {
    snapshot: {
      rows: [baseRow, { ...baseRow, node_id: 'demo_drift_detector', run_id: 'drift-1', status: 'UNCONFIGURED', dashboard_configuration: 'UNCONFIGURED', failure_count: null, demo_blocker_count: 0, demo_degraded_count: 0, total_finding_count: 0, projection_cursor: 2 }],
      rowCount: 2,
      dataFreshness: 'unknown',
      latestEventAt: null,
      readAt,
    },
  },
};

export const Empty: Story = {
  args: { snapshot: { rows: [], rowCount: 0, dataFreshness: 'unknown', latestEventAt: null, readAt } },
};

export const Unread: Story = {
  args: { snapshot: null, error: new Error('Projection unavailable: HTTP 503') },
};
