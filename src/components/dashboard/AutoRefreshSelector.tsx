// Header-level auto-refresh selector. Visual twin of
// `DateRangeSelector` — ghost button with icon + interval + caret.
// Backed by `globalFilters.autoRefreshInterval` (OMN-126); writes
// flow into `useProjectionQuery` and become the global refetch
// cadence for every projection query.
//
// Presets are intentionally short — Off, 10s, 30s, 1m, 5m. The
// "active" green `Text color="ok"` cue is preserved for non-Off
// states so the header still telegraphs at-a-glance "auto-refresh
// is on."
import { Fragment } from 'react';
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

export function AutoRefreshSelector() {
  const interval = useFrameStore((s) => s.globalFilters.autoRefreshInterval);
  const setInterval = useFrameStore((s) => s.setAutoRefreshInterval);
  const menu = usePositionedMenu();

  const isActive = interval !== null && interval !== undefined;
  const label = formatLabel(interval);

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
