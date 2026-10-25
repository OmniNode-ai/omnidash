// OMN-21166 (Lakshman, live review 2026-10-25): an Overview headline card's hover is two or three short lines with
// what matters. Failure modes, each with a test below:
//   H1  a count the row does not serve is written as 0 (or dropped as if zero) instead of Not recorded;
//   H2  a zero exclusion is listed ("0 runs ...") as noise;
//   H3  Spend or Savings stop naming the baseline and the pricing version (OMN-21304 AC4);
//   H4  the tokens hover loses either direction.
import { describe, expect, it } from 'vitest';
import { headlineHoverLines } from '@/pages/LocalDashboardPage';

const ROW = { baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0', runs_total: 618, runs_measured: 611,
  runs_unknown_tokens: 7, runs_unknown_spend: 0, tokens_in: 591383, tokens_out: 289572 };

describe('headlineHoverLines', () => {
  it('H2/H3: spend says what it is, the runs not counted, and its baseline and pricing; zero exclusions are left out', () => {
    expect(headlineHoverLines('overview-spend', ROW, null)).toEqual([
      'What you paid, all time', 'Not counted: 7 runs without token counts', 'Baseline claude-sonnet-5-5 · pricing v1.0.0',
    ]);
  });

  it('H3: savings names that it is modelled and carries the served percentage line when there is one', () => {
    const lines = headlineHoverLines('overview-savings', ROW, '94% below the claude-sonnet-5-5 baseline (modelled)');
    // Jonah's savings handoff on OMN-19981, item 5: a modelled saving says the baseline never ran.
    expect(lines[0]).toBe('Modelled at claude-sonnet-5-5 prices. The baseline never ran.');
    expect(lines).toContain('94% below the claude-sonnet-5-5 baseline (modelled)');
    expect(headlineHoverLines('overview-savings', ROW, null)).toContain('Baseline claude-sonnet-5-5 · pricing v1.0.0');
  });

  it('agent calls reads measured of all runs', () => {
    expect(headlineHoverLines('overview-measured', ROW, null)).toEqual(['611 of 618 runs measured', 'Not counted: 7 runs without token counts']);
  });

  it('a zero day or a window holding days with no runs says so', () => {
    expect(headlineHoverLines('overview-measured', { ...ROW, days_without_runs: 1, window_kind: 'day' }, null, 'day:2026-09-01'))
      .toContain('No runs on 2026-09-01 (UTC)');
    expect(headlineHoverLines('overview-measured', { ...ROW, days_without_runs: 4, window_kind: 'range' }, null, 'range:2026-10-11..2026-10-25'))
      .toContain('Includes 4 days with no runs');
  });

  it('H4: tokens give both directions', () => {
    expect(headlineHoverLines('overview-tokens', ROW, null)).toEqual(['591,383 in · 289,572 out']);
  });

  it('H1: a count or name the row does not serve reads Not recorded, never 0', () => {
    const bare = { runs_measured: 611 };
    expect(headlineHoverLines('overview-measured', bare, null)).toEqual(['611 of Not recorded runs measured', 'Runs not counted: Not recorded']);
    expect(headlineHoverLines('overview-tokens', { tokens_in: 5 }, null)).toEqual(['5 in · Not recorded out']);
    expect(headlineHoverLines('overview-spend', bare, null)).toContain('Baseline Not recorded · pricing Not recorded');
  });
});
