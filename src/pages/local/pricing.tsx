/**
 * OMN-21970 AC10: Settings' Pricing and routing section. It names the baseline model the savings figures are priced
 * against and the pricing manifest version, both as metering-summary.v1 serves them on its all-time row. Nothing here
 * is computed: a value the row leaves empty is left out, and no row at all says so.
 */
import { readableTime } from '@/components/format/readable-time';

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

export function PricingFacts({ rows }: { rows: readonly Record<string, unknown>[] }) {
  const row = rows.find(candidate => text(candidate.window_kind) === 'all') ?? rows[0];
  if (row === undefined) return <p className="local-dashboard-empty" role="status">No pricing recorded yet: it appears after the first measured run.</p>;
  const facts: Array<[string, string, boolean]> = [];
  if (text(row.baseline_model)) facts.push(['Baseline model', text(row.baseline_model), true]);
  if (text(row.pricing_manifest_version)) facts.push(['Pricing version', text(row.pricing_manifest_version), true]);
  if (text(row.baseline_state)) facts.push(['Baseline price', text(row.baseline_state) === 'resolved' ? 'Found in the pricing manifest' : text(row.baseline_state), false]);
  if (text(row.as_of)) facts.push(['As of', readableTime(text(row.as_of)) ?? text(row.as_of), false]);
  if (facts.length === 0) return <p className="local-dashboard-empty" role="status">The baseline model and pricing version are not recorded.</p>;
  return <div className="local-pricing">
    <dl className="local-provider-facts local-pricing-facts">{facts.map(([label, value, mono]) => (
      <div key={label}><dt>{label}</dt><dd className={mono ? 'mono' : undefined}>{value}</dd></div>
    ))}</dl>
    <p className="local-dashboard-caption">Savings compare what each run cost with what its tokens would cost on the baseline model. The baseline never ran. Routing order is set per provider; see Tried first on each provider card.</p>
  </div>;
}
