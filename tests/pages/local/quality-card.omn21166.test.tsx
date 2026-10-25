// @vitest-environment jsdom
// OMN-21166 (Lakshman, live review 2026-10-25: "keep 5 cards in top and add text Delegation Quality"): the fifth
// headline card. Failure modes, each with a test below:
//   Q1  the pass rate is recomputed from the counts instead of read from the served overall_pass_rate;
//   Q2  the card does not say that the window above leaves it all time, beside four cards that do follow it;
//   Q3  an unserved rate or count is drawn as 0 or 0% instead of Not measured / Not recorded.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QualityCard } from '@/pages/LocalDashboardPage';

afterEach(cleanup);

describe('QualityCard', () => {
  it('Q1, Q2: the served rate, its counts and the all-time note', () => {
    // 0.9 deliberately disagrees with 7 of 10: the served rate is the figure.
    const { container } = render(<QualityCard row={{ overall_pass_rate: 0.9, total_passed: 7, total_checks: 10, total_failed: 3 }} />);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('90.0%');
    expect(container.textContent).toContain('7 of 10 runs passed the quality gate');
    expect(container.textContent).toContain('All time: the window above does not change this figure');
  });

  it('Q3: nothing served is Not measured, and a missing count is Not recorded', () => {
    const empty = render(<QualityCard row={{ overall_pass_rate: null }} />);
    expect(empty.container.textContent).toBe('Not measured');
    cleanup();
    const partial = render(<QualityCard row={{ overall_pass_rate: 0.5, total_passed: 1, total_checks: null, total_failed: 1 }} />);
    expect(partial.container.textContent).toContain('1 of Not recorded runs passed the quality gate');
  });
});
