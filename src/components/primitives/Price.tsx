/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
export interface PriceProps {
  value: number;
  big?: boolean;
}

/**
 * Price -- formatted price tag with semantic coloring.
 * FREE (green) for $0, warn for <= $0.05, bad for > $0.05.
 */
export function Price({ value, big = false }: PriceProps) {
  const free = value === 0;
  const formatted = free
    ? 'FREE'
    : '$' + value.toFixed(value < 0.01 ? 4 : 3);

  const color = free
    ? 'var(--good)'
    : value > 0.05
      ? 'var(--bad)'
      : 'var(--warn)';

  return (
    <span
      className="mono tnum"
      style={{
        fontSize: big ? 18 : 12,
        fontWeight: 700,
        color,
        letterSpacing: free ? '0.1em' : undefined,
      }}
    >
      {formatted}
    </span>
  );
}
