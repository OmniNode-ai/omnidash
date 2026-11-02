// @vitest-environment jsdom
// OMN-21970 AC3: the Runs card names its population truthfully.
// Failure modes: R1 a read that holds every served run is still captioned "Latest N returned runs";
//                R2 an incomplete read loses the "Latest" qualifier and claims to be everything.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunsKpis } from './LocalDashboardPage';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const rows = Array.from({ length: 600 }, (_, index) => ({
  correlation_id: `run-${index}`, written_at: new Date(NOW - index * 60_000).toISOString(), terminal_ok: 1, quality_gate_passed: 1,
}));

describe('OMN-21970: the Runs card caption', () => {
  it('R1: a complete read is captioned as all served runs, never the latest', () => {
    render(<RunsKpis rows={rows} now={NOW} complete />);
    expect(document.body.textContent).toMatch(/All 600 served runs/);
    expect(document.body.textContent).not.toMatch(/Latest 600 returned runs/);
  });

  it('R2: an incomplete read keeps saying its runs are the latest returned ones', () => {
    render(<RunsKpis rows={rows} now={NOW} complete={false} />);
    expect(document.body.textContent).toMatch(/Latest 600 returned runs/);
  });
});
