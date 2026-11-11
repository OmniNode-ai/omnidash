// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator 2026-11-11: "in all table date latest on top"). A live scan of every data table on the six
// pages found one listing its days oldest first: Usage's "Savings per day vs <baseline>" (Sep 29 at the top of page 1).
// Failure modes:
//   D1  the savings days table's first page starts at the oldest day, so today is pages away;
//   D2  days are reordered when they are not calendar days (the served order is all a reader can go by then).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MeteringDaySeries } from '@/components/dashboard/usage/SavingsSeriesWidget';

afterEach(cleanup);
const day = (start: string) => ({ window_kind: 'day', window_start: start, baseline_model: 'b', baseline_state: 'resolved', savings_usd: '1.25', runs_total: 3 });

describe('OMN-23330: the savings days table lists the newest day first', () => {
  it('D1: the first row is the latest served day', () => {
    render(<MeteringDaySeries rows={['2026-11-09', '2026-11-10', '2026-11-11'].map(day)} />);
    const rows = within(screen.getByRole('table', { name: 'Savings per day vs b' })).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).getAllByRole('cell')[0]!.textContent)).toEqual(['Nov 11', 'Nov 10', 'Nov 9']);
  });

  it('D2: rows that are not calendar days keep the served order', () => {
    render(<MeteringDaySeries rows={['day-1', 'day-2'].map(day)} />);
    const rows = within(screen.getByRole('table', { name: 'Savings per day vs b' })).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).getAllByRole('cell')[0]!.textContent)).toEqual(['day-1', 'day-2']);
  });
});
