/** Add served decimal amounts before display truncation. Numbers are used only for chart geometry. */
export function sumDashboardUsd(values: readonly unknown[]): string | null {
  let total = 0n;
  let scale = 0;
  let measured = false;
  for (const value of values) {
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    const text = String(value).trim();
    const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !Number.isFinite(Number(text))) continue;
    const [whole = '', fraction = ''] = match[2]!.split('.');
    const exponent = Number(match[3] ?? 0);
    // Bound expansion of untrusted exposure data, including exponents that underflow Number to zero.
    if (Math.abs(exponent) > 1000 || whole.length + fraction.length > 4096) continue;
    let units = BigInt((whole + fraction) || '0') * (match[1] === '-' ? -1n : 1n);
    const places = fraction.length - exponent;
    const nextScale = Math.max(0, places, scale);
    total *= 10n ** BigInt(nextScale - scale);
    units *= 10n ** BigInt(nextScale - places);
    total += units;
    scale = nextScale;
    measured = true;
  }
  if (!measured) return null;
  const digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  return `${total < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
}

/** Decimal quotient for the money formatter, truncated beyond cents while retaining any nonzero amount. */
export function divideDashboardUsd(amount: string | null, calls: number | null): string | null {
  if (amount === null || calls === null || !Number.isFinite(calls) || calls <= 0) return null;
  const denominator = sumDashboardUsd([calls]);
  if (denominator === null) return null;
  const [whole = '', fraction = ''] = amount.split('.');
  const [divisorWhole = '', divisorFraction = ''] = denominator.split('.');
  const numerator = BigInt(whole + fraction);
  const divisor = BigInt(divisorWhole + divisorFraction);
  // A decimal with N divisor digits needs at most N extra places to expose a nonzero quotient.
  // Keep at least three places so the formatter alone chooses truncation and the nonzero-cent floor.
  const places = Math.max(3, fraction.length + divisor.toString().length);
  const quotient = numerator * 10n ** BigInt(divisorFraction.length + places - fraction.length) / divisor;
  const digits = (quotient < 0n ? -quotient : quotient).toString().padStart(places + 1, '0');
  return `${quotient < 0n ? '-' : ''}${digits.slice(0, -places)}.${digits.slice(-places)}`;
}
