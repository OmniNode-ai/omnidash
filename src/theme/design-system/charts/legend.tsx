/**
 * OMN-22168 AC3: the two legends every page chart uses. Series toggles are real buttons that show or hide a series and
 * say whether it is shown; the last shown series cannot be hidden. A static legend names each series beside its swatch,
 * so colour is never the only label. The tier legend names the tiers a chart's models ran under (OMN-21970 AC5).
 */
import { useState, type CSSProperties } from 'react';
import { tierColor } from '@/lib/dashboard-colors';
import { tierLabel, useModelTier } from '@/components/dashboard/model-tiers';

/** Which series are shown, with the rule that the last shown one stays on. */
export function useSeriesToggles<K extends string>(keys: readonly K[]) {
  const [shown, setShown] = useState<Record<K, boolean>>(() => Object.fromEntries(keys.map(key => [key, true])) as Record<K, boolean>);
  const toggle = (key: K) => setShown(current => {
    const others = keys.filter(other => other !== key && current[other]);
    return current[key] && others.length === 0 ? current : { ...current, [key]: !current[key] };
  });
  return { shown, toggle };
}

export interface ToggleSeries { key: string; label: string; color: string; tone?: string; shown: boolean }

export function SeriesToggles({ label, series, onToggle }: { label: string; series: readonly ToggleSeries[]; onToggle: (key: string) => void }) {
  return (
    <div className="ins-toggles gdb-legend" role="group" aria-label={label}>
      {series.map(entry => (
        <button key={entry.key} type="button" className="ins-toggle" data-field-tone={entry.tone} aria-pressed={entry.shown}
          onClick={() => onToggle(entry.key)} style={{ '--ins-swatch': entry.color } as CSSProperties}>{entry.label}</button>
      ))}
    </div>
  );
}

export interface LegendSeries { label: string; color: string; tone?: string }

export function SeriesLegend({ label, series }: { label: string; series: readonly LegendSeries[] }) {
  return (
    <ul className="ins-token-legend gdb-legend" aria-label={label}>
      {series.map(entry => (
        <li key={entry.label} data-field-tone={entry.tone}><i aria-hidden="true" style={{ background: entry.color }} /><span>{entry.label}</span></li>
      ))}
    </ul>
  );
}

/**
 * The legend beside a chart or table that shows models: one swatch and name for each tier its models ran under, in a
 * stable order, so the colour always has a word beside it.
 */
export function TierLegend({ models, label = 'Tier colours' }: { models: readonly string[]; label?: string }) {
  const tierOf = useModelTier();
  const order = ['local', 'harness', 'frontier', 'cheap_frontier', 'cloud', 'cheap_cloud', 'claude', 'customer_keys', 'none'];
  const tiers = [...new Set(models.map(model => tierOf(model) ?? 'none'))]
    .sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length)
      || a.localeCompare(b));
  if (tiers.length === 0) return null;
  return (
    <ul className="tier-legend local-dashboard-caption" aria-label={label} data-testid="tier-legend">
      {tiers.map(tier => (
        <li key={tier} data-tier={tier}>
          <i aria-hidden="true" style={{ background: tierColor(tier) }} />
          {tierLabel(tier)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The legend of a panel's bar chart (Spend per day, Duration and Tokens per run): one button per series with its
 * swatch, each saying whether its series is shown. Unlike SeriesToggles every series may be hidden; the chart then says
 * so (EVERY_SERIES_HIDDEN) instead of drawing an empty plot (OMN-21015 U4).
 */
export function SwatchToggles({ label, series, onToggle }: { label: string; series: readonly ToggleSeries[]; onToggle: (key: string) => void }) {
  return (
    <div className="local-chart-legend" role="group" aria-label={label}>
      {series.map(entry => (
        <button type="button" className="local-chart-toggle" data-field-tone={entry.tone} aria-pressed={entry.shown} key={entry.key} onClick={() => onToggle(entry.key)}>
          <span className="local-chart-swatch" data-swatch aria-hidden="true" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </button>
      ))}
    </div>
  );
}
