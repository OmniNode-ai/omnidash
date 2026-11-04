/**
 * OMN-22168 AC3: the meters and tracks of the local pages. A meter states its value to assistive tech and is not drawn
 * for a value off its scale; a track fills its share of the largest value in its list. Moved from
 * LocalDashboardPage.tsx (local share, quality against its bar), shares.tsx (pass rate) and insight-charts.tsx (lists).
 */
/** The meters a page names by what they show; the kit owns their class names (tests/design-system/chart-scan.test.ts). */
const METER_KINDS = { 'routing-share': 'local-routing-meter', 'selected-quality': 'local-selected-quality-meter' } as const;
export type MeterKind = keyof typeof METER_KINDS;

export function Meter({ kind, className: givenClass, label, min, max, now, valueText, share, mark = null, value, fillTestId }: {
  /** Which page meter this is; it sets the class. A caller inside the kit may pass className instead. */
  kind?: MeterKind;
  className?: string;
  label: string;
  min: number; max: number; now: number;
  valueText?: string;
  /** The fill, 0 to 1. */
  share: number;
  /** A threshold marked on the meter, 0 to 1; off the scale it is left out. */
  mark?: number | null;
  /** Shown beside the meter; given, the fill sits in a track (the pass-rate meter's look). */
  value?: string;
  fillTestId?: string;
}) {
  if (!Number.isFinite(share) || share < 0 || share > 1 || !Number.isFinite(now) || now < min || now > max) return null;
  const className = kind ? METER_KINDS[kind] : givenClass;
  const marked = mark !== null && Number.isFinite(mark) && mark >= 0 && mark <= 1;
  const fill = <span className={value === undefined ? undefined : 'local-meter-fill'} data-testid={fillTestId} style={{ width: `${share * 100}%` }} />;
  return (
    <div className={className} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={now} aria-valuetext={valueText}>
      {value === undefined ? fill : <div className="local-meter-track">{fill}</div>}
      {marked && <i style={{ left: `${mark! * 100}%` }} />}
      {value !== undefined && <span className="local-meter-value">{value}</span>}
    </div>
  );
}

/**
 * A comparison row's track (Workflow's token and quality comparison, moved from workflow-analysis.tsx). The row sets
 * --bar-width; the track is decoration, so it is hidden from assistive tech and the row's text carries the value.
 */
export function ComparisonTrack() {
  return <span className="workflow-comparison-track" aria-hidden="true"><span /></span>;
}

/** A list row's bar: its share of the list's largest value, growing in after `delay` ms. */
export function BarTrack({ share, delay }: { share: number; delay: number }) {
  return <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${share * 100}%`, animationDelay: `${delay}ms` }} /></span>;
}
