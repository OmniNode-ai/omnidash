// Header-level timezone selector. Visual twin of DateRangeSelector —
// ghost button with icon + value + caret. Menu behavior is stubbed for
// now (click is a no-op); it will be wired up in a follow-up alongside
// the auto-refresh picker.
import { useMemo } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { Text } from '@/components/ui/typography';

function formatLocalTimezone(): string {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '−';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function TimezoneSelector() {
  const tz = useMemo(formatLocalTimezone, []);
  return (
    <button
      type="button"
      className="btn ghost"
      aria-label="Timezone"
      aria-haspopup="menu"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <Globe size={14} />
      <Text size="md" family="mono">{tz}</Text>
      <ChevronDown size={12} style={{ opacity: 0.7 }} />
    </button>
  );
}
