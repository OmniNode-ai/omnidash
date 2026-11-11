/** Display USD only (OMN-22168, Jonah 2026-11-06): two decimals, or up to four below $1, cut and never rounded up.
 * Decimal text avoids rounding and binary floating point cent loss.
 * Raw projection values and chart geometry never pass through this formatter.
 */
export function formatDashboardUsd(value: unknown): string {
  if (typeof value !== 'number' && typeof value !== 'string') return 'Not measured';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Not measured';
  const text = String(value).trim();
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || !Number.isFinite(Number(text))) return 'Not measured';
  const [integer = '', fraction = ''] = match[2]!.split('.');
  const digits = integer + fraction;
  const nonzero = /[1-9]/.test(digits);
  if (!nonzero) return '$0.00';
  const point = integer.length + Number(match[3] ?? 0);
  // Finite scientific notation can still have an enormous negative exponent: below the shown unit, show the unit.
  if (point <= -4) return `${match[1] === '-' ? '-' : ''}$0.0001`;
  const expanded = point < 0 ? '0'.repeat(-point) + digits : digits;
  const split = Math.max(0, point);
  const whole = (expanded.slice(0, split).padEnd(split, '0') || '0').replace(/^0+(?=\d)/, '');
  // Jonah 2026-11-06 ("just like we had it before unless it is less than 0 then you can go out to 4"): $1 and up shows
  // two decimals; under $1 shows up to four, trailing zeros trimmed to two. Digits past those are cut, never rounded up,
  // and a nonzero amount below the last shown place shows that place's unit rather than a zero.
  const places = whole === '0' ? 4 : 2;
  let shown = expanded.slice(split, split + places).padEnd(places, '0');
  if (whole === '0' && /^0+$/.test(shown)) shown = `${'0'.repeat(places - 1)}1`;
  const decimals = shown.replace(/0+$/, '').padEnd(2, '0');
  const sign = match[1] === '-' && nonzero ? '-' : '';
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`;
}
