/** Display USD only. Decimal text avoids rounding and binary floating point cent loss.
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
  // Finite scientific notation can still have an enormous negative exponent.
  if (point <= -2) return nonzero ? `${match[1] === '-' ? '-' : ''}$0.01` : '$0.00';
  const expanded = point < 0 ? '0'.repeat(-point) + digits : digits;
  const split = Math.max(0, point);
  const whole = (expanded.slice(0, split).padEnd(split, '0') || '0').replace(/^0+(?=\d)/, '');
  let cents = expanded.slice(split, split + 2).padEnd(2, '0');
  if (whole === '0' && cents === '00' && nonzero) cents = '01';
  const sign = match[1] === '-' && nonzero ? '-' : '';
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}
