import { describe, expect, it } from 'vitest';
import { parseDemoReadinessRow } from './demo-readiness';

const valid = {
  node_id: 'demo_rehearsal',
  run_id: 'run-1',
  status: 'UNCONFIGURED',
  dashboard_configuration: 'UNCONFIGURED',
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

describe('parseDemoReadinessRow', () => {
  it('accepts typed unconfigured and configured terminal rows', () => {
    expect(parseDemoReadinessRow(valid)?.status).toBe('UNCONFIGURED');
    expect(parseDemoReadinessRow({ ...valid, status: 'GREEN', dashboard_configuration: 'CONFIGURED' })?.status).toBe('GREEN');
  });

  it('refuses green without an explicit configured discriminator', () => {
    expect(parseDemoReadinessRow({ ...valid, status: 'GREEN', dashboard_configuration: undefined })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, status: 'GREEN' })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, status: 'UNCONFIGURED', dashboard_configuration: 'CONFIGURED' })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, status: 'GREEN', dashboard_configuration: 'UNCONFIGURED' })).toBeNull();
  });

  it('refuses unknown nodes and invalid timestamps', () => {
    expect(parseDemoReadinessRow({ ...valid, node_id: 'other' })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, observed_at: 'yesterday' })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, node_id: 'demo_drift_detector' })).toBeNull();
  });

  it('refuses dry-run green and accepts typed non-green DRY_RUN', () => {
    expect(parseDemoReadinessRow({ ...valid, dashboard_configuration: 'CONFIGURED', dry_run: true, status: 'GREEN' })).toBeNull();
    expect(parseDemoReadinessRow({ ...valid, dashboard_configuration: 'CONFIGURED', dry_run: true, status: 'DRY_RUN', evidence_path: null })?.status).toBe('DRY_RUN');
  });
});
