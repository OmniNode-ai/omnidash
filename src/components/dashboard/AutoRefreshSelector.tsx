// Header-level auto-refresh selector. Visual twin of
// `DateRangeSelector` — ghost button with icon + countdown + caret.
// Backed by `globalFilters.autoRefreshInterval` (OMN-126); writes
// flow into `useProjectionQuery` and become the global refetch
// cadence for every projection query.
//
// Presets are intentionally short — Off, 10s, 30s, 1m, 5m. The
// "active" green `Text color="ok"` cue is preserved for non-Off
// states so the header still telegraphs at-a-glance "auto-refresh
// is on."
//
// The button label is a live countdown (e.g. "27s" or "4:59") that
// ticks down each second and resets when it reaches zero. The
// countdown is a UI affordance only — independent of React Query's
// actual refetch timer — but kept aligned by resetting whenever the
// selected interval changes.
import { Fragment, useEffect, useState } from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';

interface IntervalPreset {
  label: string;
  value: number | null; // ms, or null for off
}

const PRESETS: IntervalPreset[] = [
  { label: 'Off', value: null },
  { label: '10s', value: 10_000 },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 5 * 60_000 },
];

function formatLabel(interval: number | null | undefined): string {
  if (interval === null) return 'Off';
  if (interval === undefined) return '30s'; // pre-OMN-126 visual default
  const match = PRESETS.find((p) => p.value === interval);
  if (match) return match.label;
  // Custom interval not in presets — fall back to a compact display.
  if (interval >= 60_000) return `${Math.round(interval / 60_000)}m`;
  return `${Math.round(interval / 1000)}s`;
}

/**
 * Render the live countdown shown on the selector button.
 *
 * Format:
 *   - `interval === null` → "Off"
 *   - sub-minute → `"30s"`, `"29s"`, …, `" 9s"` (NBSP-padded so the
 *     button width doesn't jitter as digits drop from two to one)
 *   - one-minute or longer → `"M:SS"` (`"5:00"`, `"4:59"`, …, `"0:01"`)
 *
 * `secondsRemaining` is null until the tick effect mounts; we fall
 * back to the static preset label to avoid a flash-of-empty-button.
 */
function formatCountdown(
  secondsRemaining: number | null,
  interval: number | null | undefined,
): string {
  if (interval === null) return 'Off';
  if (secondsRemaining === null) return formatLabel(interval);
  if (secondsRemaining < 60) {
    // U+00A0 keeps the leading space rendered in HTML so " 9s" reads
    // as 3 glyphs wide just like "30s".
    return `${String(secondsRemaining).padStart(2, ' ')}s`;
  }
  const m = Math.floor(secondsRemaining / 60);
  const s = secondsRemaining % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function AutoRefreshSelector() {
  const interval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const setInterval = useFrameStore((s) => s.setAutoRefreshInterval);
  const menu = usePositionedMenu();
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Tick the countdown once a second. Resets whenever the selected
  // `interval` changes (effect deps) — including when the user
  // picks a new preset from the menu, or switches Off ↔ on.
  //
  // Uses `window.setInterval` explicitly because `setInterval` from
  // the store is shadowed in this file; the explicit `window.` is
  // there for the timer too.
  useEffect(() => {
    if (interval === null || interval === undefined) {
      setSecondsRemaining(null);
      return;
    }
    const totalSeconds = Math.max(1, Math.round(interval / 1000));
    setSecondsRemaining(totalSeconds);
    const id = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) return totalSeconds;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [interval]);

  const isActive = interval !== null && interval !== undefined;
  const label = formatCountdown(secondsRemaining, interval);

  const apply = (value: number | null) => setInterval(value);

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        onClick={menu.open}
        aria-label="Auto-refresh"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <RefreshCw size={14} />
        <Text size="md" family="mono" color={isActive ? 'ok' : 'secondary'}>
          {label}
        </Text>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>
      {menu.isOpen && (
        <PositionedMenu
          anchor={menu.anchor}
          onClose={menu.close}
          placement="bottom-end"
          minWidth={140}
        >
          {PRESETS.map((p, i) => (
            <Fragment key={p.label}>
              {/* Separator between Off and the active intervals. */}
              {i === 1 && <MenuSeparator />}
              <MenuItem onSelect={menu.select(() => apply(p.value))}>
                {p.label}
              </MenuItem>
            </Fragment>
          ))}
        </PositionedMenu>
      )}
    </>
  );
}
