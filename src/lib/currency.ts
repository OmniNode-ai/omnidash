const MIN_USD_FRACTION_DIGITS = 2;
const MAX_USD_FRACTION_DIGITS = 6;

/**
 * Return enough decimal places to preserve sub-cent USD values stored by the
 * token-usage projection, while retaining conventional two-decimal display
 * for zero and cent-scale amounts.
 */
export function usdFractionDigits(value: number): number {
  if (!Number.isFinite(value)) return MIN_USD_FRACTION_DIGITS;

  const absolute = Math.abs(value);
  if (absolute === 0 || absolute >= 0.01) return MIN_USD_FRACTION_DIGITS;

  const fractional = absolute
    .toFixed(MAX_USD_FRACTION_DIGITS)
    .split('.')[1]
    .replace(/0+$/, '');
  return Math.max(MIN_USD_FRACTION_DIGITS, fractional.length);
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(usdFractionDigits(value))}`;
}
