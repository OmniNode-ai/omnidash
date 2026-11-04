/**
 * OMN-22168 AC3: the sparkline of the local pages (Usage analysis, runs per day per group). Moved from
 * src/pages/local/usage-analysis.tsx. A day the sample does not cover is marked and drawn with no height, never as 0.
 */
import type { CSSProperties } from 'react';

export interface SparkDay { key: string; value: number | null; title: string }

export function BarSparkline({ label, days }: { label: string; days: readonly SparkDay[] }) {
  const peak = Math.max(1, ...days.flatMap(day => (day.value === null ? [] : [day.value])));
  // The bars are one neutral grey, a shape of the runs per day, not an identity colour.
  return <span className="usage-analysis-spark" role="img" data-identity-decoration="sparkline" aria-label={label}>
    {days.map(day => <i key={day.key} data-day={day.key} data-covered={day.value === null ? 'false' : 'true'} data-runs={day.value ?? undefined}
      title={day.title} style={day.value === null ? undefined : { '--spark-height': `${(day.value / peak) * 100}%` } as CSSProperties} />)}
  </span>;
}
