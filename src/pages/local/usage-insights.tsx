import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { UsageAnalysis } from './usage-analysis';
import { DEFAULT_RUNS_VIEW, writeRunsSearch } from '@/navigation/runs-url-state';
import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
import { modelColor, tierColor } from '@/lib/dashboard-colors';
import { formatDashboardUsd } from '@/lib/dashboard-currency';
import { sumDashboardUsd } from '@/lib/dashboard-money-total';
import { GroupedBars } from '@/components/dashboard/GroupedBars';
import { aggregateUsageRows, type UsageAggregates } from './insight-aggregates';
import { tierLabel } from './plain-text';

const USAGE_WINDOW_DAYS = 30;

type Row = Record<string, unknown>;

function records(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

function money(value: number | string | null): string {
  return formatDashboardUsd(value);
}

function count(value: number | null): string {
  return value === null ? 'Not recorded' : formatDashboardCount(value);
}

function share(value: number | null): string {
  return value === null ? 'Not recorded' : `${(value * 100).toFixed(1)}%`;
}

/**
 * A route's cost from the served row: by_tier.tiers[] has no cost_usd of its own, so it is the sum of its models'
 * cost_usd. A model with no cost or with unmeasured runs is said so beside the figure; nothing unserved is added in,
 * and a partial sum is never shown as the route's total.
 */
function routeCost(tier: Row): { text: string; usd: string | null } {
  const models = Array.isArray(tier.models) ? records(tier.models) : [];
  const costs: string[] = [];
  let unmeasured = 0;
  let unknownGap = false;
  for (const model of models) {
    const value = sumDashboardUsd([model.cost_usd]);
    const missing = value === null;
    const runs = typeof model.unmeasured_cost_count === 'number' && model.unmeasured_cost_count >= 0 ? model.unmeasured_cost_count : null;
    if (value !== null) costs.push(value);
    if (runs !== null) unmeasured += runs;
    if (missing && (runs === null || runs === 0)) unknownGap = true;
    if (!missing && runs === null) unknownGap = true;
  }
  const gap = unmeasured > 0 ? `${formatDashboardCount(unmeasured)} unmeasured` : unknownGap ? 'some runs unmeasured' : null;
  const total = sumDashboardUsd(costs);
  if (total === null) return { usd: null, text: gap === null ? 'Not measured' : `Not measured · ${gap}` };
  return { usd: total, text: gap === null ? money(total) : `${money(total)} measured · ${gap}` };
}

interface RouteRow { key: string; route: string; tier: string; runs: number | null; share: number | null; cost: { text: string; usd: string | null }; tierRouted: boolean }

function routeSpendByTier(row: Row): RouteRow[] {
  const byTier = row.by_tier;
  if (byTier === null || typeof byTier !== 'object' || Array.isArray(byTier)) return [];
  const tiers = (byTier as Row).tiers;
  return Array.isArray(tiers) ? records(tiers).map((tier, index) => {
    const name = typeof tier.cost_tier_name === 'string' ? tier.cost_tier_name : '';
    return {
      key: `${name}-${index}`,
      tier: name,
      route: name ? tierLabel(name) : 'Not recorded',
      runs: typeof tier.count === 'number' ? tier.count : null,
      share: typeof tier.pct_of_tier_routed === 'number' ? tier.pct_of_tier_routed : null,
      cost: routeCost(tier),
      // Part 17 AC115: runs outside the tier routing have no share of the tier-routed runs.
      tierRouted: (tier.tier_routed === true || tier.tier_routed === 1) && name !== 'not_tier_routed',
    };
  }) : [];
}

function SpendByModel({ data }: { data: UsageAggregates }) {
  // OMN-21166 AC64: ranked bars, one per model; a model whose spend is not measured is drawn as not measured, never $0.00.
  const priced = data.models.filter(model => model.measuredCost !== null);
  const totalUsd = sumDashboardUsd(priced.map(model => model.measuredCostUsd));
  const gaps = data.models.filter(model => model.unmeasuredCalls !== 0);
  return (
    <figure className="local-chart usage-insight" aria-label="Spend by model">
      <h3><ConceptIcon concept="spend-model" size={16} />Spend by model</h3>
      {priced.length === 0 && <p role="status" className="ins-readout">No measured model spend served</p>}
      <RankedBars layout="vertical" label="Measured spend per model" unit={totalUsd === null ? 'USD · measured spend' : `USD · measured spend · ${money(totalUsd)} in all`}
        items={data.models.map(model => ({
          key: model.model, name: model.model, value: model.measuredCost, basis: 'measured',
          display: model.measuredCost === null ? 'Not measured' : money(model.measuredCostUsd), color: modelColor(model.model),
          // Part 29 AC193: each model opens Runs filtered to it.
          href: `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, model: model.model })}`, opensLabel: `Opens Runs filtered to ${model.model}`,
        }))}
        footnote={gaps.length > 0 ? gaps.map(model => `${model.model}: ${model.unmeasuredCalls === null ? 'unmeasured runs not recorded' : `${count(model.unmeasuredCalls)} unmeasured`}`).join(' · ') : undefined} />
      <p className="local-dashboard-caption">Measured spend only, summed from the latest {USAGE_WINDOW_DAYS} UTC days of served usage rows.</p>
    </figure>
  );
}

/**
 * OMN-21166 AC60, reworked by part 17 AC113: cost per run as hatched day bars in the Overview day-chart look, one per
 * served UTC day in the cost colour, its value on hover or focus. Each day's accessible name carries the full sentence
 * (cost per call and unmeasured calls); a day with no measured call draws no bar.
 */
function CostPerRun({ data, titled }: { data: UsageAggregates; titled: boolean }) {
  const date = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const text = (day: UsageAggregates['days'][number]) => `${day.day} · measured cost per call ${money(day.measuredCostPerCallUsd)} · ${count(day.unmeasuredCalls)} unmeasured calls`;
  const shown = data.days.filter(day => day.measuredCalls !== null || day.unmeasuredCalls !== null);
  const value = (day: UsageAggregates['days'][number]) => {
    const n = Number(day.measuredCostPerCallUsd);
    return day.measuredCostPerCallUsd === null || !Number.isFinite(n) ? null : n;
  };
  return <figure className="local-chart usage-insight" aria-label="Cost per run">
    {titled && <h3><ConceptIcon concept="cost-per-run" size={16} />Cost per run</h3>}
    <GroupedBars label="Cost per run by UTC day" groups={shown.map(day => ({
      key: day.day, name: date(day.day), label: text(day),
      values: [{ key: 'cost', value: value(day), display: value(day) === null ? 'Not measured' : money(day.measuredCostPerCallUsd), color: 'var(--field-cost)', tone: 'cost' }],
    }))} />
    <figcaption className="local-dashboard-caption">Measured spend divided by calls with measured cost; unmeasured calls are left out.</figcaption>
  </figure>;
}

/** Part 17 AC114: tokens in and out per model as hatched grouped bars; a count not recorded draws no bar. */
function TokensByModel({ data, titled }: { data: UsageAggregates; titled: boolean }) {
  const words = (value: number | null) => (value === null ? 'Not recorded' : formatFullCount(value));
  return <figure className="local-chart usage-insight" aria-label="Tokens in vs out by model">
    {titled && <h3><ConceptIcon concept="tokens-model" size={16} />Tokens in vs out by model</h3>}
    {data.models.length === 0 ? <p role="status" className="local-dashboard-empty">No token data available</p> : (
      <GroupedBars label="Token counts by model" wrapNames
        legend={[{ label: 'Tokens in', color: 'var(--field-tokens-in)' }, { label: 'Tokens out', color: 'var(--field-tokens-out)' }]}
        groups={data.models.map(model => ({
          key: model.model, name: model.model, nameColor: modelColor(model.model),
          label: `${model.model}: ${words(model.inputTokens)} tokens in, ${words(model.outputTokens)} tokens out`,
          values: [
            { key: 'in', value: model.inputTokens, display: words(model.inputTokens), color: 'var(--field-tokens-in)', tone: 'tokens-in' },
            { key: 'out', value: model.outputTokens, display: words(model.outputTokens), color: 'var(--field-tokens-out)', tone: 'tokens-out' },
          ],
        }))} />
    )}
  </figure>;
}

export function UsageInsights({ usageRows, decisionRows, routingRows, now = Date.now(), part = 'all' }: {
  usageRows: readonly unknown[]; decisionRows: readonly unknown[]; routingRows: readonly unknown[]; now?: number;
  /** 'spend' is Spend by model; part 17: each "More usage" chart is its own panel, so each is its own part. */
  part?: 'all' | 'spend' | 'cost-per-run' | 'tokens-by-model' | 'cost-by-route' | 'analysis';
}) {
  const data = aggregateUsageRows(usageRows, decisionRows, now, USAGE_WINDOW_DAYS);
  const routing = routeSpendByTier(records(routingRows)[0] ?? {});
  // A part sits in a panel whose title names it, so it draws no heading of its own.
  // Part 29 AC194, AC195: the analysis of the served decisions, its own full-row panel (AC89).
  if (part === 'analysis') return <section className="usage-insights" aria-label="Usage insights"><UsageAnalysis decisionRows={decisionRows} /></section>;
  if (part === 'spend') return <section className="usage-insights" aria-label="Usage insights"><SpendByModel data={data} /></section>;
  if (part === 'cost-per-run') return <section className="usage-insights" aria-label="Usage insights"><CostPerRun data={data} titled={false} /></section>;
  if (part === 'tokens-by-model') return <section className="usage-insights" aria-label="Usage insights"><TokensByModel data={data} titled={false} /></section>;
  if (part === 'cost-by-route') return <section className="usage-insights" aria-label="Usage insights"><CostByRoute routing={routing} titled={false} /></section>;
  return <section className="usage-insights" aria-label="Usage insights">
    <h3 className="local-dashboard-caption">Latest {USAGE_WINDOW_DAYS} UTC days · counted from served usage rows</h3>
    <div className="usage-insight-grid"><SpendByModel data={data} /></div>
    {/* OMN-21166 part 13: cost per run, tokens by model and cost by route are one click away. */}
    <details className="local-more">
    <summary>More usage</summary>
    <CostPerRun data={data} titled /><TokensByModel data={data} titled /><CostByRoute routing={routing} titled />
    </details>
  </section>;
}

/**
 * Part 17 AC115: each tier-routed route's served cost as a hatched ranked bar, its runs and share in the bar's name and on
 * hover; runs outside the tier routing are a count under the chart, with no share (they are outside the tier shares).
 */
function CostByRoute({ routing, titled }: { routing: RouteRow[]; titled: boolean }) {
  const routed = routing.filter(row => row.tierRouted);
  const outside = routing.filter(row => !row.tierRouted);
  return (
    <section className="local-chart usage-cost-by-route" aria-label="Cost by route">
      {titled && <h3><ConceptIcon concept="cost-route" size={16} />Cost by route</h3>}
      {routing.length === 0 ? <p className="local-dashboard-caption" role="status">Route cost is not served yet.</p> : <>
        <RankedBars layout="vertical" label="Cost per route" unit="USD · measured cost per route" order="desc"
          items={routed.map(row => {
            const value = row.cost.usd === null ? null : Number(row.cost.usd);
            return { key: row.key, name: row.route, basis: 'measured' as const, color: tierColor(row.tier),
              value: value !== null && Number.isFinite(value) ? value : null,
              display: `${row.cost.text} · ${count(row.runs)} runs · ${share(row.share)}` };
          })} />
        {outside.map(row => <p key={row.key} className="local-dashboard-caption">{`${count(row.runs)} runs not tier-routed (${row.cost.text}), outside the tier shares`}</p>)}
      </>}
    </section>
  );
}
