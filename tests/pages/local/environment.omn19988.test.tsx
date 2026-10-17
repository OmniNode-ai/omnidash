// @vitest-environment jsdom
// OMN-19988: the Overview Environment panel shows each served local-environment.v1 row as a status tile and each open
// alert as a banner line, presenting the projection's own verdict and alert and computing neither.
//
// Failure modes, each with a test below:
//   E1  a tile shows something other than the served verdict, or no reason for it;
//   E2  a verdict is presented with the wrong severity (a DOWN service drawn as nominal, a STALE one as healthy);
//   E3  a row with no open alert shows a banner line, or an open alert is missing one;
//   E4  an alert line does not link to the failed-runs view (R2: each error links to a filtered Runs view);
//   E5  a verdict outside the four the projection serves is shown as one of them instead of as unknown;
//   E6  rows of another mode are mixed into the panel's mode;
//   E7  a served word that names an inherited object key (constructor, toString, __proto__) is drawn as that key's
//       value instead of as unknown.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ENVIRONMENT_TOPIC,
  EnvironmentAlerts,
  EnvironmentStatus,
  environmentAlertRows,
  environmentTileRows,
} from '@/pages/local/environment';

const base = {
  tenant_id: '97b9aa50-f53f-adb8-5404-5c7318dd4cb1',
  mode: 'compose',
  observed_state: 'running',
  reason: 'healthy',
  last_seen: '2026-10-17T10:00:00+00:00',
  last_change: '2026-10-17T09:00:00+00:00',
  alert_code: null,
  alert_severity: null,
  alert_since: null,
};

const rows = [
  { ...base, service: 'postgres', verdict: 'running', verdict_reason: 'reported running' },
  {
    ...base,
    service: 'valkey',
    observed_state: 'unhealthy',
    verdict: 'unhealthy',
    verdict_reason: 'health check failed',
    alert_code: 'SERVICE_DEGRADED',
    alert_severity: 'warning',
    alert_since: '2026-10-17T09:58:00+00:00',
  },
  {
    ...base,
    service: 'omninode-runtime',
    observed_state: 'down',
    verdict: 'down',
    verdict_reason: 'container exited',
    alert_code: 'SERVICE_DOWN',
    alert_severity: 'critical',
    alert_since: '2026-10-17T09:59:00+00:00',
  },
  {
    ...base,
    service: 'runtime-effects',
    verdict: 'stale',
    verdict_reason: 'no report for 70 s',
    alert_code: 'HEALTH_UNKNOWN',
    alert_severity: 'warning',
    alert_since: '2026-10-17T09:59:30+00:00',
  },
];

describe('OMN-19988 Environment panel rows', () => {
  it('E1: each tile carries the served verdict and its reason', () => {
    expect(environmentTileRows(rows, 'compose').map((t) => [t.key, t.status, t.status_reason])).toEqual([
      ['postgres', 'RUNNING', 'reported running'],
      ['valkey', 'UNHEALTHY', 'health check failed'],
      ['omninode-runtime', 'DOWN', 'container exited'],
      ['runtime-effects', 'STALE', 'no report for 70 s'],
    ]);
  });

  it('E2: each verdict has its own severity', () => {
    expect(environmentTileRows(rows, 'compose').map((t) => t.severity)).toEqual([
      'nominal',
      'attention',
      'critical',
      'unknown',
    ]);
  });

  it('E3: only rows with an open alert give a banner line, one each', () => {
    expect(environmentAlertRows(rows, 'compose').map((a) => [a.subject, a.code, a.severity, a.since])).toEqual([
      ['valkey', 'SERVICE_DEGRADED', 'attention', '2026-10-17T09:58:00+00:00'],
      ['omninode-runtime', 'SERVICE_DOWN', 'critical', '2026-10-17T09:59:00+00:00'],
      ['runtime-effects', 'HEALTH_UNKNOWN', 'attention', '2026-10-17T09:59:30+00:00'],
    ]);
  });

  it('E4: every alert links to the failed-runs view', () => {
    expect(new Set(environmentAlertRows(rows, 'compose').map((a) => a.link))).toEqual(new Set(['/runs?status=failed']));
  });

  it('E5: a verdict the projection does not serve shows as unknown, under its own word', () => {
    const [tile] = environmentTileRows([{ ...rows[0], verdict: 'exploded' }], 'compose');
    expect([tile.status, tile.severity]).toEqual(['EXPLODED', 'unknown']);
  });

  it('E6: rows of another mode stay out of the panel', () => {
    const native = { ...rows[0], mode: 'native', service: 'local-runtime' };
    expect(environmentTileRows([...rows, native], 'compose').map((t) => t.key)).not.toContain('local-runtime');
    expect(environmentTileRows([...rows, native], 'native').map((t) => t.key)).toEqual(['local-runtime']);
  });

  it('E7: a verdict or alert severity naming an inherited object key is drawn as unknown', () => {
    for (const word of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const [tile] = environmentTileRows([{ ...rows[0], verdict: word }], 'compose');
      expect(tile.severity).toBe('unknown');
      const [line] = environmentAlertRows([{ ...rows[0], alert_code: 'SERVICE_DOWN', alert_severity: word }], 'compose');
      expect(line.severity).toBe('unknown');
    }
  });
});

describe('OMN-19988 Environment panel rendering', () => {
  it('renders one tile per service with its verdict word', () => {
    render(<EnvironmentStatus rows={rows} mode="compose" />);
    const tile = screen.getByText('omninode-runtime').closest('[data-severity]');
    expect(tile?.getAttribute('data-severity')).toBe('critical');
    expect(within(tile as HTMLElement).getByText('DOWN')).toBeTruthy();
  });

  it('renders a critical banner for SERVICE_DOWN and names the topic it waits on when empty', () => {
    render(<EnvironmentAlerts rows={rows} mode="compose" />);
    expect(screen.getAllByTestId('alert-banner-critical')).toHaveLength(1);
    render(<EnvironmentStatus rows={[]} mode="compose" />);
    expect(screen.getByText(new RegExp(ENVIRONMENT_TOPIC.replace(/\./g, '\\.')))).toBeTruthy();
  });
});
