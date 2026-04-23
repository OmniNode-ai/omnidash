// Custom start/end range picker surfaced via the DateRangeSelector's
// "Custom..." menu item. Renders a range-mode react-day-picker calendar
// plus HH:MM time inputs for each side, so the user can pin the window
// to a specific minute if they want. Commits a TimeRange with no `label`
// so the selector renders the resolved dates rather than a preset name.
import { useMemo, useState, type CSSProperties } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import type { TimeRange } from '@/store/types';

interface CustomRangePickerProps {
  /** Current range from the store, if any — used to pre-fill the calendar + time inputs. */
  initial?: TimeRange;
  onCancel: () => void;
  onApply: (range: TimeRange) => void;
}

// Parse an ISO timestamp into a 24h "HH:MM" string for the time input.
function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Combine a calendar day + "HH:MM" into a concrete Date preserving local tz.
function combine(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const out = new Date(day);
  out.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return out;
}

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
  const [startTime, setStartTime] = useState<string>(toHHMM(seed.from));
  const [endTime, setEndTime] = useState<string>(toHHMM(seed.to));

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

  // Theme the calendar via CSS vars on the wrapper. react-day-picker
  // exposes --rdp-* knobs that cascade into its internal stylesheet;
  // binding them to our dashboard tokens means the calendar picks up
  // the active light/dark theme automatically with no JS plumbing.
  const wrapperStyle: CSSProperties = {
    ['--rdp-accent-color' as string]: 'var(--brand)',
    ['--rdp-accent-background-color' as string]: 'var(--brand-soft)',
    ['--rdp-range_middle-background-color' as string]: 'var(--brand-soft)',
    ['--rdp-range_middle-color' as string]: 'var(--brand-ink)',
    ['--rdp-range_start-color' as string]: 'var(--brand-ink)',
    ['--rdp-range_end-color' as string]: 'var(--brand-ink)',
    ['--rdp-today-color' as string]: 'var(--brand)',
    ['--rdp-day-height' as string]: '30px',
    ['--rdp-day-width' as string]: '30px',
    ['--rdp-day_button-height' as string]: '28px',
    ['--rdp-day_button-width' as string]: '28px',
    ['--rdp-nav-height' as string]: '2rem',
    ['--rdp-nav_button-height' as string]: '1.75rem',
    ['--rdp-nav_button-width' as string]: '1.75rem',
    padding: 8,
    color: 'var(--ink)',
    fontSize: 13,
  };

  return (
    <div style={wrapperStyle} onPointerDown={(e) => e.stopPropagation()}>
      {/* stopPropagation above keeps PositionedMenu's outside-click handler
          from dismissing the popover when the user clicks inside the
          calendar (react-day-picker buttons don't use the same element
          we anchored against, and the outside-check walks via contains). */}
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
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        <label htmlFor="crp-start" style={{ alignSelf: 'center' }}>Start</label>
        <input
          id="crp-start"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          style={{
            padding: '3px 6px',
            background: 'var(--panel-2)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
            fontSize: 12,
          }}
        />
        <label htmlFor="crp-end" style={{ alignSelf: 'center' }}>End</label>
        <input
          id="crp-end"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          style={{
            padding: '3px 6px',
            background: 'var(--panel-2)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
            fontSize: 12,
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
        <button type="button" className="btn ghost" onClick={onCancel} style={{ fontSize: 12 }}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={handleApply}
          disabled={!canApply}
          style={{ fontSize: 12 }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
