import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectionSnapshot } from '@/data-source';
import { TraceExplorerView, type LiveEventRow } from './TraceExplorerWidget';

const readAt = '2026-09-26T12:00:00Z';
const snapshot = <T,>(rows: T[]): ProjectionSnapshot<T> => ({
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: rows.length > 0 ? '2026-09-26T11:59:00Z' : null,
  readAt,
});
const populated: LiveEventRow[] = [
  { id: '1', type: 'TOOL_EXECUTED', timestamp: '2026-09-26T11:59:00Z', source: 'omniclaude', topic: 'onex.evt.omniclaude.tool-executed.v1', summary: 'Bash completed', payload: { tool: 'Bash', token: 'hidden' }, correlation_id: 'corr-lab-001' },
  { id: '2', type: 'ERROR', timestamp: '2026-09-26T11:58:00Z', source: 'runtime', topic: 'onex.evt.runtime.failed.v1', summary: 'Handler failed', payload: { error: 'timeout' }, correlation_id: 'corr-lab-002' },
];

const meta: Meta<typeof TraceExplorerView> = {
  title: 'Dashboard / EventTrace',
  component: TraceExplorerView,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TraceExplorerView>;

export const Empty: Story = {
  args: { eventSnapshot: snapshot([]), decisionSnapshot: snapshot([]), workSnapshot: snapshot([]), paused: false, onPausedChange: () => undefined },
};

export const Populated: Story = {
  args: { eventSnapshot: snapshot(populated), decisionSnapshot: snapshot([]), workSnapshot: snapshot([]), paused: false, onPausedChange: () => undefined },
};
