/**
 * HonestyStateBadge — 6 visually distinct states for delegation data provenance.
 *
 * Each state maps to a unique color + icon combination so no two states are
 * confusable at a glance. The `fixture` state deliberately uses a purple tint
 * (orchestrator role color) that clashes with the green `live` state.
 *
 * Derivation: import `deriveHonestyState` to compute the state from a
 * `DelegationEvidenceSnapshot`.
 */
import { Text } from '@/components/ui/typography';
import type { DelegationEvidenceSnapshot } from './delegation-control-plane.types';

export type HonestyState = 'empty' | 'fixture' | 'stale' | 'degraded' | 'failure' | 'live';

interface HonestyStateBadgeProps {
  state: HonestyState;
  /** Optional override label; defaults to the state name. */
  label?: string;
}

const STATE_CONFIG: Record<
  HonestyState,
  { icon: string; bg: string; border: string; textColor: string; defaultLabel: string }
> = {
  live: {
    icon: '●',
    bg: 'var(--compute-soft)',
    border: 'var(--compute)',
    textColor: 'var(--compute-ink)',
    defaultLabel: 'Live',
  },
  fixture: {
    icon: '◆',
    bg: 'var(--orchestrator-soft)',
    border: 'var(--orchestrator)',
    textColor: 'var(--orchestrator-ink)',
    defaultLabel: 'Fixture',
  },
  stale: {
    icon: '◑',
    bg: 'var(--warn-soft)',
    border: 'var(--warn)',
    textColor: 'var(--warn)',
    defaultLabel: 'Stale',
  },
  degraded: {
    icon: '▲',
    bg: 'var(--reducer-soft)',
    border: 'var(--reducer)',
    textColor: 'var(--reducer-ink)',
    defaultLabel: 'Degraded',
  },
  failure: {
    icon: '✕',
    bg: 'var(--bad-soft)',
    border: 'var(--bad)',
    textColor: 'var(--bad)',
    defaultLabel: 'Failure',
  },
  empty: {
    icon: '○',
    bg: 'var(--bg-sunken)',
    border: 'var(--line)',
    textColor: 'var(--ink-4)',
    defaultLabel: 'Empty',
  },
};

/**
 * Derives the honesty state from a live snapshot.
 *
 * Priority (high → low):
 *   failure  — primaryError is set (hard failure)
 *   empty    — no loading, no data
 *   fixture  — all rows are synthetic/fixture (provisioned===null means no real topic)
 *   stale    — data exists but >1 probe has no capturedAt or is unprovisioned
 *   degraded — some probes are unprovisioned but data exists
 *   live     — all probes provisioned, data present
 */
export function deriveHonestyState(snapshot: DelegationEvidenceSnapshot): HonestyState {
  if (snapshot.primaryError) return 'failure';
  if (!snapshot.isLoading && !snapshot.hasAnyData) return 'empty';
  if (snapshot.isLoading && !snapshot.hasAnyData) return 'empty';

  const isAllFixture = snapshot.probes.length > 0 && snapshot.probes.every((p) => p.provisioned === null);
  if (isAllFixture) return 'fixture';

  const unprovisionedCount = snapshot.probes.filter((p) => p.provisioned === false).length;
  const staleCount = snapshot.probes.filter((p) => p.provisioned !== false && !p.capturedAt).length;

  if (staleCount > 0) return 'stale';
  if (unprovisionedCount === snapshot.probes.length) return 'fixture';
  if (unprovisionedCount > 0) return 'degraded';

  return 'live';
}

export function HonestyStateBadge({ state, label }: HonestyStateBadgeProps) {
  const cfg = STATE_CONFIG[state];
  const displayLabel = label ?? cfg.defaultLabel;

  return (
    <span
      aria-label={`Data honesty: ${displayLabel}`}
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 9px',
        borderRadius: 999,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.textColor,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <Text as="span" size="xs" weight="semibold" color="inherit" aria-hidden={true}>
        {cfg.icon}
      </Text>
      <Text as="span" size="xs" weight="semibold" color="inherit">
        {displayLabel}
      </Text>
    </span>
  );
}
