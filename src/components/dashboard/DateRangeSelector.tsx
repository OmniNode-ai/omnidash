// Dashboard-level time range selector. Lives in the header next to the
// mode-dependent action buttons (Add Widget / Save / Discard). Writes
// through to the store's `globalFilters.timeRange`; widgets that declare
// `supports_time_range: true` subscribe to the same state and filter
// their data accordingly.
//
// Design notes:
//   - Two views in the same popover: preset list and a custom
//     start/end range picker (calendar + time inputs). The popover
//     stays open when switching between them; Apply commits + closes,
//     Cancel returns to the preset list.
//   - Preset selection resolves to absolute ISO timestamps at click-time
//     and stores those in the range. The window doesn't auto-advance
//     with auto-refresh — the user re-picks to refresh. This keeps the
//     model simple and avoids per-frame re-resolution churn on widgets
//     whose useMemo deps would otherwise invalidate every tick.
//   - On first mount, if the store has no time range yet, we seed the
//     default preset (Last 24h). Makes fresh dashboards land on a
//     sensible window rather than "show me 48h of synthetic fixtures".
import { useEffect, useState } from 'react';
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
import type { TimeRange } from '@/store/types';
import { CustomRangePicker } from './CustomRangePicker';

type MenuView = 'presets' | 'custom';

export function DateRangeSelector() {
  const range = useFrameStore((s) => s.globalFilters.timeRange);
  const setTimeRange = useFrameStore((s) => s.setTimeRange);
  const menu = usePositionedMenu();
  const [view, setView] = useState<MenuView>('presets');

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
  const applyCustom = (custom: TimeRange) => {
    setTimeRange(custom);
    menu.close();
    setView('presets');
  };
  const closeMenu = () => {
    menu.close();
    setView('presets');
  };

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
        onClick={(e) => { setView('presets'); menu.open(e); }}
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
        <PositionedMenu
          anchor={menu.anchor}
          onClose={closeMenu}
          placement="bottom-end"
          minWidth={view === 'custom' ? 320 : 180}
        >
          {view === 'presets' ? (
            <>
              {TIME_RANGE_PRESETS.map((p) => (
                <MenuItem key={p.label} onSelect={menu.select(() => applyPreset(p))}>
                  {p.label}
                </MenuItem>
              ))}
              <MenuSeparator />
              {/* Note: intentionally not wrapped in menu.select — we want
                  the menu to stay OPEN and just swap to the custom view. */}
              <MenuItem onSelect={() => setView('custom')}>Custom range…</MenuItem>
              <MenuItem onSelect={menu.select(clearRange)}>All time</MenuItem>
            </>
          ) : (
            <CustomRangePicker
              initial={range}
              onCancel={() => setView('presets')}
              onApply={applyCustom}
            />
          )}
        </PositionedMenu>
      )}
    </>
  );
}
