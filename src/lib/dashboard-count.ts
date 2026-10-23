/** Count display only. Keep decimal strings exact; never use these strings for arithmetic or sorting. */
function decimal(value: unknown): { negative: boolean; whole: string; fraction: string } | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!match) return null;
  const [integer = '', fraction = ''] = match[2]!.split('.');
  const exponent = Number(match[3] ?? 0);
  // Bound expansion, including maliciously large decimal exponents, without converting the count to a float.
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000 || integer.length + fraction.length > 1000) return null;
  const digits = integer + fraction;
  const point = integer.length + exponent;
  const whole = (point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')).replace(/^0+(?=\d)/, '');
  const tail = point < 0 ? '0'.repeat(-point) + digits : digits.slice(point);
  return { negative: match[1] === '-' && /[1-9]/.test(digits), whole, fraction: tail };
}
const group = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Exact nonnegative counts; unsafe numeric inputs cannot establish an integer. */
export function wholeCount(value: unknown): bigint | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value !== 'string' || value.length > 1000 || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function formatDashboardCount(value: unknown): string {
  const parsed = decimal(value);
  if (!parsed) return 'Not measured';
  const { whole, fraction, negative } = parsed;
  const scale = Math.min(4, Math.floor((whole.length - 1) / 3));
  const split = whole.length - scale * 3;
  const head = whole.slice(0, split);
  const tail = (whole.slice(split) + fraction).slice(0, 2).replace(/0+$/, '');
  const zero = head === '0' && !/[1-9]/.test(tail);
  return `${negative && !zero ? '-' : ''}${group(head)}${tail ? `.${tail}` : ''}${['', 'K', 'M', 'B', 'T'][scale]}`;
}

/** Directional token counts are always full integers, including values beyond Number.MAX_SAFE_INTEGER. */
export function formatFullCount(value: unknown): string {
  const parsed = decimal(value);
  if (!parsed || /[1-9]/.test(parsed.fraction)) return 'Not measured';
  return `${parsed.negative && parsed.whole !== '0' ? '-' : ''}${group(parsed.whole)}`;
}
