import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot } from '@/data-source';
import { DemoReadinessView } from './DemoReadinessWidget';

const configured = {
  node_id: 'demo_rehearsal',
  run_id: 'run-1',
  status: 'GREEN',
  dashboard_configuration: 'CONFIGURED',
  dry_run: false,
  observed_at: '2026-09-27T12:00:00Z',
  evidence_path: '/tmp/evidence',
  failure_count: 0,
  demo_blocker_count: null,
  demo_degraded_count: null,
  total_finding_count: null,
  source_event_id: '00000000-0000-0000-0000-000000000001',
  projection_cursor: 1,
};

function snapshot(rows: unknown[]): ProjectionSnapshot<unknown> {
  return { rows, rowCount: rows.length, dataFreshness: 'unknown', latestEventAt: null, readAt: '2026-09-27T12:01:00Z' };
}

describe('DemoReadinessView', () => {
  it('names EMPTY and both never-observed nodes without a green badge', () => {
    render(<DemoReadinessView snapshot={snapshot([])} />);
    expect(screen.getByTestId('demo-readiness-empty')).toHaveTextContent('EMPTY');
    expect(screen.getAllByTestId('demo-readiness-row')).toHaveLength(2);
    expect(screen.getAllByText('NOT OBSERVED')).toHaveLength(2);
    expect(screen.queryByText('GREEN')).not.toBeInTheDocument();
  });

  it('keeps configured and unconfigured node status separate, with observed age', () => {
    render(<DemoReadinessView snapshot={snapshot([
      configured,
      { ...configured, node_id: 'demo_drift_detector', run_id: 'run-2', status: 'UNCONFIGURED', dashboard_configuration: 'UNCONFIGURED', failure_count: null, demo_blocker_count: 0, demo_degraded_count: 0, total_finding_count: 0, projection_cursor: 2 },
    ])} />);
    const rows = screen.getAllByTestId('demo-readiness-row');
    expect(rows[0]).toHaveAttribute('data-status', 'GREEN');
    expect(rows[1]).toHaveAttribute('data-status', 'UNCONFIGURED');
    expect(rows[1]).toHaveTextContent('Dashboard URL: UNCONFIGURED');
    expect(rows[1]).toHaveTextContent('Set DEMO_DASHBOARD_URL');
    expect(rows[1]).toHaveTextContent('1m old at read');
    expect(screen.getByText(/no expected run cadence is declared/i)).toBeInTheDocument();
    expect(screen.getByText(/Projection activity: unknown/)).toBeInTheDocument();
  });

  it('does not turn a malformed healthy row into health', () => {
    render(<DemoReadinessView snapshot={snapshot([{ ...configured, dashboard_configuration: undefined }])} />);
    expect(screen.getByTestId('demo-readiness-invalid')).toHaveTextContent('1 malformed');
    expect(screen.getAllByText('NOT OBSERVED')).toHaveLength(2);
  });

  it('renders dry runs as non-green without durable evidence', () => {
    render(<DemoReadinessView snapshot={snapshot([{ ...configured, status: 'DRY_RUN', dry_run: true, evidence_path: null }])} />);
    expect(screen.getAllByTestId('demo-readiness-row')[0]).toHaveAttribute('data-status', 'DRY_RUN');
    expect(screen.getByText(/no durable evidence artifact/i)).toBeInTheDocument();
  });

  it('distinguishes unread projection from empty projection', () => {
    render(<DemoReadinessView snapshot={null} error={new Error('HTTP 503')} />);
    expect(screen.getByText('Error: HTTP 503')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-readiness-empty')).not.toBeInTheDocument();
  });
});
