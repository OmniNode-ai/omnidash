/**
 * OMN-19993: seeded environment and alert rows for the status grid and the
 * alert banner, used by the stories, the component tests and the render check.
 *
 * The ticket asks for "seeded (T2.11) environment and alert rows". T2.11's seed
 * node (omnimarket node_dev_seed_effect, fixture_set_v1) carries delegation runs
 * only; it has no environment or alert rows, and no environment or alerts
 * projection is served yet (OMN-19988). So the set is defined here in the
 * requirements' own terms: the OV-2 roster (the catalog `local` bundle's nine
 * services) with the four OV-2 states, and OV-6 alerts: SERVICE_DOWN, the code
 * OMN-19988 names, plus SERVICE_UNHEALTHY and SERVICE_STALE for its other two
 * verdicts (UNHEALTHY, STALE), which it does not name codes for. These are
 * fixtures, not observations: the stories and the render check show them under
 * the widget's fixture badge.
 *
 * The topic names follow the requirements (`local-environment.v1`,
 * `local-alerts.v1`) in the projection-topic convention; OMN-19988 owns the
 * real ones, and these move with it.
 */
import type { AlertBannerRow, StatusGridRow } from '@shared/types/component-manifest';

export const SEED_ENVIRONMENT_TOPIC = 'onex.snapshot.projection.local-environment.v1';
export const SEED_ALERTS_TOPIC = 'onex.snapshot.projection.local-alerts.v1';

export const SEED_ENVIRONMENT_ROWS: readonly StatusGridRow[] = [
  { key: 'postgres', label: 'postgres', status: 'RUNNING', severity: 'nominal', status_reason: 'healthy: pg_isready accepted a connection', last_seen: '2026-10-07T11:59:40Z' },
  { key: 'redpanda', label: 'redpanda', status: 'RUNNING', severity: 'nominal', status_reason: 'healthy: broker answered the admin API', last_seen: '2026-10-07T11:59:40Z' },
  { key: 'redpanda-partition-cap', label: 'redpanda-partition-cap', status: 'RUNNING', severity: 'nominal', status_reason: 'completed: partition cap applied once', last_seen: '2026-10-07T11:58:02Z' },
  { key: 'valkey', label: 'valkey', status: 'DEGRADED', severity: 'attention', status_reason: 'running, but the health check failed 2 of the last 3 probes', last_seen: '2026-10-07T11:59:38Z' },
  { key: 'forward-migration', label: 'forward-migration', status: 'RUNNING', severity: 'nominal', status_reason: 'completed: migrations at head', last_seen: '2026-10-07T11:57:15Z' },
  { key: 'migration-gate', label: 'migration-gate', status: 'RUNNING', severity: 'nominal', status_reason: 'completed: schema matches the expected head', last_seen: '2026-10-07T11:57:20Z' },
  { key: 'omninode-runtime', label: 'omninode-runtime', status: 'DOWN', severity: 'critical', status_reason: 'container exited (code 137) at 11:58:51Z', last_seen: '2026-10-07T11:58:51Z' },
  { key: 'runtime-effects', label: 'runtime-effects', status: 'UNKNOWN', severity: 'unknown', status_reason: 'no health event since the observer started', last_seen: null },
  { key: 'omnimarket-projection-delegation', label: 'omnimarket-projection-delegation', status: 'RUNNING', severity: 'nominal', status_reason: 'healthy: consumer lag 0', last_seen: '2026-10-07T11:59:41Z' },
];

export const SEED_ALERT_ROWS: readonly AlertBannerRow[] = [
  { alert_id: 'fixture-alert-001', code: 'SERVICE_DOWN', severity: 'critical', subject: 'omninode-runtime', since: '2026-10-07T11:58:51Z', link: '#/local/runs?service=omninode-runtime' },
  { alert_id: 'fixture-alert-002', code: 'SERVICE_UNHEALTHY', severity: 'attention', subject: 'valkey', since: '2026-10-07T11:56:10Z', link: '#/local/overview?service=valkey' },
  { alert_id: 'fixture-alert-003', code: 'SERVICE_STALE', severity: 'unknown', subject: 'runtime-effects', since: '2026-10-07T11:55:00Z', link: null },
];
