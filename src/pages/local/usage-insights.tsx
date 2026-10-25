import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
import { modelColor } from '@/lib/dashboard-colors';
import { formatDashboardUsd } from '@/lib/dashboard-currency';
import { sumDashboardUsd } from '@/lib/dashboard-money-total';
import { useState } from 'react';
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
function routeCost(tier: Row): string {
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
  if (total === null) return gap === null ? 'Not measured' : `Not measured · ${gap}`;
  return gap === null ? money(total) : `${money(total)} measured · ${gap}`;
}

function routeSpendByTier(row: Row): Array<{ route: string; runs: string; share: string; cost: string }> {
  const byTier = row.by_tier;
  if (byTier === null || typeof byTier !== 'object' || Array.isArray(byTier)) return [];
  const tiers = (byTier as Row).tiers;
  return Array.isArray(tiers) ? records(tiers).map(tier => {
    const cost = routeCost(tier);
    return {
      route: typeof tier.cost_tier_name === 'string' ? tierLabel(tier.cost_tier_name) : 'Not recorded',
      runs: count(typeof tier.count === 'number' ? tier.count : null),
      share: share(typeof tier.pct_of_tier_routed === 'number' ? tier.pct_of_tier_routed : null),
      cost,
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
      <RankedBars label="Measured spend per model" unit={totalUsd === null ? 'USD · measured spend' : `USD · measured spend · ${money(totalUsd)} in all`}
        items={data.models.map(model => ({
          key: model.model, name: model.model, value: model.measuredCost, basis: 'measured',
          display: model.measuredCost === null ? 'Not measured' : money(model.measuredCostUsd), color: modelColor(model.model),
        }))}
        footnote={gaps.length > 0 ? gaps.map(model => `${model.model}: ${model.unmeasuredCalls === null ? 'unmeasured runs not recorded' : `${count(model.unmeasuredCalls)} unmeasured`}`).join(' · ') : undefined} />
      <p className="local-dashboard-caption">Measured spend only, summed from the latest {USAGE_WINDOW_DAYS} UTC days of served usage rows.</p>
    </figure>
  );
}

/**
 * OMN-21166 AC60: cost per run as one compact bar per UTC day (bar height is that day's served measured cost per call
 * against the highest day's, layout only), its value above and its date below; the full sentence stays in each bar's
 * accessible label and the readout. A day with no measured call draws no bar and says so.
 */
function CostPerRun({ data }: { data: UsageAggregates }) {
  const [active, setActive] = useState<string | null>(null);
  const activeDay = data.days.find(day => day.day === active);
  const date = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const text = (day: UsageAggregates['days'][number]) => `${day.day} · measured cost per call ${money(day.measuredCostPerCallUsd)} · ${count(day.unmeasuredCalls)} unmeasured calls`;
  const shown = data.days.filter(day => day.measuredCalls !== null || day.unmeasuredCalls !== null);
  const value = (day: UsageAggregates['days'][number]) => {
    const n = Number(day.measuredCostPerCallUsd);
    return day.measuredCostPerCallUsd === null || !Number.isFinite(n) ? null : n;
  };
  const max = Math.max(0, ...shown.map(value).filter((n): n is number => n !== null));
  return <figure className="local-chart usage-insight" aria-label="Cost per run">
    <h3><ConceptIcon concept="cost-per-run" size={16} />Cost per run</h3>
    <p role="status" className="ins-readout">{activeDay ? text(activeDay) : 'Measured cost per call; unmeasured calls are excluded from the denominator'}</p>
    <div className="usage-cost-days usage-cost-bars" role="group" aria-label="Cost per run by UTC day">
      {shown.map(day => {
        const n = value(day);
        return <button type="button" key={day.day} aria-label={text(day)} aria-pressed={active === day.day} onMouseEnter={() => setActive(day.day)} onFocus={() => setActive(day.day)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
          <span className="usage-cost-value">{n === null ? 'Not measured' : money(day.measuredCostPerCallUsd)}</span>
          <span className="usage-cost-track" aria-hidden="true">{n !== null && <i style={{ height: `${max > 0 ? Math.max(2, (n / max) * 100) : 2}%` }} />}</span>
          <strong>{date(day.day)}</strong>
          {day.unmeasuredCalls !== null && day.unmeasuredCalls > 0 && <span className="usage-cost-unmeasured">{day.unmeasuredCalls} unmeasured calls excluded</span>}
        </button>;
      })}
    </div>
    <figcaption>Cost per call = measured spend divided by calls with measured cost.</figcaption>
  </figure>;
}

function TokensByModel({ data }: { data: UsageAggregates }) {
  const [active, setActive] = useState<string | null>(null);
  const selected = data.models.find(model => model.model === active);
  const tokenCounts = data.models.flatMap(model => [model.inputTokens, model.outputTokens])
    .filter((value): value is number => value !== null);
  const max = Math.max(1, ...tokenCounts);
  return <figure className="local-chart usage-insight" aria-label="Tokens in vs out by model">
    <h3><ConceptIcon concept="tokens-model" size={16} />Tokens in vs out by model</h3>
    {(selected || data.models.length === 0) && <p role="status" className="ins-readout">{selected ? `${selected.model} · ${(selected.inputTokens === null ? 'Not recorded' : formatFullCount(selected.inputTokens))} tokens in · ${(selected.outputTokens === null ? 'Not recorded' : formatFullCount(selected.outputTokens))} tokens out` : 'No token data available'}</p>}
    <div className="usage-token-models" role="group" aria-label="Token counts by model">
      {data.models.map(model => <button type="button" key={model.model} aria-label={`${model.model}: ${(model.inputTokens === null ? 'Not recorded' : formatFullCount(model.inputTokens))} tokens in, ${(model.outputTokens === null ? 'Not recorded' : formatFullCount(model.outputTokens))} tokens out`} onMouseEnter={() => setActive(model.model)} onFocus={() => setActive(model.model)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
        <strong>{model.model}</strong><span className="usage-token-pair">
          {model.inputTokens === null ? <span className="usage-token-missing">In not recorded</span> : <i data-field-tone="tokens-in" data-direction="in" style={{ width: `${model.inputTokens / max * 100}%` }} />}
          {model.outputTokens === null ? <span className="usage-token-missing">Out not recorded</span> : <i data-field-tone="tokens-out" data-direction="out" style={{ width: `${model.outputTokens / max * 100}%` }} />}
        </span>
        <span>{(model.inputTokens === null ? 'Not recorded' : formatFullCount(model.inputTokens))} tokens in · {(model.outputTokens === null ? 'Not recorded' : formatFullCount(model.outputTokens))} tokens out</span>
      </button>)}
    </div>
  </figure>;
}

export function UsageInsights({ usageRows, decisionRows, routingRows, now = Date.now(), part = 'all' }: {
  usageRows: readonly unknown[]; decisionRows: readonly unknown[]; routingRows: readonly unknown[]; now?: number;
  /** OMN-21166 Maple grid: 'spend' is the spend-by-model panel; 'more' is the rest, under the page's "More usage". */
  part?: 'all' | 'spend' | 'more';
}) {
  const data = aggregateUsageRows(usageRows, decisionRows, now, USAGE_WINDOW_DAYS);
  const routing = routeSpendByTier(records(routingRows)[0] ?? {});
  if (part === 'spend') return <section className="usage-insights" aria-label="Usage insights"><SpendByModel data={data} /></section>;
  if (part === 'more') return <section className="usage-insights" aria-label="Usage insights">
    <div className="usage-insight-grid"><CostPerRun data={data} /><TokensByModel data={data} /></div>
    <CostByRoute routing={routing} />
  </section>;
  return <section className="usage-insights" aria-label="Usage insights">
    <h3 className="local-dashboard-caption">Latest {USAGE_WINDOW_DAYS} UTC days · counted from served usage rows</h3>
    <div className="usage-insight-grid"><SpendByModel data={data} /></div>
    {/* OMN-21166 part 13: cost per run, tokens by model and cost by route are one click away. */}
    <details className="local-more">
    <summary>More usage</summary>
    <div className="usage-insight-grid"><CostPerRun data={data} /><TokensByModel data={data} /></div>
    <CostByRoute routing={routing} />
    </details>
  </section>;
}

function CostByRoute({ routing }: { routing: ReturnType<typeof routeSpendByTier> }) {
  return (
    <section className="local-chart usage-cost-by-route" aria-label="Cost by route">
      <h3 className="local-dashboard-caption"><ConceptIcon concept="cost-route" size={16} />Cost by route</h3>
      {routing.length === 0 ? <p className="local-dashboard-caption" role="status">Route cost is not served yet.</p> : <dl className="local-dashboard-fields local-routing-counts">{routing.map(row => <div key={row.route}><dt>{row.route}</dt><dd>{row.runs} runs · {row.share}</dd><dd>{row.cost}</dd></div>)}</dl>}
      <p role="status">Savings by route is not served yet</p>
    </section>
  );
}
