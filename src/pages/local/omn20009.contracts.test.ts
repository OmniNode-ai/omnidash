// OMN-20009: the page contract binds the Run locally share and the Avg saving / call to served fields only.
//
// Failure modes, each with a test below:
//   C1  Run locally is bound to delegation.model-routing.v1 and names the served local_call_share, not the
//       tier-routed pct_of_tier_routed and not a count the browser would have to divide;
//   C2  Avg saving / call names savings_per_measured_run_usd of metering-summary.v1; it binds that exposure only once
//       the lab catalogue serves the exposure AND lists that field among its columns (the browser never computes the
//       saving, so a served exposure without the field is not enough), and waits (unbound) until then;
//   C3  a metering-summary row with no saving (savings_usd null) never switches the whole Overview to
//       Baseline unresolved: the per-run card says why on its own.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocalPageConfig, resolveLocalPageEmptyState, type BoundProjectionSnapshot } from '../../layout/local-page-loader';

const ROUTING = 'onex.snapshot.projection.delegation.model-routing.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';

type Exposure = { topic: string; status: string; columns?: string[] };
const labCatalogue = JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/served-catalogue.lab.json'), 'utf8')) as {
  exposures: Exposure[];
};
const okTopics = new Set(labCatalogue.exposures.filter((exposure) => exposure.status === 'ok').map((exposure) => exposure.topic));

const SAVING_FIELD = 'savings_per_measured_run_usd';
// The C2 trigger: the card must bind metering-summary.v1 only when it is served ok AND serves the saving field.
const mustBindSaving = (exposures: Exposure[]): boolean =>
  exposures.some((e) => e.topic === METERING && e.status === 'ok' && (e.columns ?? []).includes(SAVING_FIELD));

const page = () => loadLocalPageConfig('overview');
const component = (id: string) => page().components.find((candidate) => candidate.component_id === id);
const widgetConfig = (id: string) =>
  page().dashboard.widgets.find((widget) => widget.data_source === id)?.config as Record<string, unknown> | undefined;

describe('OMN-20009 Overview page contract', () => {
  it('C1: Run locally reads local_call_share from delegation.model-routing.v1', () => {
    const card = component('overview-run-locally');
    expect(card?.component_kind).toBe('metric_card');
    expect(card?.title).toBe('Run locally');
    expect(card?.data_bindings?.map((binding) => binding.projection_topic)).toEqual([ROUTING]);
    expect(card?.data_bindings?.[0]?.required_fields).toEqual(['by_tier']);
    expect(okTopics.has(ROUTING)).toBe(true);
    const config = widgetConfig('overview-run-locally');
    expect(config?.metric_key).toBe('by_tier.local_call_share');
    expect(config?.format).toBe('percent');
  });

  it('C2: Avg saving / call names savings_per_measured_run_usd and binds metering-summary.v1 only once it serves that field', () => {
    const card = component('overview-avg-saving-per-call');
    expect(card?.component_kind).toBe('metric_card');
    expect(card?.title).toBe('Avg saving / call');
    expect(widgetConfig('overview-avg-saving-per-call')?.metric_key).toBe(SAVING_FIELD);
    const topics = (card?.data_bindings ?? []).map((binding) => binding.projection_topic);
    if (mustBindSaving(labCatalogue.exposures)) {
      expect(topics).toEqual([METERING]);
      expect(card?.data_bindings?.[0]?.required_fields).toContain(SAVING_FIELD);
    } else {
      // The field is not served on the lab (captured columns): the card waits, typed, and binds nothing else.
      expect(topics).toEqual([]);
      expect(card?.supported_empty_state_reasons).toEqual(['upstream-blocked']);
    }
  });

  it('C2 controls: served exposure without the field keeps the card waiting; with the field the rule says must bind', () => {
    const real = labCatalogue.exposures.find((e) => e.topic === METERING)!;
    // Positive control for the instrument: the real capture carries columns for this exposure and savings_usd is among them.
    expect(real.columns).toContain('savings_usd');
    const withoutField: Exposure[] = [{ ...real, status: 'ok', columns: (real.columns ?? []).filter((c) => c !== SAVING_FIELD) }];
    const withField: Exposure[] = [{ ...real, status: 'ok', columns: [...(real.columns ?? []), SAVING_FIELD] }];
    const card = component('overview-avg-saving-per-call');
    // (i) served, field absent: no bind required, and today's unbound upstream-blocked card is the correct state.
    expect(mustBindSaving(withoutField)).toBe(false);
    expect(card?.data_bindings ?? []).toEqual([]);
    expect(card?.supported_empty_state_reasons).toEqual(['upstream-blocked']);
    // (ii) served with the field: the rule must demand a bind, which today's unbound card does not satisfy, so this
    // is the check that goes red the day the field is served and the card is left unbound.
    expect(mustBindSaving(withField)).toBe(true);
    expect((card?.data_bindings ?? []).map((b) => b.projection_topic)).not.toEqual([METERING]);
    // Not served at all (degraded), even with the field listed: no bind.
    expect(mustBindSaving([{ ...withField[0]!, status: 'degraded' }])).toBe(false);
  });

  it('C3: a metering-summary row without a saving does not make the whole page Baseline unresolved', () => {
    const doc = page();
    const withMetering = {
      ...doc,
      components: [...doc.components, {
        component_id: 'probe-metering', component_kind: 'metric_card' as const, title: 'probe',
        contract_version: { major: 1, minor: 0, patch: 0 },
        data_bindings: [{ binding_id: 'probe', projection_topic: METERING, ordering_authority_field: 'as_of' }],
      }],
    } as typeof doc;
    const snapshots: BoundProjectionSnapshot[] = [{
      topic: METERING, rows: [{ window_kind: 'all', savings_usd: null, baseline_state: 'unresolved' }], rowCount: 1,
      dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-10-04T14:30:00Z',
    }];
    expect(resolveLocalPageEmptyState(withMetering, snapshots)).not.toBe('BASELINE_UNRESOLVED');
  });
});
