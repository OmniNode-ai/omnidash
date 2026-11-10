// @vitest-environment jsdom
// OMN-22168: the run table defects Jonah's review found on 2026-11-06, each beside a control that would pass the defect.
//   J1 money is cut, never rounded up: two decimals from $1, up to four under $1, and a non-zero amount never shows $0
//      ("$0.30 when it is $0.2999 overstates the cost"; dev printed every served digit).
//   J2 every run row shows its date beside its clock ("Only the first time column has a date"; dev wrote the day on the
//      first row of each day only), while a rule above a day's first run still groups the days.
// J3, a long model name on one line at 1440px, is measured on the page in
// tests/e2e/design-system-dashboard-polish.omn22168.spec.ts L12.
// Found on the live lab dashboard, 2026-11-07 (Lakshman: "fix it"):
//   J4 the rows run newest first by the time the Time column shows (a run created Nov 5 15:32 but written Nov 7 05:47
//      was listed among the Nov 7 runs, under a day rule of its own).
//   J5 an unmeasured saving reads "Not measured" with its reason as the tooltip (it wrapped to three lines); the reason
//      stays in the cell's text. Its one line at 1440px is measured in L13.
//   J6 the Model column fits the longest model name on the page, so short names leave no gap before Tokens.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDashboardUsd } from '@/theme/format';
import { RunsTable, runModelColumnWidth } from '@/pages/LocalDashboardPage';

describe('J1: dashboard money is cut, never rounded up', () => {
  it.each([
    [1, '$1.00'],
    [1.999, '$1.99'],
    [12.349, '$12.34'],
    [1234.5, '$1,234.50'],
    [0.5, '$0.50'],
    [0.12345, '$0.1234'],
    [0.99999, '$0.9999'],
    [0.0012, '$0.0012'],
    [-12.349, '-$12.34'],
    ['0.12345', '$0.1234'],
  ] as const)('%s reads %s', (value, shown) => {
    expect(formatDashboardUsd(value)).toBe(shown);
  });

  it('a non-zero amount below $0.0001 shows $0.0001, never $0', () => {
    expect(formatDashboardUsd(0.00009)).toBe('$0.0001');
    expect(formatDashboardUsd(0)).toBe('$0.00');
  });

  it('control: rounding would have shown each of these higher', () => {
    for (const [value, rounded] of [[1.999, '$2.00'], [0.99999, '$1.00'], [12.349, '$12.35']] as const) {
      expect(formatDashboardUsd(value)).not.toBe(rounded);
    }
  });
});

const NOW = Date.parse('2026-11-06T12:00:00Z');

function timeCellsOf() {
  const table = screen.getAllByRole('table').find(t => within(t).queryAllByRole('columnheader').some(h => h.textContent?.trim() === 'Time'))!;
  const index = within(table).getAllByRole('columnheader').findIndex(h => h.textContent?.trim() === 'Time');
  const rows = within(table).getAllByRole('row').slice(1);
  return { rows, cells: rows.map(row => within(row).getAllByRole('cell')[index]!) };
}
function run(id: string, at: string): Record<string, unknown> {
  return {
    correlation_id: id, created_at: at, written_at: at, model_name: 'model-a', quality_gate_passed: true,
    quality_gate_detail: 'completed', latency_ms: 900, tokens_input: 200, tokens_output: 20,
  };
}

describe('J2: every run row shows its date', () => {
  // Three runs on Nov 6 and two on Nov 5, newest first.
  const decisions = [
    run('j2-a', '2026-11-06T10:05:00Z'), run('j2-b', '2026-11-06T09:05:00Z'), run('j2-c', '2026-11-06T08:05:00Z'),
    run('j2-d', '2026-11-05T22:05:00Z'), run('j2-e', '2026-11-05T21:05:00Z'),
  ];

  it('each row writes its day beside its clock', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { cells } = timeCellsOf();
    expect(cells).toHaveLength(5);
    const days = cells.map(cell => cell.querySelector('.local-run-day')?.textContent ?? null);
    expect(days).toEqual(['Nov 6', 'Nov 6', 'Nov 6', 'Nov 5', 'Nov 5']);
    for (const cell of cells) expect(cell.querySelector('.local-run-clock')?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('control: the rule above a day still marks only each day\'s first run', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { rows } = timeCellsOf();
    expect(rows.map(row => row.hasAttribute('data-day-start'))).toEqual([true, false, false, true, false]);
  });
});

describe('J4: rows run by the time they show', () => {
  // r-late ran on Nov 5 but its row was written on Nov 6 after the others, so written_at puts it first.
  const decisions = [
    { ...run('r-late', '2026-11-05T15:32:00Z'), written_at: '2026-11-06T11:00:00Z' },
    run('r-a', '2026-11-06T10:05:00Z'), run('r-b', '2026-11-06T09:05:00Z'), run('r-c', '2026-11-05T08:05:00Z'),
  ];

  it('orders rows newest first by created_at, and the late-written run sits in its own day', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { cells } = timeCellsOf();
    expect(cells.map(cell => [cell.querySelector('.local-run-day')?.textContent, cell.querySelector('.local-run-clock')?.textContent].join(' '))).toEqual(['Nov 6 10:05', 'Nov 6 09:05', 'Nov 5 15:32', 'Nov 5 08:05']);
  });

  it('control: each day still has exactly one rule, above its first run', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const { rows } = timeCellsOf();
    expect(rows.map(row => row.hasAttribute('data-day-start'))).toEqual([true, false, true, false]);
  });
});

describe('J5: an unmeasured saving is one short line', () => {
  const decisions = [
    { ...run('s-none', '2026-11-06T10:05:00Z'), savings_measurement: 'unknown_tokens', modelled_savings_usd: null, savings_baseline_model: 'claude-sonnet-5-5' },
    { ...run('s-some', '2026-11-06T09:05:00Z'), savings_measurement: 'measured', modelled_savings_usd: '0.0213', savings_baseline_model: 'claude-sonnet-5-5' },
  ];

  function savingCells() {
    const table = screen.getAllByRole('table').find(t => within(t).queryAllByRole('columnheader').some(h => h.textContent?.trim() === 'Time'))!;
    return [...table.querySelectorAll<HTMLElement>('tbody td[data-label^="Saving"]')];
  }

  it('shows "Not measured", gives the reason as its tooltip, and keeps the reason in its text', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const [none] = savingCells();
    const visible = [...none!.childNodes].filter(node => !(node instanceof HTMLElement && node.classList.contains('local-visually-hidden')))
      .map(node => node.textContent).join('');
    expect(visible).toBe('Not measured');
    expect(none!.title).toBe('Not measured: tokens not recorded');
    expect(none!.textContent).toBe('Not measured: tokens not recorded');
    expect(none!.hasAttribute('data-unmeasured')).toBe(true);
  });

  it('control: a measured saving shows its figure, with no tooltip and no muting', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const [, some] = savingCells();
    expect(some!.textContent).toBe('$0.0213');
    expect(some!.title).toBe('');
    expect(some!.hasAttribute('data-unmeasured')).toBe(false);
  });
});

// J6, Lakshman 2026-11-07 ("why gap?"): the Model column fits the longest model name on the page instead of a fixed
// width, so a page of short names leaves no gap before Tokens. Lakshman 2026-11-08 ("wrap it and save column space"):
// the column stops at 200px, the Backend column's width, and a longer name wraps at its joins (/ : _ -) instead.
describe('J6: the Model column fits the page of runs it shows', () => {
  function modelHeaderWidth(decisions: Record<string, unknown>[]) {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const table = screen.getAllByRole('table').find(t => within(t).queryAllByRole('columnheader').some(h => h.textContent?.trim() === 'Time'))!;
    return Number.parseFloat((table.querySelector<HTMLElement>('th[data-column="model"]')!).style.width);
  }

  it('a page of short names gets a narrow column, never under 160px', () => {
    expect(runModelColumnWidth([{ model_name: 'Qwen3.8-27B' }])).toBe(160);
    expect(runModelColumnWidth([{ model_name: 'Qwen3.8-27B-Instruct' }])).toBe(Math.ceil(20 * 7.8) + 24);
    expect(modelHeaderWidth([{ ...run('w-a', '2026-11-06T10:05:00Z'), model_name: 'Qwen3.8-27B' }])).toBe(160);
  });

  it('a requested model written above the answer counts toward the width', () => {
    expect(runModelColumnWidth([{ model_name: 'm', requested_model: 'Qwen3.8-27B-Instruct' }])).toBe(Math.ceil(22 * 7.8) + 24);
    expect(runModelColumnWidth([{ model_name: 'same', requested_model: 'same' }])).toBe(160);
  });

  it('a name longer than 200px of column wraps instead of widening it', () => {
    expect(runModelColumnWidth([{ model_name: 'nvidia/nemotron-3-ultra-550b-a55b:free' }])).toBe(200);
    expect(runModelColumnWidth([{ model_name: 'cohere/north-mini-code:free' }])).toBe(200);
    expect(runModelColumnWidth([{ model_name: 'm', requested_model: 'cohere/north-mini-code:free' }])).toBe(200);
    expect(runModelColumnWidth([{ model_name: 'x'.repeat(80) }])).toBe(200);
    expect(modelHeaderWidth([
      { ...run('w-b', '2026-11-06T10:05:00Z'), model_name: 'Qwen3.8-27B' },
      { ...run('w-c', '2026-11-06T09:05:00Z'), model_name: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
    ])).toBe(200);
  });

  it('a wrapped name breaks only at its joins: the model button carries a break after each / : _ -', () => {
    render(<RunsTable now={NOW} decisions={[{ ...run('w-d', '2026-11-06T10:05:00Z'), model_name: 'nvidia/nemotron-3-ultra-550b-a55b:free' }]} sessions={[]} />);
    const button = document.querySelector<HTMLElement>('td[data-label="Model"] .local-run-model')!;
    expect(button.textContent).toBe('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(button.querySelectorAll('wbr')).toHaveLength(6);
  });
});
