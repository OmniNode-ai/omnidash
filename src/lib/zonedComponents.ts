/**
 * Zoned date components for an explicit timezone.
 *
 * Use this in place of `Date.prototype.getMonth / getDate / getFullYear /
 * getHours / getMinutes` anywhere a widget formats bucket labels. Those
 * raw getters read browser-local values and would disagree with the rest
 * of the dashboard once the user picks an explicit zone via
 * `TimezoneSelector`.
 *
 * Returns zero-padded two-digit `month / day / hour / minute` and the
 * full `year` so callers can compose `${month}/${day} ${hour}:${minute}`
 * style strings directly.
 *
 * Originally a private helper inside `CostTrend3D.tsx`; extracted to a
 * shared util once `CostTrendPanel.tsx` needed the same logic (review
 * §4 M1).
 */
export function zonedComponents(
  d: Date,
  timeZone: string,
): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}
