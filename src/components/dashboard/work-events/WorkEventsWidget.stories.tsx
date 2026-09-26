import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectionSnapshot } from '@/data-source';
import { HookCaptureView, type WorkEventRow } from './WorkEventsWidget';

const snapshot = (rows: WorkEventRow[]): ProjectionSnapshot<WorkEventRow> => ({
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: rows[0]?.emitted_at ?? null,
  readAt: new Date().toISOString(),
});

const meta: Meta<typeof HookCaptureView> = {
  title: 'Dashboard / WorkEvents',
  component: HookCaptureView,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof HookCaptureView>;

export const Empty: Story = { args: { snapshot: snapshot([]) } };
export const Populated: Story = {
  args: {
    snapshot: snapshot([
      { event_id: 'hook-1', emitted_at: new Date().toISOString(), event_kind: 'session.tool', actor_kind: 'session', actor_id: 'session-1', ticket_id: 'OMN-18772', summary: 'tool Bash', source_topic: 'onex.evt.omniclaude.tool-executed.v1', payload: { tool: 'Bash' } },
      { event_id: 'hook-2', emitted_at: new Date().toISOString(), event_kind: 'session.prompt', actor_kind: 'session', actor_id: 'session-1', ticket_id: 'OMN-18772', summary: 'prompt submitted', source_topic: 'onex.evt.omniclaude.prompt-submitted.v1', payload: {} },
    ]),
  },
};
