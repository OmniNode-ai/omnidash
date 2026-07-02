/**
 * WS3 acceptance tests — OMN-12943.
 * Contractor plan (line 249): "Unit tests cover populated/stale/empty/degraded header states."
 *
 * Covers:
 *   derivePageBadge() — all five output states (loading, no-data, degraded, live, stale)
 *   FreshnessChip     — renders the correct label for each badge state
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { derivePageBadge, FreshnessChip } from './primitives';
import type { ProjectionSnapshot } from './primitives';

// ── derivePageBadge ───────────────────────────────────────────────────────────

describe('derivePageBadge', () => {
  it('returns loading when no snapshots have settled yet', () => {
    expect(derivePageBadge([])).toBe('loading');
  });

  it('returns no-data when all projections have zero rows and none degraded', () => {
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 0, freshness: 'fresh' },
      { rowCount: 0, freshness: 'unknown' },
    ];
    expect(derivePageBadge(snapshots)).toBe('no-data');
  });

  it('returns degraded when all projections have zero rows and at least one is degraded', () => {
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 0, freshness: 'degraded' },
      { rowCount: 0, freshness: 'unknown' },
    ];
    expect(derivePageBadge(snapshots)).toBe('degraded');
  });

  it('returns live when rows exist and at least one projection is fresh', () => {
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 42, freshness: 'fresh' },
      { rowCount: 10, freshness: 'stale' },
    ];
    expect(derivePageBadge(snapshots)).toBe('live');
  });

  it('returns stale when rows exist but no projection is fresh', () => {
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 5, freshness: 'stale' },
      { rowCount: 3, freshness: 'unknown' },
    ];
    expect(derivePageBadge(snapshots)).toBe('stale');
  });

  it('returns live when only some projections have rows (total > 0)', () => {
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 0, freshness: 'stale' },
      { rowCount: 1, freshness: 'fresh' },
    ];
    expect(derivePageBadge(snapshots)).toBe('live');
  });

  it('returns stale when rows exist and freshness is degraded (not all-zero)', () => {
    // degraded only promotes to PageBadgeState 'degraded' when rows === 0;
    // when rows > 0, it falls through to the stale path.
    const snapshots: ProjectionSnapshot[] = [
      { rowCount: 8, freshness: 'degraded' },
    ];
    expect(derivePageBadge(snapshots)).toBe('stale');
  });
});

// ── FreshnessChip ─────────────────────────────────────────────────────────────

describe('FreshnessChip', () => {
  it('renders "live" label for live state', () => {
    render(<FreshnessChip state="live" />);
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('renders "no data" label for no-data state', () => {
    render(<FreshnessChip state="no-data" />);
    expect(screen.getByText('no data')).toBeInTheDocument();
  });

  it('renders "degraded" label for degraded state', () => {
    render(<FreshnessChip state="degraded" />);
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });

  it('renders "stale" label for stale state', () => {
    render(<FreshnessChip state="stale" />);
    expect(screen.getByText('stale')).toBeInTheDocument();
  });

  it('renders "stale" label for loading state (chip falls through to stale path)', () => {
    render(<FreshnessChip state="loading" />);
    expect(screen.getByText('stale')).toBeInTheDocument();
  });

  it('includes latestEventAt in the title attribute when stale', () => {
    const { container } = render(
      <FreshnessChip state="stale" latestEventAt="2026-06-30T10:00:00Z" />,
    );
    const chip = container.querySelector('.live-pill');
    expect(chip?.getAttribute('title')).toMatch(/2026-06-30 10:00:00/);
  });

  it('shows plain "stale" title when latestEventAt is not provided', () => {
    const { container } = render(<FreshnessChip state="stale" />);
    const chip = container.querySelector('.live-pill');
    expect(chip?.getAttribute('title')).toBe('stale');
  });
});
