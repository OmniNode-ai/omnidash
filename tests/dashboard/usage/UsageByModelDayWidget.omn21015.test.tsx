// @vitest-environment jsdom
// OMN-21015 AC4, page half: the Usage by-model table shows each row's tier and its share of calls beside the calls
// column. The ticket's falsifier: "the shares do not sum to 100". usage-by-model-day.v1 serves cost_tier_name and
// call_share (omnimarket migration 0003): the share is the row's calls over its tenant's calls that UTC day, as Jonah
// ruled on 2026-10-14. The page formats the served fraction as a percentage and computes nothing.
//
// Failure modes each test is written against:
//   * the tier or the share is missing, or not beside the calls column (S1);
//   * one model under two tiers on one day is shown as one row (S2);
//   * the served share is shown as a raw fraction, or rounded so far a day's shares cannot be read as summing to 100 (S3);
//   * not_tier_routed is shown as a tier name (S4);
//   * a row with no served share, or a server that serves no tier, shows 0, 100% or a share the browser worked out
//     from the call counts (S5);
//   * the page declarations do not ask for the two fields, so a server without them is not caught (S6).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageByModelDayTable } from '@/components/dashboard/usage/UsageByModelDayWidget';

const row = (overrides: Record<string, unknown>) => ({
  tenant_id: 'tenant-a',
  usage_day: '2026-10-14',
  model_id: 'qwen',
  cost_tier_name: 'local',
  input_tokens: 10,
  output_tokens: 2,
  measured_cost_usd: 0,
  unmeasured_call_count: 0,
  call_count: 3,
  call_share: 0.75,
  ...overrides,
});

function cells(index: number): string[] {
  return within(screen.getAllByRole('row')[index + 1]!).getAllByRole('cell').map((c) => c.textContent ?? '');
}

function headers(): string[] {
  return screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
}

describe('OMN-21015 AC4: the Usage table shows each row tier and share of calls beside its calls', () => {
  it('S1: Tier, Calls and Share of calls stand side by side', () => {
    render(<UsageByModelDayTable rows={[row({})]} />);
    const at = headers().indexOf('Calls');
    expect(headers().slice(at - 1, at + 2)).toEqual(['Tier', 'Calls', 'Share of calls']);
  });

  it('S2: one model under two tiers on one day is two rows, each with its tier', () => {
    render(<UsageByModelDayTable rows={[
      row({ call_count: 2, call_share: 0.5 }),
      row({ cost_tier_name: 'cheap_cloud', call_count: 2, call_share: 0.5 }),
    ]} />);
    const tier = headers().indexOf('Tier');
    expect([cells(0)[tier], cells(1)[tier]]).toEqual(['local', 'cheap_cloud']);
  });

  it('S3: the served share reads as a percentage, to two decimals at most', () => {
    render(<UsageByModelDayTable rows={[
      row({ call_share: 0.75 }),
      row({ model_id: 'gemini', cost_tier_name: 'cheap_cloud', call_count: 1, call_share: 0.16666666666666666 }),
      row({ usage_day: '2026-10-13', call_share: 1 }),
    ]} />);
    const share = headers().indexOf('Share of calls');
    expect([0, 1, 2].map((i) => cells(i)[share])).toEqual(['75%', '16.67%', '100%']);
  });

  it('S4: a call with no tier reads Not tier-routed, never a tier called not_tier_routed', () => {
    render(<UsageByModelDayTable rows={[row({ cost_tier_name: 'not_tier_routed' })]} />);
    expect(cells(0)[headers().indexOf('Tier')]).toBe('Not tier-routed');
  });

  it('S5: no served share, or no served tier, reads Not recorded; nothing is worked out from the counts', () => {
    // An older row that serves neither a tier nor a share: the two keys are absent, not null.
    const older = Object.fromEntries(Object.entries(row({ call_count: 3 })).filter(([key]) => key !== 'cost_tier_name' && key !== 'call_share'));
    render(<UsageByModelDayTable rows={[row({ call_share: null }), older]} />);
    const share = headers().indexOf('Share of calls');
    const tier = headers().indexOf('Tier');
    expect([cells(0)[share], cells(1)[share], cells(1)[tier]]).toEqual(['Not recorded', 'Not recorded', 'Not recorded']);
    expect(screen.queryByText(/^100%$|^0%$/)).not.toBeInTheDocument();
  });

  it('S6: the page asks the exposure for the tier and the share, and lays them out beside the calls', () => {
    const contracts = JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/usage.contracts.yaml'), 'utf8'));
    const table = contracts.components.find((c: { component_id: string }) => c.component_id === 'usage-by-model-day');
    expect(table.data_bindings[0].required_fields).toEqual(expect.arrayContaining(['cost_tier_name', 'call_share']));
    const page = JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/usage.page.yaml'), 'utf8'));
    const widget = page.widgets.find((w: { data_source: string }) => w.data_source === 'usage-by-model-day');
    const keys = widget.config.columns.map((c: { key: string }) => c.key);
    const at = keys.indexOf('call_count');
    expect(keys.slice(at - 1, at + 2)).toEqual(['cost_tier_name', 'call_count', 'call_share']);
  });
});
