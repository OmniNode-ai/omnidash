import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProjectionSnapshot } from '@/data-source';
import { LabRunnersView, type RunnerFleetRow } from './LabRunnersWidget';

const snapshot = (rows: RunnerFleetRow[]): ProjectionSnapshot<RunnerFleetRow> => ({
  rows,
  rowCount: rows.length,
  dataFreshness: 'fresh',
  latestEventAt: rows[0]?.observed_at ?? null,
  readAt: '2026-09-27T02:30:00Z',
});

function runner(
  name: string,
  labelClass: string,
  host: string,
  status: RunnerFleetRow['status'],
  currentJobId: string | null = null,
): RunnerFleetRow {
  return {
    runner_name: name,
    runner_id: 1,
    label_class: labelClass,
    labels: ['self-hosted', labelClass],
    host,
    observing_host: 'omninode-pc.tail75df5e.ts.net',
    status,
    current_job_id: currentJobId,
    observed_at: '2026-09-27T02:29:55Z',
    projection_cursor: name,
  };
}

const meta: Meta<typeof LabRunnersView> = { title: 'Dashboard / LabRunners', component: LabRunnersView, parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj<typeof LabRunnersView>;

export const Empty: Story = { args: { snapshot: snapshot([]), available: false } };

export const Populated: Story = {
  args: {
    snapshot: snapshot([
      runner('omninode-runner-1', 'omnibase-ci', 'omninode-pc.tail75df5e.ts.net', 'busy', '4242'),
      runner('omninode-runner-2', 'omnibase-ci', 'omninode-pc.tail75df5e.ts.net', 'online'),
      runner('omninode-air-runner-1', 'omnibase-verify', 'host-105', 'offline'),
      runner('omnipc2-verify-runner-1', 'omnibase-verify', 'host-202', 'online'),
      runner('omninode-prod-deploy-runner-1', 'omnibase-prod-deploy', 'omninode-pc.tail75df5e.ts.net', 'online'),
    ]),
    available: true,
  },
};
