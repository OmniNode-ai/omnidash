/**
 * OMN-21166 part 11 AC63: the one KPI strip of the local pages.
 * Every figure is a served value formatted by its caller; a figure that is not served reads its typed state and draws no sparkline.
 * A sparkline draws only served day values and breaks at a missing day, never drawing it as zero.
 */
import type { CSSProperties } from 'react';

export interface KpiItem {
  label: string;
  value: string;
  note?: string | null;
  title?: string;
  unavailable?: boolean;
  tone?: string;
  series?: ReadonlyArray<number | null> | null;
}

export function Sparkline({ values }: { values: ReadonlyArray<number | null> }) {
  const served = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (served.length < 2) return null;
  const min = Math.min(...served);
  const range = Math.max(...served) - min;
  const path: string[] = [];
  let start = true;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      start = true;
      return;
    }
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 96;
    const y = range === 0 ? 12 : 22 - ((value - min) / range) * 20;
    path.push(`${start ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
    start = false;
  });
  return (
    <svg viewBox="0 0 96 24" aria-hidden="true" className="kpi-sparkline" preserveAspectRatio="none">
      <path d={path.join(' ')} stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiStrip({ label, items }: { label: string; items: readonly KpiItem[] }) {
  return (
    <section className="kpi-strip" aria-label={label} style={{ '--kpi-count': items.length } as CSSProperties}>
      {items.map((item) => (
        <div key={item.label} className="kpi-item" data-field-tone={item.tone} data-field-unavailable={item.unavailable ? 'true' : undefined}>
          <span className="kpi-label">{item.label}</span>
          <strong className="kpi-value" title={item.title}>{item.value}</strong>
          {item.note && <span className="kpi-note">{item.note}</span>}
          {item.series && !item.unavailable && <Sparkline values={item.series} />}
        </div>
      ))}
    </section>
  );
}
