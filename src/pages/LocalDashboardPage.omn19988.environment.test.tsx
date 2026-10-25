// @vitest-environment jsdom
// OMN-21166 live review 2026-10-25: Lakshman moved the Environment panel from Overview to API Keys (which already reads
// local-environment.v1); every check below now runs on the API Keys page, unchanged otherwise.
// The production Overview, not only the isolated Environment widgets, must read
// and render its declared health exposure. Failure modes before implementation:
// E8: native health/versions disappear when there have been no delegations;
// E9: a served DOWN verdict/open alert never reaches the real Overview;
// E10: an absent health exposure reads as healthy or merely "No runs yet";
// E11: absent versions are invented, and implementation codes leak as labels.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOPIC = 'onex.snapshot.projection.local-environment.v1';
const harness = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], available: true, refused: false, timeout: false, reads: [] as string[] }));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      harness.reads.push(topic);
      if (topic === 'onex.snapshot.projection.local-environment.v1' && harness.refused) throw new Error('Health read refused');
      if (topic === 'onex.snapshot.projection.local-environment.v1' && harness.timeout) await new Promise(() => {});
      const rows = topic === 'onex.snapshot.projection.local-environment.v1' ? harness.rows : [];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-10-24T05:12:00Z' };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => {
    const { loadLocalPageConfig } = await import('@/layout/local-page-loader');
    const topics = new Set(loadLocalPageConfig('api-keys').components.flatMap(component => component.data_bindings?.map(binding => binding.projection_topic) ?? []));
    if (!harness.available) topics.delete('onex.snapshot.projection.local-environment.v1');
    return { rows: [...topics].map(topic => ({ topic, reachability: 'reachable' })) };
  },
}));

import { LocalDashboardPage } from './LocalDashboardPage';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import Ajv from 'ajv';
import dashboardConfigSchema from './local/model-dashboard-config.schema.json';

const native = {
  tenant_id: '22222222-2222-4222-8222-222222222222', mode: 'native', service: 'local-runtime',
  observed_state: 'running', verdict: 'running', verdict_reason: 'dashboard serving',
  versions: { omnimarket: '0.4.320', omnibase_core: '0.47.53', omnidash: '1.1.10' },
  last_seen: '2026-10-24T05:12:00Z', last_change: '2026-10-24T05:10:00Z',
  alert_code: null, alert_severity: null, alert_since: null,
  store_kind: 'sqlite', token_minted_at: '2026-10-24T05:10:00Z',
};

async function open(rows: Record<string, unknown>[]) {
  harness.rows = rows;
  render(<LocalDashboardPage pageName="api-keys" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-24T05:12:00Z') });
  harness.rows = []; harness.reads = []; harness.available = true; harness.refused = false; harness.timeout = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('OMN-19988 production Overview Environment binding', () => {
  it('declares the actual Environment panel with a core-valid status_grid config', () => {
    const page = loadLocalPageConfig('api-keys');
    expect(page.components.find(component => component.component_id === 'api-keys-environment')?.component_kind).toBe('status_grid');
    const validate = new Ajv({ allErrors: true, validateFormats: false, strict: false }).compile(dashboardConfigSchema);
    expect(validate(page.dashboard), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...page.dashboard, widgets: [...page.dashboard.widgets, {
      widget_id: '22222222-2222-4222-8222-222222222222', title: 'Invalid', row: 0, col: 0, width: 12, height: 2,
      config: { config_kind: 'alert_banner', widget_type: 'alert_banner' },
    }] })).toBe(false);
  });
  it('E8: reads native health and versions with no delegation rows and no compose tiles', async () => {
    await open([native]);
    expect(harness.reads).toContain(TOPIC);
    const heading = screen.getByRole('heading', { name: /^Environment$/ });
    const panel = heading.closest('article') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByText('native', { exact: true })).toBeTruthy();
    for (const version of Object.values(native.versions)) expect(within(panel).getByText(version, { exact: true })).toBeTruthy();
    expect(within(panel).getByText('local-runtime', { exact: true })).toBeTruthy();
    expect(within(panel).queryByText('compose', { exact: true })).toBeNull();
    expect(within(panel).queryByText('No runs yet', { exact: true })).toBeNull();
  });

  it('E9: renders the served DOWN service and its open alert linked to failed Runs', async () => {
    await open([{ ...native, mode: 'compose', service: 'valkey', observed_state: 'down', verdict: 'down',
      verdict_reason: 'connection refused', versions: {}, alert_code: 'SERVICE_DOWN', alert_severity: 'critical',
      alert_since: '2026-10-24T05:11:50Z', store_kind: null, token_minted_at: null }]);
    const tile = screen.getByTestId('status-grid-tile');
    expect(within(tile).getByText('DOWN', { exact: true })).toBeTruthy();
    const alert = screen.getByTestId('alert-banner-critical');
    expect(within(alert).getByText('valkey', { exact: true })).toBeTruthy();
    expect(within(alert).getByRole('link').getAttribute('href')).toBe('/runs?status=failed');
    expect(within(alert).queryByText('SERVICE_DOWN', { exact: true })).toBeNull();
    expect(within(alert).getByText('Service down', { exact: true })).toBeTruthy();
    expect(alert.querySelector('[data-alert-code="SERVICE_DOWN"]')).toBeTruthy();
    expect(alert.getAttribute('aria-label') ?? '').not.toContain('SERVICE_DOWN');
    expect(within(alert).getByRole('link').getAttribute('aria-label')).not.toContain('SERVICE_DOWN');
  });

  it('E10: names unavailable service health rather than claiming all clear when its exposure is absent', async () => {
    harness.available = false;
    await open([]);
    const heading = screen.getByRole('heading', { name: /^Environment$/ });
    const panel = heading.closest('article') as HTMLElement;
    expect(within(panel).getByText(/service health.*not available/i)).toBeTruthy();
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
  });

  it('E11: a native row with unrecorded versions stays explicit about the missing value', async () => {
    await open([{ ...native, versions: null }]);
    const heading = screen.getByRole('heading', { name: /^Environment$/ });
    const panel = heading.closest('article') as HTMLElement;
    expect(within(panel).getByText('Not recorded', { exact: true })).toBeTruthy();
    expect(within(panel).queryByText('0.4.320', { exact: true })).toBeNull();
  });

  it.each(['empty', 'refused'] as const)('does not claim All clear for %s health data', async (state) => {
    harness.refused = state === 'refused';
    await open([]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(panel.textContent).toMatch(/not available|could not|refused|cannot/i);
  });

  it('refuses an incomplete alert rather than presenting an invented healthy state', async () => {
    await open([{ ...native, mode: 'compose', verdict: 'down', alert_code: 'SERVICE_DOWN', alert_severity: 'critical', alert_since: null }]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(panel.textContent).toMatch(/alert.*not available|alert.*refused/i);
    expect(panel.textContent).not.toContain('SERVICE_DOWN');
    expect(panel.textContent).not.toContain(TOPIC);
  });

  // Additional integration falsifier discovered during review, before the
  // refused-health presentation correction (separate from the initial RED).
  it.each(['verdict_reason', 'service', 'verdict'])('does not claim All clear when a health row lacks %s', async field => {
    await open([{ ...native, [field]: null }]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(within(panel).getByText('Some service health details are not available.', { exact: true })).toBeTruthy();
    expect(panel.textContent).not.toContain('status_reason');
  });

  it('keeps valid service tiles and open alerts beside a refused health row', async () => {
    await open([{ ...native, mode: 'compose', service: 'valkey', verdict_reason: null },
      { ...native, mode: 'compose', service: 'postgres', verdict: 'down', alert_code: 'SERVICE_DOWN',
        alert_severity: 'critical', alert_since: '2026-10-24T05:11:50Z' }]);
    expect(screen.getAllByTestId('status-grid-tile')).toHaveLength(1);
    expect(within(screen.getByTestId('status-grid-tile')).getByText('postgres', { exact: true })).toBeTruthy();
    expect(within(screen.getByTestId('alert-banner-critical')).getByText('Service down', { exact: true })).toBeTruthy();
    expect(screen.getByText('Some service health details are not available.', { exact: true })).toBeTruthy();
  });

  it('keeps timeout distinct from an empty successful health read', async () => {
    harness.timeout = true;
    await open([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(panel.textContent).toMatch(/not available|did not answer|timed out/i);
  });

  it('retains saved native rows after a failed refresh without claiming All clear', async () => {
    await open([native]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).getByText(/All clear/i)).toBeTruthy();
    harness.refused = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(30001); });
    expect(within(panel).getByText('native', { exact: true })).toBeTruthy();
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(panel.textContent).toMatch(/not available|could not|refused|cannot/i);
  });

  it.each(['native', 'compose'])('positive clear control: complete running %s health has no open alerts', async mode => {
    await open([{ ...native, mode }]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(within(panel).getByText(/All clear/i)).toBeTruthy();
    expect(within(panel).getByText('RUNNING', { exact: true })).toBeTruthy();
  });

  it('partitions mixed-mode rows without projecting a compose service into native mode', async () => {
    await open([native, { ...native, mode: 'compose', service: 'postgres' }]);
    const nativeGroup = screen.getByRole('region', { name: 'native environment' });
    const composeGroup = screen.getByRole('region', { name: 'compose environment' });
    expect(within(nativeGroup).getByText('local-runtime', { exact: true })).toBeTruthy();
    expect(within(nativeGroup).queryByText('postgres', { exact: true })).toBeNull();
    expect(within(composeGroup).getByText('postgres', { exact: true })).toBeTruthy();
    expect(within(composeGroup).queryByText('local-runtime', { exact: true })).toBeNull();
  });

  it.each(['down', 'unhealthy', 'stale'])('does not invent an alert or clear claim for a served %s verdict without alert details', async verdict => {
    await open([{ ...native, mode: 'compose', verdict }]);
    expect(screen.getByText(verdict.toUpperCase(), { exact: true })).toBeTruthy();
    expect(screen.queryByText(/All clear/i)).toBeNull();
    expect(screen.queryByTestId('alert-banner-critical')).toBeNull();
  });

  it.each([
    ['down', 'SERVICE_DOWN', 'critical', 'Service down'],
    ['unhealthy', 'SERVICE_DEGRADED', 'warning', 'Service degraded'],
    ['stale', 'HEALTH_UNKNOWN', 'warning', 'Health unknown'],
  ])('renders the served %s verdict and its matching open alert', async (verdict, code, severity, label) => {
    await open([{ ...native, mode: 'compose', verdict, alert_code: code, alert_severity: severity, alert_since: native.last_seen }]);
    const show = screen.queryByRole('button', { name: 'show' });
    if (show) fireEvent.click(show);
    expect(within(screen.getByTestId('status-grid-tile')).getByText(verdict.toUpperCase(), { exact: true })).toBeTruthy();
    expect(screen.getByText(label, { exact: true })).toBeTruthy();
    expect(screen.queryByText(code, { exact: true })).toBeNull();
    expect(screen.queryByText(/All clear/i)).toBeNull();
  });

  it('presents an unknown verdict as unknown, retaining its machine status without a clear claim', async () => {
    await open([{ ...native, verdict: 'constructor' }]);
    const tile = screen.getByTestId('status-grid-tile');
    expect(tile.textContent).not.toContain('CONSTRUCTOR');
    expect(tile.getAttribute('data-status')).toBe('CONSTRUCTOR');
    expect(within(tile).getByText('Health unknown', { exact: true })).toBeTruthy();
    expect(screen.queryByText(/All clear/i)).toBeNull();
  });

  it('refuses a noncanonical mode without exposing it as a product label', async () => {
    await open([{ ...native, mode: 'constructor' }]);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(panel.textContent).not.toContain('constructor');
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    expect(within(panel).getByText('Some service health details are not available.', { exact: true })).toBeTruthy();
  });

  it('names an incomplete alert with a missing code without suppressing another valid open alert', async () => {
    await open([{ ...native, mode: 'compose', service: 'valkey', alert_severity: 'critical', alert_since: native.last_seen },
      { ...native, mode: 'compose', service: 'postgres', verdict: 'down', alert_code: 'SERVICE_DOWN',
        alert_severity: 'critical', alert_since: native.last_seen }]);
    expect(screen.getByText('Alert details are not available.', { exact: true })).toBeTruthy();
    expect(screen.getByTestId('alert-banner-critical').textContent).toContain('Service down');
    expect(screen.queryByText(/All clear/i)).toBeNull();
  });

  it.each([['INTERNAL_UNKNOWN_ALERT', 'critical'], ['SERVICE_DOWN', 'constructor']])('keeps unknown alert code/severity out of visible and accessible labels (%s, %s)', async (code, severity) => {
    await open([{ ...native, verdict: 'down', alert_code: code, alert_severity: severity, alert_since: native.last_seen }]);
    const show = screen.queryByRole('button', { name: 'show' });
    if (show) fireEvent.click(show);
    const panel = screen.getByRole('heading', { name: /^Environment$/ }).closest('article') as HTMLElement;
    expect(panel.textContent).not.toContain(code);
    expect(panel.textContent).not.toContain('constructor');
    expect(panel.querySelector(`[data-alert-code="${code}"]`)).toBeTruthy();
    expect(within(panel).queryByText(/All clear/i)).toBeNull();
    for (const element of panel.querySelectorAll('[aria-label],[title]')) {
      expect((element.getAttribute('aria-label') ?? '') + (element.getAttribute('title') ?? '')).not.toContain(code);
    }
  });
});
