// Custom start/end range picker surfaced via the DateRangeSelector's
// "Custom..." menu item. Renders a range-mode react-day-picker calendar
// plus HH:MM time inputs for each side, so the user can pin the window
// to a specific minute if they want. Commits a TimeRange with no `label`
// so the selector renders the resolved dates rather than a preset name.
import { useMemo, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import './CustomRangePicker.css';
import type { TimeRange } from '@/store/types';
import { Text } from '@/components/ui/typography';

interface CustomRangePickerProps {
  /** Current range from the store, if any — used to pre-fill the calendar + time inputs. */
  initial?: TimeRange;
  onCancel: () => void;
  onApply: (range: TimeRange) => void;
}

// Combine a calendar day + "HH:MM" into a concrete Date preserving local tz.
function combine(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const out = new Date(day);
  out.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return out;
}

// Time-input defaults that feel sensible on first open. The common case
// is "I want the full day(s) between these two dates" — seeding the
// inputs with the specific time from the currently-active preset (e.g.
// the 14:37 that happens to be on `now-24h`) was confusing.
const DEFAULT_START_TIME = '00:00';
const DEFAULT_END_TIME = '23:59';

export function CustomRangePicker({ initial, onCancel, onApply }: CustomRangePickerProps) {
  // Seed from the current range (if set) so reopening shows what the user
  // last had. If no range, default to the last 24h ending now so the
  // calendar opens on something sensible instead of unselected.
  const seed = useMemo(() => {
    const fallbackEnd = new Date();
    const fallbackStart = new Date(fallbackEnd.getTime() - 24 * 60 * 60 * 1000);
    if (!initial) return { from: fallbackStart, to: fallbackEnd };
    const from = new Date(initial.start);
    const to = new Date(initial.end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { from: fallbackStart, to: fallbackEnd };
    }
    return { from, to };
  }, [initial]);

  const [range, setRange] = useState<DateRange | undefined>({
    from: seed.from,
    to: seed.to,
  });
  const [startTime, setStartTime] = useState<string>(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState<string>(DEFAULT_END_TIME);

  const canApply = Boolean(range?.from && range?.to);
  const handleApply = () => {
    if (!range?.from || !range?.to) return;
    const start = combine(range.from, startTime);
    const end = combine(range.to, endTime);
    // Guard: if the user flipped start/end via the calendar (possible in
    // range mode if they click backwards), swap so start ≤ end.
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    onApply({ start: lo.toISOString(), end: hi.toISOString() });
  };

  return (
    <div
      className="dash-calendar-wrapper"
      style={{ padding: 8 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* stopPropagation above keeps PositionedMenu's outside-click handler
          from dismissing the popover when the user clicks inside the
          calendar. Theming is in CustomRangePicker.css, loaded after the
          library stylesheet so the --rdp-* overrides win the cascade. */}
      <DayPicker
        mode="range"
        selected={range}
        onSelect={setRange}
        numberOfMonths={1}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '6px 10px',
          padding: '6px 8px 2px',
        }}
      >
        <label htmlFor="crp-start" style={{ alignSelf: 'center' }}>
          <Text size="md" color="secondary">Start</Text>
        </label>
        <input
          id="crp-start"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="text-input-sm mono"
          style={{
            padding: '3px 6px',
            background: 'var(--panel-2)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            color: 'inherit',
          }}
        />
        <label htmlFor="crp-end" style={{ alignSelf: 'center' }}>
          <Text size="md" color="secondary">End</Text>
        </label>
        <input
          id="crp-end"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="text-input-sm mono"
          style={{
            padding: '3px 6px',
            background: 'var(--panel-2)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            color: 'inherit',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '8px 8px 4px',
          borderTop: '1px solid var(--line-2)',
          marginTop: 6,
        }}
      >
        <button type="button" className="btn ghost" onClick={onCancel}>
          <Text size="md" color="inherit">Cancel</Text>
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={handleApply}
          disabled={!canApply}
        >
          <Text size="md" color="inherit">Apply</Text>
        </button>
      </div>
    </div>
  );
}
