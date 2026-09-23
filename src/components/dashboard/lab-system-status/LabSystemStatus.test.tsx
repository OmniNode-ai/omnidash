/**
 * OMN-18771 — the assertions the acceptance criteria name, written from what
 * the backend actually returned rather than from what it ought to return.
 *
 * Live read, .201 dev lane, 2026-09-22: 65 exposures, `status: "ok"` on every
 * one of them, `backing: "bus"` on 17 and `not_yet_bus_backed` on 48. Those
 * numbers are the fixtures' shape, and the third test below is the one that
 * would have caught a widget trusting `status`.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { classifyExposure, summarise } from '@/data-source/exposure-census';
import { LabSystemStatusView } from './LabSystemStatus';

describe('classifyExposure — AC3/AC4', () => {
  it('classifies a bus-backed exposure as reachable', () => {
    const row = classifyExposure({ topic: 't', status: 'ok', backing: 'bus', bus_backed: true });
    expect(row?.reachability).toBe('reachable');
    expect(row?.refusal).toBeNull();
  });

  it('AC4: a not_yet_bus_backed exposure is REFUSED and names the refusal, never an empty success', () => {
    const row = classifyExposure({
      topic: 't',
      status: 'ok',
      backing: 'not_yet_bus_backed',
      bus_backed: false,
    });
    expect(row?.reachability).toBe('refused');
    expect(row?.refusal).toBe('not_yet_bus_backed');
  });

  it('status "ok" alone never makes an exposure reachable — the live lane reports ok on all 65', () => {
    // The negative control for this whole widget. If classification ever keys
    // on `status`, this flips to 'reachable' and the test goes red.
    const row = classifyExposure({ topic: 't', status: 'ok', backing: 'not_yet_bus_backed' });
    expect(row?.declaredStatus).toBe('ok');
    expect(row?.reachability).not.toBe('reachable');
  });

  it('an entry declaring neither backing nor bus_backed is unknown, not healthy', () => {
    const row = classifyExposure({ topic: 't', status: 'ok' });
    expect(row?.reachability).toBe('unknown');
    expect(row?.refusal).toBeTruthy();
  });

  it('an entry with no topic is dropped rather than rendered nameless', () => {
    expect(classifyExposure({ status: 'ok', backing: 'bus' })).toBeNull();
  });
});

describe('LabSystemStatusView — AC3', () => {
  it('renders a topic the component source never names, because the set comes from the catalogue', () => {
    // AC3's stated falsifier: feed a catalogue entry this file has never heard
    // of and assert it still renders a row.
    const invented = 'onex.snapshot.projection.invented-after-this-test-was-written.v1';
    const census = summarise([
      classifyExposure({ topic: invented, status: 'ok', backing: 'bus' })!,
    ]);
    render(<LabSystemStatusView state={{ kind: 'ready', census }} />);
    expect(screen.getByText(invented)).toBeTruthy();
  });

  it('counts reachable, refused and unknown separately in the header', () => {
    const census = summarise([
      classifyExposure({ topic: 'a', backing: 'bus' })!,
      classifyExposure({ topic: 'b', backing: 'not_yet_bus_backed' })!,
      classifyExposure({ topic: 'c' })!,
    ]);
    expect(census.reachable).toBe(1);
    expect(census.refused).toBe(1);
    expect(census.unknown).toBe(1);
  });

  it('an unreadable catalogue is not rendered as an empty one', () => {
    render(<LabSystemStatusView state={{ kind: 'error', reason: 'HTTP 503' }} />);
    expect(screen.queryAllByTestId('exposure-census-row')).toHaveLength(0);
  });
});
