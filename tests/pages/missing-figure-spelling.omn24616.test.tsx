// @vitest-environment jsdom
// OMN-24616 AC6, the third bounded re-review of #518 (at 9f7cc795): three places still wrote a missing FIGURE as "Not
// recorded". Ruling (Lakshman 2026-11-17): a missing figure reads "Not measured"; only a missing label reads "Not
// recorded".
// Failure modes:
//   M1  a workflow step with no duration or confidence (figures) lists them after "Not recorded";
//   M2  the Quality score comparison's caption writes a missing score as "Not recorded" while its bar says Not measured;
//   M3  a chart table's figure-column tip explains "Not recorded" while its empty cells read Not measured.
// Each test has a positive control, so a check that matches nothing cannot pass.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunTimeline } from '@/pages/LocalDashboardPage';
import { WorkflowDecisionCharts } from '@/pages/local/workflow-analysis';
import { ChartTable } from '@/theme/design-system/charts/frame';
import type { Run } from '@/pages/local/page-shared';

afterEach(cleanup);

describe('OMN-24616 AC6: a missing figure reads Not measured, a missing label Not recorded', () => {
  it('M1: a step names a missing duration and confidence as not measured, and its start and reason as not recorded', () => {
    const { container } = render(<RunTimeline steps={[{ step_sequence: 1, step_kind: 'routing_decision', outcome: 'succeeded' }]} />);
    const said = container.querySelector('[data-not-recorded]')?.textContent ?? '';
    expect(said).toMatch(/Not recorded: start, reason, candidates/);
    expect(said).toMatch(/Not measured: duration, confidence/);
    expect(said).not.toMatch(/Not recorded:[^·]*\b(?:duration|confidence)\b/);
  });

  it('M2: the quality caption writes a missing score as Not measured, as its bar does', () => {
    render(<WorkflowDecisionCharts decision={{ correlation_id: 'r1', actual_score: null, required_bar: 0.7 } as unknown as Run}
      show="comparisons">{null}</WorkflowDecisionCharts>);
    const row = screen.getByRole('button', { name: /Actual score/ });
    expect(row.textContent, 'positive control: the bar').toContain('Not measured');
    fireEvent.click(row);
    expect(screen.getByRole('status').textContent).toBe('Actual score: Not measured');
  });

  it('M3: a figure column tip explains the spelling its empty cells use', () => {
    render(<ChartTable label="Tokens per day" shape="columns" columns={['Day', 'Tokens']} rows={[['2026-11-01', null]]}>
      <div>chart</div></ChartTable>);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Tokens per day' }));
    const cells = [...document.querySelectorAll('table tbody td')].map(cell => (cell.textContent ?? '').trim());
    expect(cells, 'positive control: the empty cell').toContain('Not measured');
    const heads = [...document.querySelectorAll('.ds-chart-table-head')] as HTMLElement[];
    fireEvent.focus(heads[1]!);
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('"Not measured" means no value was served for that row.');
    expect(tip).not.toContain('Not recorded');
  });
});
