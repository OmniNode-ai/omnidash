/**
 * OMN-24616 AC4: the one declared list of figure windows the local pages offer. The Overview window menu, its
 * keyboard keys, the address (`?window=7d`), the rolling-window checks and the chart range buttons all read it, so a
 * window is added or removed here once. `days` 0 is all time; `urlKey` '' means the window has no address key.
 */
import { CalendarClock, CalendarDays, CalendarFold, CalendarRange, Infinity as InfinityIcon, Sun, type LucideIcon } from '@/theme/design-system/icons';

export interface LocalWindow {
  /** The menu's value and the window's identity in its icon and tone. */
  readonly value: string;
  /** The `?window=` key; all time has none. */
  readonly urlKey: string;
  readonly days: number;
  readonly label: string;
  /** The full name assistive technology reads. */
  readonly name: string;
  /** The one key that picks it (OMN-23330 AC36). */
  readonly key: string;
  /** Its glyph in the window menu (OMN-22168). */
  readonly icon: LucideIcon;
}

export const LOCAL_WINDOWS: readonly LocalWindow[] = [
  { value: 'all', urlKey: '', days: 0, label: 'All time', name: 'All time', key: 'A', icon: InfinityIcon },
  { value: 'today', urlKey: 'today', days: 1, label: 'Today', name: 'Today (UTC)', key: 'T', icon: Sun },
  { value: 'last-7', urlKey: '7d', days: 7, label: 'Last 7 days', name: 'Last 7 days (UTC)', key: 'W', icon: CalendarRange },
  { value: 'last-15', urlKey: '15d', days: 15, label: 'Last 15 days', name: 'Last 15 days (UTC)', key: 'F', icon: CalendarClock },
  { value: 'last-30', urlKey: '30d', days: 30, label: 'Last 30 days', name: 'Last 30 days (UTC)', key: 'M', icon: CalendarDays },
  { value: 'last-90', urlKey: '90d', days: 90, label: 'Last 90 days', name: 'Last 90 days (UTC)', key: 'Q', icon: CalendarFold },
];

/** The rolling windows longer than a day, in days. */
export const ROLLING_WINDOW_DAYS: readonly number[] = LOCAL_WINDOWS.filter(window => window.days > 1).map(window => window.days);
