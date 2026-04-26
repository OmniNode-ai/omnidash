// Header-level timezone selector. Visual twin of
// `DateRangeSelector` — ghost button with icon + value + caret.
// Backed by `globalFilters.timezone` (OMN-125); writes flow into
// every time-rendering widget via `useTimezone()`.
//
// Presets are a curated set of common IANA zones rather than a full
// 400-entry list. "Browser local" (undefined) is the default; UTC
// is always available; the rest cover the principal markets the
// dashboard's customers operate in. A user wanting an off-list zone
// can extend `TIMEZONE_PRESETS` here — there's no search input
// because the off-list case is rare and a ten-row menu is faster to
// pick from than a typeahead.
import { Fragment, useMemo } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import {
  PositionedMenu,
  MenuItem,
  MenuSeparator,
  usePositionedMenu,
} from '@/components/ui/positioned-menu';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';

interface TimezonePreset {
  /** IANA timezone identifier, or null for "browser local". */
  value: string | null;
  /** Short label rendered in both the selector button and the menu. */
  label: string;
}

const TIMEZONE_PRESETS: TimezonePreset[] = [
  { value: null, label: 'Local' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Denver', label: 'Denver' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

/**
 * Compact UTC-offset string for the active zone, e.g. `'UTC+09:00'`.
 * Computed via `Intl.DateTimeFormat` so it tracks DST automatically.
 */
function formatOffset(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date());
  const named = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  // `shortOffset` returns strings like "GMT+9" or "GMT-7:30". Normalise
  // to "UTC±HH:MM" for visual parity with the prototype's offset
  // format.
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(named);
  if (!m) return named.replace('GMT', 'UTC');
  const sign = m[1] === '+' ? '+' : '−';
  const hh = m[2].padStart(2, '0');
  const mm = (m[3] ?? '00').padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function TimezoneSelector() {
  const explicit = useFrameStore((s) => s.globalFilters.timezone);
  const setTimezone = useFrameStore((s) => s.setTimezone);
  const menu = usePositionedMenu();

  // Resolved zone for the offset preview (used in tooltips + menu rows).
  const browserZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const activeZone = explicit ?? browserZone;
  const activeOffset = useMemo(() => formatOffset(activeZone), [activeZone]);

  // Selector button label: "Local" / "UTC" / city name. Falls back
  // to the offset string for off-preset zones (shouldn't happen given
  // we only write through this selector, but defensive).
  const buttonLabel = (() => {
    const preset = TIMEZONE_PRESETS.find((p) => p.value === (explicit ?? null));
    return preset?.label ?? activeOffset;
  })();

  const apply = (value: string | null) => {
    setTimezone(value === null ? undefined : value);
  };

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        onClick={menu.open}
        aria-label="Timezone"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        title={`${buttonLabel} (${activeOffset})`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Globe size={14} />
        <Text size="md" family="mono">{buttonLabel}</Text>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>
      {menu.isOpen && (
        <PositionedMenu
          anchor={menu.anchor}
          onClose={menu.close}
          placement="bottom-end"
          minWidth={180}
        >
          {TIMEZONE_PRESETS.map((p, i) => {
            const offset = formatOffset(p.value ?? browserZone);
            return (
              <Fragment key={p.label}>
                {/* Separator between Local and UTC (browser-relative
                    vs. fixed zones). */}
                {i === 1 && <MenuSeparator />}
                <MenuItem onSelect={menu.select(() => apply(p.value))}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 12 }}>
                    <span>{p.label}</span>
                    <Text as="span" size="xs" family="mono" color="secondary">
                      {offset}
                    </Text>
                  </span>
                </MenuItem>
              </Fragment>
            );
          })}
        </PositionedMenu>
      )}
    </>
  );
}
