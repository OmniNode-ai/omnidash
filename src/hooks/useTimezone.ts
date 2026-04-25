// Dashboard-level timezone hook (OMN-125).
//
// Returns the active IANA timezone identifier — either the user's
// explicit selection from `globalFilters.timezone`, or the browser's
// resolved zone when no override is set.
//
// Widgets that render timestamps thread the returned value into
// their existing `toLocaleString*` calls via `{ timeZone }` so the
// dashboard-level selector applies uniformly without each widget
// having to subscribe to the store individually beyond this hook.
import { useFrameStore } from '@/store/store';

/**
 * Resolve the active timezone for time-rendering UI.
 *
 * Returns the IANA name for use in `Intl.DateTimeFormat` /
 * `Date.prototype.toLocaleString` `timeZone` options. Always
 * returns a defined string so callers can pass it unconditionally
 * without checking — when the user has not selected a zone, this
 * returns the browser's resolved zone (e.g. `'America/Los_Angeles'`).
 */
export function useTimezone(): string {
  const explicit = useFrameStore((s) => s.globalFilters.timezone);
  return explicit ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
