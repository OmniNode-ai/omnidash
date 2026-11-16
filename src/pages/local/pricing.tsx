import { ConceptIcon } from '@/components/dashboard/FieldIcon';
/**
 * OMN-21970 AC10: Settings' Pricing and routing section. It names the baseline model the savings figures are priced
 * against and the pricing manifest version, both as metering-summary.v1 serves them on its all-time row. Nothing here
 * is computed: a value the row leaves empty is left out, and no row at all says so.
 */
import { formatDashboardUsd, readableTime } from '@/theme/format';
import { EmptyState, Fact, FactList } from '@/theme/design-system/components';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

/** OMN-24616 AC8: a served price per 1k tokens, as decimal text, moved three places to the price per million. */
function perMillion(perThousand: unknown): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text(perThousand));
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(3, '0');
  const whole = `${match[1]}${fraction.slice(0, 3)}`.replace(/^0+(?=\d)/, '');
  const rest = fraction.slice(3);
  return rest ? `${whole}.${rest}` : whole;
}

/** OMN-24616 AC8: the baseline's price as served in the row's summary_json, or Not measured when it serves none. */
function baselinePrice(summaryJson: unknown): string {
  let summary: unknown = summaryJson;
  if (typeof summaryJson === 'string') {
    try { summary = JSON.parse(summaryJson); } catch { return 'Not measured'; }
  }
  const baseline = summary !== null && typeof summary === 'object' ? (summary as { baseline?: unknown }).baseline : undefined;
  if (baseline === null || typeof baseline !== 'object') return 'Not measured';
  const prices = baseline as { price_in_per_1k?: unknown; price_out_per_1k?: unknown };
  const priceIn = perMillion(prices.price_in_per_1k);
  const priceOut = perMillion(prices.price_out_per_1k);
  if (priceIn === null || priceOut === null) return 'Not measured';
  return `${formatDashboardUsd(priceIn)} in · ${formatDashboardUsd(priceOut)} out per million tokens`;
}

const PRICING_TONES: Record<string, string> = { 'Baseline model': 'baseline', 'Pricing version': 'basis', 'Baseline price': 'cost', 'As of': 'age' };

export function PricingFacts({ rows }: { rows: readonly Record<string, unknown>[] }) {
  const row = rows.find(candidate => text(candidate.window_kind) === 'all') ?? rows[0];
  if (row === undefined) return <EmptyState>No pricing recorded yet: it appears after the first measured run.</EmptyState>;
  const facts: Array<[string, string, boolean]> = [];
  if (text(row.baseline_model)) facts.push(['Baseline model', text(row.baseline_model), true]);
  if (text(row.pricing_manifest_version)) facts.push(['Pricing version', text(row.pricing_manifest_version), true]);
  // OMN-24616 AC8: the price itself, never "Found in the pricing manifest".
  if (text(row.baseline_state)) facts.push(['Baseline price', baselinePrice(row.summary_json), false]);
  if (text(row.as_of)) facts.push(['As of', readableTime(text(row.as_of)) ?? text(row.as_of), false]);
  if (facts.length === 0) return <EmptyState>The baseline model and pricing version are not recorded.</EmptyState>;
  return <div className="local-pricing">
    {/* Overview's headline cards (Lakshman 2026-11-05, "full platform uniform"): each fact in its concept colour. */}
    <FactList look="provider" className="local-pricing-facts">{facts.map(([label, value, mono]) => (
      <Fact term={<><ConceptIcon concept={PRICING_TONES[label] ?? 'basis'} label={label} size={14} />{label}</>} key={label}
        data-field-tone={PRICING_TONES[label] ?? 'basis'} valueClassName={mono ? 'mono' : undefined}>{value}</Fact>
    ))}</FactList>
    <p className="local-dashboard-caption">Savings compare what each run cost with what its tokens would cost on the baseline model. The baseline never ran. Routing order is set per provider; see Tried first on each provider in Model providers.</p>
  </div>;
}
