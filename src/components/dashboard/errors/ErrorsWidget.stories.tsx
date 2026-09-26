import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectionSnapshot } from '@/data-source';
import { ErrorsView } from './ErrorsWidget';

const snapshot = <T,>(rows: T[]): ProjectionSnapshot<T> => ({
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: rows.length > 0 ? new Date().toISOString() : null,
  readAt: new Date().toISOString(),
});

const meta: Meta<typeof ErrorsView> = {
  title: 'Dashboard / Errors',
  component: ErrorsView,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ErrorsView>;

export const Empty: Story = {
  args: { consumerSnapshot: snapshot([]), eventSnapshot: snapshot([]), fingerprintSnapshot: snapshot([]), config: { window: 'all' } },
};

export const Populated: Story = {
  args: {
    consumerSnapshot: snapshot([{ consumer_group: 'lab.worker', topic: 'onex.evt.lab.task.v1', window_start: new Date().toISOString(), window_end: new Date().toISOString(), messages_in: 12, messages_out: 10, messages_dlq: 2, handler_errors: 1, flow_state: 'STALLED' }]),
    eventSnapshot: snapshot([{ id: 'error-1', type: 'ERROR', timestamp: new Date().toISOString(), source: 'lab-runtime', topic: 'onex.evt.lab.task.v1', summary: 'Task handler failed', payload: {}, correlation_id: 'corr-error-1' }]),
    fingerprintSnapshot: snapshot([{ fingerprint: 'timeout:worker', severity: 'ERROR', message_template: 'Worker timed out', occurrence_count: 4, correlation_id: 'corr-error-1', first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }]),
    config: { window: 'all' },
  },
};
