import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { LabRunnersView, type RunnerFleetRow } from './LabRunnersWidget';

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

function snapshot(rows: RunnerFleetRow[]): ProjectionSnapshot<RunnerFleetRow> {
  return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: '2026-09-27T02:29:55Z', readAt: '2026-09-27T02:30:00Z' };
}

describe('LabRunnersView', () => {
  it('AC1 — renders a typed empty state naming the missing producer when unavailable', () => {
    render(<LabRunnersView snapshot={snapshot([])} available={false} />);
    expect(screen.getByText(/onex\.snapshot\.projection\.runner-fleet\.v1/)).toBeInTheDocument();
    expect(screen.getByText('Runner fleet producer missing').closest('[data-empty-state-reason]')).toHaveAttribute(
      'data-empty-state-reason',
      'upstream-blocked',
    );
  });

  it('AC3 — renders counts broken down by class and by host', () => {
    render(
      <LabRunnersView
        available
        snapshot={snapshot([
          runner('omninode-runner-1', 'omnibase-ci', 'host-201', 'online'),
          runner('omninode-runner-2', 'omnibase-ci', 'host-201', 'online'),
          runner('omninode-air-runner-1', 'omnibase-verify', 'host-105', 'online'),
          runner('omnipc2-verify-runner-1', 'omnibase-verify', 'host-202', 'online'),
        ])}
      />,
    );
    const byClass = screen.getByTestId('runner-fleet-by-class');
    expect(byClass).toHaveTextContent('omnibase-ci: 2/2 online');
    expect(byClass).toHaveTextContent('omnibase-verify: 2/2 online');

    const byHost = screen.getByTestId('runner-fleet-by-host');
    expect(byHost).toHaveTextContent('host-201: 2/2 online');
    expect(byHost).toHaveTextContent('host-105: 1/1 online');
    expect(byHost).toHaveTextContent('host-202: 1/1 online');
  });

  it('AC4 — an offline runner is rendered as offline, not dropped, and counted in the rollup', () => {
    render(
      <LabRunnersView
        available
        snapshot={snapshot([
          runner('omninode-runner-1', 'omnibase-ci', 'host-201', 'online'),
          runner('omninode-air-runner-1', 'omnibase-verify', 'host-105', 'offline'),
        ])}
      />,
    );
    const rows = screen.getAllByTestId('runner-fleet-row');
    expect(rows).toHaveLength(2);
    const offlineRow = rows.find((row) => row.getAttribute('data-status') === 'offline');
    expect(offlineRow).toBeDefined();
    expect(offlineRow).toHaveTextContent('omninode-air-runner-1');
    expect(offlineRow).toHaveTextContent('offline');

    const rollup = screen.getByTestId('runner-fleet-rollup');
    expect(rollup).toHaveTextContent('Registered 2');
    expect(rollup).toHaveTextContent('Offline 1');

    const byClass = screen.getByTestId('runner-fleet-by-class');
    expect(byClass).toHaveTextContent('omnibase-verify: 0/1 online (1 offline)');
  });

  it('AC5 — a busy runner shows the job id it is running', () => {
    render(
      <LabRunnersView
        available
        snapshot={snapshot([runner('omninode-runner-1', 'omnibase-ci', 'host-201', 'busy', '4242')])}
      />,
    );
    const row = screen.getByTestId('runner-fleet-row');
    expect(row).toHaveTextContent('busy');
    expect(row).toHaveTextContent('4242');
  });

  it('an idle runner never renders a job id', () => {
    render(
      <LabRunnersView
        available
        snapshot={snapshot([runner('omninode-runner-1', 'omnibase-ci', 'host-201', 'online')])}
      />,
    );
    expect(screen.getByTestId('runner-fleet-row')).not.toHaveTextContent('4242');
  });

  it('renders the bus-backed empty state when the census is reachable but there are zero rows', () => {
    render(<LabRunnersView available snapshot={snapshot([])} />);
    expect(screen.getByText('No runner rows')).toBeInTheDocument();
  });
});
