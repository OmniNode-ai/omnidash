import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HonestyStateBadge, deriveHonestyState } from './HonestyStateBadge';
import type { DelegationEvidenceSnapshot } from './delegation-control-plane.types';

function badge(state: Parameters<typeof HonestyStateBadge>[0]['state']) {
  return render(<HonestyStateBadge state={state} />);
}

function makeSnapshot(overrides: Partial<DelegationEvidenceSnapshot>): DelegationEvidenceSnapshot {
  return {
    summary: null,
    savings: null,
    modelRouting: null,
    qualityGate: null,
    tokenUsage: null,
    decisions: [],
    runs: [],
    probes: [],
    hasAnyData: false,
    isLoading: false,
    primaryError: null,
    ...overrides,
  };
}

function probeBase(overrides: object = {}) {
  return {
    key: 'test-probe',
    label: 'Test',
    topic: 'onex.evt.test.v1',
    rowCount: 5,
    capturedAt: '2026-05-22T10:00:00Z',
    provisioned: true as boolean | null,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

describe('HonestyStateBadge — render tests', () => {
  it('renders empty state with accessible role', () => {
    badge('empty');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Empty');
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders fixture state', () => {
    badge('fixture');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Fixture');
    expect(screen.getByText('Fixture')).toBeInTheDocument();
  });

  it('renders stale state', () => {
    badge('stale');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Stale');
    expect(screen.getByText('Stale')).toBeInTheDocument();
  });

  it('renders degraded state', () => {
    badge('degraded');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Degraded');
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('renders failure state', () => {
    badge('failure');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Failure');
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });

  it('renders live state', () => {
    badge('live');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Live');
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('accepts a custom label override', () => {
    render(<HonestyStateBadge state="live" label="Verified" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Data honesty: Verified');
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });
});

describe('deriveHonestyState', () => {
  it('returns failure when primaryError is set', () => {
    const snap = makeSnapshot({ primaryError: new Error('fetch failed'), hasAnyData: true });
    expect(deriveHonestyState(snap)).toBe('failure');
  });

  it('returns empty when no data and not loading', () => {
    const snap = makeSnapshot({ hasAnyData: false, isLoading: false });
    expect(deriveHonestyState(snap)).toBe('empty');
  });

  it('returns empty when still loading with no data', () => {
    const snap = makeSnapshot({ hasAnyData: false, isLoading: true });
    expect(deriveHonestyState(snap)).toBe('empty');
  });

  it('returns fixture when all probes have provisioned===null', () => {
    const snap = makeSnapshot({
      hasAnyData: true,
      probes: [probeBase({ provisioned: null }), probeBase({ provisioned: null })],
    });
    expect(deriveHonestyState(snap)).toBe('fixture');
  });

  it('returns stale when a provisioned probe lacks capturedAt', () => {
    const snap = makeSnapshot({
      hasAnyData: true,
      probes: [
        probeBase({ provisioned: true, capturedAt: undefined }),
        probeBase({ provisioned: true }),
      ],
    });
    expect(deriveHonestyState(snap)).toBe('stale');
  });

  it('returns degraded when some probes are unprovisioned', () => {
    const snap = makeSnapshot({
      hasAnyData: true,
      probes: [probeBase({ provisioned: true }), probeBase({ provisioned: false })],
    });
    expect(deriveHonestyState(snap)).toBe('degraded');
  });

  it('returns live when all probes are provisioned with capturedAt', () => {
    const snap = makeSnapshot({
      hasAnyData: true,
      probes: [probeBase({ provisioned: true }), probeBase({ provisioned: true })],
    });
    expect(deriveHonestyState(snap)).toBe('live');
  });
});
