// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC41 (operator 2026-11-11: "verify whole dashboard all pages and improve it"; Jonah 2026-11-06 money ruling
// in src/theme/format/dashboard-currency.ts). Measured live on Usage: the Savings per day chart's table read $0.66, $0.44
// and $0.62 for Nov 8, 6 and 5 where the savings table under it read $0.6558, $0.4395 and $0.6223, the same served amounts.
// Failure mode:
//   F29  a chart's table writes an amount with another precision than the same amount beside it.
//   F29b a page that writes its own exact amounts (Delegation Evidence's $0.000628) has them cut by the table to the
//        local pages' rule ($0.0006); such a chart's table writes the page's own figure (valueFrom: 'display').
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChartTable } from '@/theme/design-system/charts/frame';
import { RankedBars } from '@/theme/design-system/charts';
import { formatDashboardUsd } from '@/theme/format';

afterEach(cleanup);

function tableCells(values: readonly number[]): string[] {
  render(<ChartTable label="Savings per day" shape="columns" columns={['Day', 'Savings']}
    rows={values.map((value, index) => [`2026-11-0${index + 1}`, value])}><div>chart</div></ChartTable>);
  fireEvent.click(screen.getByRole('button', { name: 'Show as table: Savings per day' }));
  return [...document.querySelectorAll('table tbody tr td')].map(cell => (cell.textContent ?? '').trim());
}

describe('OMN-23330 AC41: a chart table writes money by the one display rule', () => {
  it('writes 0.655882 as $0.6558 and 1.4812 as $1.48, as the savings table beside it does', () => {
    const cells = tableCells([0.655882, 1.4812]);
    expect(cells).toContain('$0.6558');
    expect(cells).toContain('$1.48');
    expect(cells).not.toContain('$0.66');
  });

  it('writes every money cell exactly as formatDashboardUsd writes its value', () => {
    const values = [0.655882, 0.439541, 1.4812, 12.3, 0];
    // Day tables list the newest day first (operator 2026-11-11), so the cells are compared as a set.
    expect([...tableCells(values)].sort()).toEqual(values.map(value => formatDashboardUsd(value)).sort());
  });

  it('keeps Delegation Evidence\'s own exact amounts in its cost table, as the page writes them', () => {
    const evidence = readFileSync(path.resolve(__dirname, '../../src/pages/DelegationEvidencePage.tsx'), 'utf8');
    const call = evidence.slice(evidence.indexOf('label="Cost against the cloud baseline"'));
    expect(call.slice(0, call.indexOf('/>'))).toMatch(/valueFrom: 'display'/);
    render(<RankedBars label="Cost against the cloud baseline" unit="USD" order="desc"
      table={{ nameHeader: 'Measure', valueHeader: 'Amount (USD)', valueFrom: 'display' }} items={[
        { key: 's', name: 'Saved', value: 0.000628, display: '$0.000628', basis: 'estimated', color: 'rgb(4, 5, 6)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Cost against the cloud baseline' }));
    expect([...document.querySelectorAll('table tbody td')].map(cell => cell.textContent)).toContain('$0.000628');
  });
});
