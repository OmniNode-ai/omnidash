import { useState, useEffect, useRef } from 'react';

/**
 * useCountUp -- animates 0 -> value on mount, then animates between
 * value changes using a cubic ease-out curve.
 */
export function useCountUp(
  value: number,
  { duration = 900, decimals = 0 }: { duration?: number; decimals?: number } = {},
): string {
  const [v, setV] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const t0 = performance.now();
    let raf: number;

    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return v.toFixed(decimals);
}

export interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}

/**
 * CountUp -- renders an animated number that counts up from 0 on mount
 * and smoothly transitions between value changes.
 */
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 900,
  className,
}: CountUpProps) {
  const v = useCountUp(value, { duration, decimals });
  const formatted = Number(v).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
