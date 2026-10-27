/**
 * OMN-21166 part 11 AC63, reworked by part 15 AC91: the headline figures of Runs and Usage, drawn as Overview's cards.
 * A card shows its title, its served figure and, since part 29 AC191, a caption under the figure: the first of its lines
 * (captions, run counts, baseline, and what the sparkline showed) is drawn, and every line stays in the page. Every
 * figure is a served value formatted by its caller; a figure that is not served reads its typed state.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { CardBasis } from '@/components/dashboard/CardBasis';

/** A figure's served value per UTC day (oldest first), and how to write one value. */
export interface KpiTrend {
  days: readonly string[];
  values: ReadonlyArray<number | null>;
  format: (value: number) => string;
  /** What the days are, e.g. "Latest 14 UTC days" (calendar days) or "Latest 13 days with usage" (served rows only). */
  scope?: string;
}

export interface KpiItem {
  label: string;
  /** The served figure, formatted by the caller (or its typed state). */
  value: ReactNode;
  /** The identity colour of the card's 3px edge and tooltip, e.g. var(--field-cost). */
  accent: string;
  /** The concept whose icon heads the card (ConceptIcon). */
  concept?: string;
  /** The short facts under the figure: the first is the drawn caption, the rest stay in the page (AC191). */
  lines?: ReadonlyArray<string | null | undefined>;
  title?: string;
  unavailable?: boolean;
  trend?: KpiTrend | null;
}

const dayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * What a sparkline used to show, in words: the peak and the latest served day. A day with no served value is skipped,
 * never counted as zero, and fewer than two served days make no sentence.
 */
export function trendLine(trend: KpiTrend): string | null {
  const served = trend.days.map((day, index) => ({ day, value: trend.values[index] }))
    .filter((point): point is { day: string; value: number } => typeof point.value === 'number' && Number.isFinite(point.value));
  if (served.length < 2) return null;
  const peak = served.reduce((best, point) => (point.value > best.value ? point : best));
  const latest = served[served.length - 1]!;
  return `${trend.scope ?? `Latest ${trend.days.length} UTC days`}: peak ${trend.format(peak.value)} on ${dayName(peak.day)} · latest ${trend.format(latest.value)} on ${dayName(latest.day)}`;
}

/** Part 29 AC191: a trend's short caption, its peak served day (the full sentence stays in the page); null under two days. */
export function trendCaption(trend: KpiTrend): string | null {
  const served = trend.days.map((day, index) => ({ day, value: trend.values[index] }))
    .filter((point): point is { day: string; value: number } => typeof point.value === 'number' && Number.isFinite(point.value));
  if (served.length < 2) return null;
  const peak = served.reduce((best, point) => (point.value > best.value ? point : best));
  return `Peak ${trend.format(peak.value)} on ${dayName(peak.day)}`;
}

export function KpiStrip({ label, items }: { label: string; items: readonly KpiItem[] }) {
  return (
    <div className="local-overview-surface local-kpi-cards">
      <section className="local-overview-summary" aria-label={label} style={{ '--kpi-count': items.length } as CSSProperties}>
        {items.map((item) => {
          const trend = item.trend && !item.unavailable ? trendLine(item.trend) : null;
          // A card whose only fact is its trend draws the short peak caption first (AC191), the trend sentence after it.
          const short = trend && (item.lines ?? []).filter(Boolean).length === 0 ? trendCaption(item.trend!) : null;
          const lines = [...(item.lines ?? []), short, trend].filter((line): line is string => Boolean(line));
          return (
            <article key={item.label} className="local-dashboard-panel" data-kpi-card={item.label}
              data-field-unavailable={item.unavailable ? 'true' : undefined} style={{ '--panel-accent': item.accent } as CSSProperties}>
              <h2>{item.concept && <ConceptIcon concept={item.concept} label={item.label} size={14} />}{item.label}</h2>
              <p className="local-dashboard-metric" data-measured={item.unavailable ? 'false' : 'true'} title={item.title}
                style={{ '--figure-chars': String(item.value).length } as CSSProperties}>{item.value}</p>
              {lines.length > 0 && <CardBasis label={item.label}>{lines.map(line => <p key={line} className="local-dashboard-caption">{line}</p>)}</CardBasis>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
