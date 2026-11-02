// @vitest-environment jsdom
// OMN-21970 AC3 and the 2026-11-02 dashboard tour (Lakshman: "Fix all issues if we have"): once every served run is
// read, no Runs or Usage caption calls the rows "the latest" ones, and "measured" means one thing.
//
// Failure modes, each with a test below:
//   L1  Runs' totals line, Runs' routing note or Usage analysis says "latest N served runs" after a complete read
//   L2  Runs' This week line says "runs in the latest returned rows" after a complete read
//   L3  an incomplete read stops saying its rows are only the latest ones
//   L4  Runs' totals call runs with a recorded cost "measured", which Overview uses for runs with tokens and a cost
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoutingAnalysis, RunsTotals, UsageAnalysis } from './usage-analysis';
import { RunsTable } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const rows = Array.from({ length: 6 }, (_, index) => ({
  correlation_id: `run-${index}`, written_at: new Date(NOW - index * 3_600_000).toISOString(),
  created_at: new Date(NOW - index * 3_600_000).toISOString(), terminal_ok: 1, quality_gate_passed: index === 0 ? 0 : 1,
  latency_ms: 1000 + index, cost_usd: index < 4 ? '0.01' : null, model_name: 'm', cost_tier_name: 'local', task_type: 'document',
}));
const text = () => document.body.textContent ?? '';

describe('OMN-21970: captions after a complete read', () => {
  it('L1: Runs totals, routing note and Usage analysis name all served runs, never the latest', () => {
    render(<><RunsTotals rows={rows} sample={6} complete /><RoutingAnalysis rows={rows} complete /><UsageAnalysis decisionRows={rows} complete /></>);
    expect(text()).not.toMatch(/latest/i);
    expect(text()).toMatch(/all 6 served runs/);
    expect(text()).toMatch(/From all 6 served runs/);
  });

  it('L3: an incomplete read keeps calling them the latest served runs', () => {
    render(<><RunsTotals rows={rows} sample={6} complete={false} /><RoutingAnalysis rows={rows} complete={false} /><UsageAnalysis decisionRows={rows} complete={false} /></>);
    expect(text().match(/latest 6 served runs/gi)?.length).toBe(3);
  });

  it('L4: Runs totals count runs with a recorded cost in those words, not as "measured"', () => {
    render(<RunsTotals rows={rows} sample={6} complete />);
    expect(screen.getByText(/spend \(4 with a recorded cost\)/)).toBeInTheDocument();
    expect(text()).not.toMatch(/\(\d+ measured\)/);
  });

  it('L2: Runs This week names the served runs after a complete read, and the latest returned rows otherwise', () => {
    const complete = render(<RunsTable now={NOW} decisions={rows} sessions={[]} truncated={false} />);
    expect(text()).toMatch(/runs served this week · by created day \(UTC\)/);
    expect(text()).not.toMatch(/in the latest returned rows/);
    complete.unmount();
    render(<RunsTable now={NOW} decisions={rows} sessions={[]} truncated />);
    expect(text()).toMatch(/runs in the latest returned rows · by created day \(UTC\)/);
  });
});
