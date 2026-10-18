// @vitest-environment jsdom
// OMN-21015 AC2: Overview's Tier mix lists each model under its tier with its share of runs and its cost. Falsifier on
// the ticket: "a fixture with two models in one tier renders one row, or model shares that do not sum to the tier's
// share". The models, shares and costs are served by delegation.model-routing.v1 (omnimarket migration 0060); the
// panel renders them as served and adds up nothing.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TierMixPanel } from './LocalDashboardPage';

// Constructed in the served shape: 3 qwen-a and 1 unpriced qwen-b on local, 2 priced gemini on cheap_cloud.
const ROW = {
  tenant_id: '0af28cd0-0654-42e0-a050-358ee8240940',
  by_tier: {
    total_tasks: 7, tier_routed_total: 6, not_tier_routed_count: 1,
    tiers: [
      { cost_tier_name: 'local', count: 4, tier_routed: true, pct_of_tier_routed: 0.6666666666666666, models: [
        { model_name: 'qwen-a', count: 3, pct_of_tier_routed: 0.5, cost_usd: 0, unmeasured_cost_count: 0 },
        { model_name: 'qwen-b', count: 1, pct_of_tier_routed: 0.16666666666666666, cost_usd: null, unmeasured_cost_count: 1 },
      ] },
      { cost_tier_name: 'cheap_cloud', count: 2, tier_routed: true, pct_of_tier_routed: 0.3333333333333333, models: [
        { model_name: 'gemini', count: 2, pct_of_tier_routed: 0.3333333333333333, cost_usd: 0.009, unmeasured_cost_count: 0 },
      ] },
    ],
  },
};

function cells(name: string): string[] {
  return within(screen.getByRole('row', { name: new RegExp(`^${name}`) })).getAllByRole('cell').map((c) => c.textContent ?? '');
}

describe('OMN-21015 AC2: the Tier mix lists each model under its tier', () => {
  it('T1: two models in one tier are two rows, each under its tier', () => {
    render(<TierMixPanel row={ROW} />);
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['local', 'qwen-a', 'qwen-b', 'cheap_cloud', 'gemini']);
  });

  // OMN-21166 (Lakshman, 2026-10-18): the share reads as a percent; the exact served fraction stays as its title.
  it('T2: each model row shows its served runs and share, the share exact in its title', () => {
    render(<TierMixPanel row={ROW} />);
    expect(cells('qwen-a').slice(1, 3)).toEqual(['3', '50.0%']);
    expect(cells('qwen-b').slice(1, 3)).toEqual(['1', '16.7%']);
    expect(cells('gemini').slice(1, 3)).toEqual(['2', '33.3%']);
    const title = (name: string) => within(screen.getByRole('row', { name: new RegExp(`^${name}`) })).getAllByRole('cell')[2]!.querySelector('[title]')?.getAttribute('title');
    expect([title('qwen-a'), title('qwen-b'), title('gemini')]).toEqual(['0.5', '0.16666666666666666', '0.3333333333333333']);
  });

  it('T3: a model cost is the served sum; an unpriced group says Not measured with its run count, never $0', () => {
    render(<TierMixPanel row={ROW} />);
    expect(cells('gemini')[3]).toBe('$0.009');
    expect(cells('qwen-a')[3]).toBe('$0.00');
    expect(cells('qwen-b')[3]).toBe('Not measured (1 run)');
  });

  it('T4: a tier row shows no cost of its own, since none is served for it', () => {
    render(<TierMixPanel row={ROW} />);
    expect(cells('local')[3]).toBe('');
  });

  it('T6: a model served with a cost but no unmeasured count never reads as fully measured', () => {
    // Found by the U6 guard: reading a missing count as 0 would print the cost as if every run were priced.
    const tiers = ROW.by_tier.tiers.map((tier) => ({
      ...tier,
      models: tier.models.map(({ unmeasured_cost_count: _count, ...model }) => model),
    }));
    render(<TierMixPanel row={{ ...ROW, by_tier: { ...ROW.by_tier, tiers } }} />);
    expect(cells('gemini')[3]).toBe('$0.009 (unpriced runs unknown)');
    expect(cells('qwen-b')[3]).toBe('Not measured');
  });

  it('T5: a row served before the models key existed still renders its tiers, with no model rows', () => {
    const old = { ...ROW, by_tier: { ...ROW.by_tier, tiers: ROW.by_tier.tiers.map(({ models: _models, ...tier }) => tier) } };
    render(<TierMixPanel row={old} />);
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(names).toEqual(['local', 'cheap_cloud']);
  });
});
