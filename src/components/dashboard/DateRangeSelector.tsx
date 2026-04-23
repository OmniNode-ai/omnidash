// Dashboard-level time range selector. Lives in the header next to the
// mode-dependent action buttons (Add Widget / Save / Discard). Writes
// through to the store's `globalFilters.timeRange`; widgets that declare
// `supports_time_range: true` subscribe to the same state and filter
// their data accordingly.
//
// Design notes:
//   - Preset-only for v1 (Last 1h / 6h / 24h / 7d / 30d + "All time").
//     Custom start/end is deferrable; presets cover the common case and
//     avoid shipping a date-picker dependency.
//   - Preset selection resolves to absolute ISO timestamps at click-time
//     and stores those in the range. The window doesn't auto-advance
//     with auto-refresh — the user re-picks to refresh. This keeps the
//     model simple and avoids per-frame re-resolution churn on widgets
//     whose useMemo deps would otherwise invalidate every tick.
//   - On first mount, if the store has no time range yet, we seed the
//     default preset (Last 24h). Makes fresh dashboards land on a
//     sensible window rather than "show me 48h of synthetic fixtures".
import { useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { useFrameStore } from '@/store/store';
import {
  TIME_RANGE_PRESETS,
  DEFAULT_TIME_RANGE_PRESET,
  rangeFromPreset,
  type TimeRangePreset,
} from '@/hooks/useTimeRange';

export function DateRangeSelector() {
  const range = useFrameStore((s) => s.globalFilters.timeRange);
  const setTimeRange = useFrameStore((s) => s.setTimeRange);
  const menu = usePositionedMenu();

  // Seed the default preset on first mount if the store is empty.
  useEffect(() => {
    if (!useFrameStore.getState().globalFilters.timeRange) {
      setTimeRange(rangeFromPreset(DEFAULT_TIME_RANGE_PRESET));
    }
  }, [setTimeRange]);

  const applyPreset = (preset: TimeRangePreset) => {
    setTimeRange(rangeFromPreset(preset));
  };

  const clearRange = () => setTimeRange(undefined);

  let label: string;
  if (!range) {
    label = 'All time';
  } else if (range.label) {
    label = range.label;
  } else {
    // Custom range — format compactly.
    const s = new Date(range.start);
    const e = new Date(range.end);
    const fmt = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    label = `${fmt(s)} – ${fmt(e)}`;
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        onClick={menu.open}
        aria-label="Time range"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Calendar size={14} />
        <span>{label}</span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>
      {menu.isOpen && (
        <PositionedMenu anchor={menu.anchor} onClose={menu.close} placement="bottom-end">
          {TIME_RANGE_PRESETS.map((p) => (
            <MenuItem key={p.label} onSelect={menu.select(() => applyPreset(p))}>
              {p.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={menu.select(clearRange)}>All time</MenuItem>
        </PositionedMenu>
      )}
    </>
  );
}
