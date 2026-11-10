// @vitest-environment jsdom
// OMN-23330 AC10 (the operator's 2026-11-09 review of Usage): Usage shows dates in the same short format as the other
// pages and lists model and tier legends on separate rows. Measured live 2026-11-10: Usage's Savings per day table wrote
// each day as served ("2026-10-12") while every other page writes "Oct 12"; on Tokens by model the tier legend sat in
// the same wrapping row as the series legend.
// Failure modes:
//   U1  a Usage day reads in ISO form, or the served day is lost (it stays as the cell's title);
//   U2  a grouped-bar chart's series legend and tier legend share one row.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeteringDaySeries } from '@/components/dashboard/usage/SavingsSeriesWidget';

const ROOT = path.resolve(__dirname, '../../..');
const ROWS = ['2026-10-12', '2026-10-13'].map((day, index) => ({ window_kind: 'day', window_start: day, as_of: '2026-10-14T00:00:00Z',
  baseline_model: 'baseline-a', baseline_state: 'resolved', savings_usd: ['0.40', '1.10'][index], runs_total: [3, 5][index] }));

describe('OMN-23330 AC10: Usage reads like the other pages', () => {
  it('U1: a Savings per day row names its day as "Oct 12", the served day kept as its title', () => {
    render(<MeteringDaySeries rows={ROWS} />);
    const cells = screen.getAllByRole('cell').filter((cell) => cell.getAttribute('data-label') === 'Day');
    expect(cells.map((cell) => cell.textContent)).toEqual(expect.arrayContaining(['Oct 12', 'Oct 13']));
    expect(cells.map((cell) => cell.getAttribute('title'))).toEqual(expect.arrayContaining(['2026-10-12', '2026-10-13']));
    expect(within(screen.getByRole('table')).queryByText(/^20\d\d-\d\d-\d\d$/)).toBeNull();
  });

  it('U2: a grouped-bar chart lists its series legend and its tier legend on separate rows', () => {
    const css = readFileSync(path.join(ROOT, 'src/styles/seven-page-design.css'), 'utf8');
    const decls: Record<string, string> = {};
    postcss.parse(css).walkRules((rule) => {
      if (rule.selector.trim() !== '.local-dashboard-page .gdb-legends') return;
      rule.walkDecls((decl) => { decls[decl.prop] = decl.value; });
    });
    expect(decls.display).toBe('flex');
    expect(decls['flex-direction']).toBe('column');
  });
});
