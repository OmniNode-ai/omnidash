// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of the live Overview, 2026-11-11: "what is this Not available yet: daily run
// totals. - if not needed remove it"). Overview's activity panel binds delegation.daily.v1 as a lookup; a local install
// does not serve it, and the panel printed "Not available yet: daily run totals." although it draws the same days from
// metering-summary.v1's day totals without it (page-tables.tsx, OMN-22168), so the line named nothing the reader lacks.
// Failure modes:
//   F1  a lookup the panel draws without (it has a fallback) is still announced as not available;
//   F2  a lookup with no fallback that is not served is no longer announced (the reader would not know it is missing);
//   F3  daily run totals are hidden although their fallback is not served either: the panel then draws only the runs it
//       read, and OMN-21970 names the missing totals (LocalDashboardPage.live.test.tsx keeps that case).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WidgetReadState } from '@/pages/local/page-tables';

afterEach(cleanup);
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const DAILY = 'onex.snapshot.projection.delegation.daily.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';
const METERING = 'onex.snapshot.projection.metering-summary.v1';
const NOW = Date.parse('2026-11-11T06:00:00Z');
const served = (topic: string) => ({ topic, rows: [], readAt: '2026-11-11T05:59:59Z' });
const notServed = (topic: string) => ({ topic, rows: [], readAt: null, failure: { kind: 'not-served', message: `${topic} not served` } });

function panel(lookups: string[], others: object[] = []) {
  const component = {
    component_id: 'overview-insights', component_kind: 'table', title: 'Trends and breakdowns',
    data_bindings: [DECISIONS, ...lookups].map((topic, index) => ({ binding_id: `b${index}`, projection_topic: topic })),
  };
  render(<WidgetReadState component={component as never} snapshots={[served(DECISIONS), ...lookups.map(notServed), ...others] as never} now={NOW} interval={30} />);
}

describe('OMN-23330: a lookup the panel draws without is not announced', () => {
  it('F1: daily run totals, which the panel draws from the served metering day totals, are not announced', () => {
    panel([DAILY], [served(METERING)]);
    expect(screen.queryByText(/daily run totals/)).toBeNull();
  });

  it('F2: a lookup with no fallback is still announced', () => {
    panel([SAVINGS]);
    expect(screen.getByText(/^Not available yet/)).toBeTruthy();
  });

  it('F3: with the metering day totals not served either, the missing daily run totals are still named', () => {
    panel([DAILY], [notServed(METERING)]);
    expect(screen.getByText(/Not available yet: daily run totals/)).toBeTruthy();
  });
});
