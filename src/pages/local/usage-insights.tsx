import { useState } from 'react';
import { aggregateUsageRows, type UsageAggregates, type UsageModelAggregate } from './insight-aggregates';

const USAGE_WINDOW_DAYS = 30;

type Row = Record<string, unknown>;

function records(rows: readonly unknown[]): Row[] {
  return rows.filter((row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row));
}

function money(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'Not measured' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function count(value: number | null): string {
  return value === null ? 'Not recorded' : value.toLocaleString('en-US');
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
  let total = 0;
  let priced = 0;
  let unmeasured = 0;
  let unknownGap = false;
  for (const model of models) {
    const raw = model.cost_usd;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : null;
    const missing = value === null || !Number.isFinite(value);
    const finite = value !== null && Number.isFinite(value) ? value : null;
    const runs = typeof model.unmeasured_cost_count === 'number' && model.unmeasured_cost_count >= 0 ? model.unmeasured_cost_count : null;
    if (finite !== null) { total += finite; priced += 1; }
    if (runs !== null) unmeasured += runs;
    if (missing && (runs === null || runs === 0)) unknownGap = true;
    if (!missing && runs === null) unknownGap = true;
  }
  const gap = unmeasured > 0 ? `${unmeasured} unmeasured` : unknownGap ? 'some runs unmeasured' : null;
  if (priced === 0) return gap === null ? 'Not measured' : `Not measured · ${gap}`;
  return gap === null ? money(total) : `${money(total)} measured · ${gap}`;
}

function routeSpendByTier(row: Row): Array<{ route: string; runs: string; share: string; cost: string }> {
  const byTier = row.by_tier;
  if (byTier === null || typeof byTier !== 'object' || Array.isArray(byTier)) return [];
  const tiers = (byTier as Row).tiers;
  return Array.isArray(tiers) ? records(tiers).map(tier => {
    const cost = routeCost(tier);
    return {
      route: typeof tier.cost_tier_name === 'string' ? tier.cost_tier_name : 'Not recorded',
      runs: count(typeof tier.count === 'number' ? tier.count : null),
      share: share(typeof tier.pct_of_tier_routed === 'number' ? tier.pct_of_tier_routed : null),
      cost,
    };
  }) : [];
}

function SpendByModel({ data }: { data: UsageAggregates }) {
  const [active, setActive] = useState<string | null>(null);
  const priced = data.models.filter(model => model.measuredCost !== null);
  const total = priced.reduce((sum, model) => sum + model.measuredCost!, 0);
  const hasMeasured = priced.length > 0;
  let offset = 0;
  const colors = ['#B77CFF', '#4BB7F2', '#F0B44B', '#56C79A', '#F27886', '#5BD0D0', '#A9C56C', '#E782D1'];
  const gradient = priced.map((model, index) => {
    const start = offset;
    const amount = total > 0 ? model.measuredCost! / total * 100 : 0;
    offset += amount;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  }).join(', ');
  const selection = priced.find(model => model.model === active) ?? null;
  const detail = (model: UsageModelAggregate) => `${model.model}: ${money(model.measuredCost)} · ${share(total > 0 && model.measuredCost !== null ? model.measuredCost / total : null)} of measured spend · ${count(model.unmeasuredCalls)} unmeasured calls`;
  return (
    <figure className="local-chart usage-insight" aria-label="Spend by model">
      <h3>Spend by model</h3>
      <p role="status" className="ins-readout">{selection ? detail(selection) : priced.length ? 'Hover or tab through a model to inspect measured spend' : 'No measured model spend served'}</p>
      <div className="usage-spend-models">
        <div className="usage-donut" aria-hidden="true" style={{ background: total > 0 ? `conic-gradient(${gradient})` : 'var(--line-subtle)' }}><span>{money(hasMeasured ? total : null)}</span></div>
        <div className="usage-model-legend" role="group" aria-label="Spend by model legend">
          {data.models.map((model, index) => <button type="button" key={model.model} aria-label={detail(model)} onMouseEnter={() => setActive(model.model)} onFocus={() => setActive(model.model)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
            <i aria-hidden="true" style={{ background: colors[index % colors.length] }} />{model.model}<strong>{money(model.measuredCost)}</strong><span>{count(model.unmeasuredCalls)} unmeasured</span>
          </button>)}
        </div>
      </div>
      <figcaption>Measured spend only, summed from the latest {USAGE_WINDOW_DAYS} UTC days of served usage rows.</figcaption>
    </figure>
  );
}

function CostPerRun({ data }: { data: UsageAggregates }) {
  const [active, setActive] = useState<string | null>(null);
  const activeDay = data.days.find(day => day.day === active);
  const date = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const text = (day: UsageAggregates['days'][number]) => `${day.day} · measured cost per call ${money(day.measuredCostPerCall)} · ${count(day.unmeasuredCalls)} unmeasured calls`;
  return <figure className="local-chart usage-insight" aria-label="Cost per run">
    <h3>Cost per run</h3>
    <p role="status" className="ins-readout">{activeDay ? text(activeDay) : 'Measured cost per call; unmeasured calls are excluded from the denominator'}</p>
    <div className="usage-cost-days" role="group" aria-label="Cost per run by UTC day">
      {data.days.filter(day => day.measuredCalls !== null || day.unmeasuredCalls !== null).map(day => <button type="button" key={day.day} aria-label={text(day)} onMouseEnter={() => setActive(day.day)} onFocus={() => setActive(day.day)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
        <strong>{date(day.day)}</strong><span>Paid / measured call: {money(day.measuredCostPerCall)}</span>
        {day.unmeasuredCalls !== null && day.unmeasuredCalls > 0 && <span>{day.unmeasuredCalls} unmeasured calls excluded</span>}
      </button>)}
    </div>
    <p className="local-dashboard-caption">Where served, all-cloud daily values appear in the metering panel.</p>
    <figcaption>Cost per call = measured spend divided by calls with measured cost. Daily totals are not written back.</figcaption>
  </figure>;
}

function TokensByModel({ data }: { data: UsageAggregates }) {
  const [active, setActive] = useState<string | null>(null);
  const selected = data.models.find(model => model.model === active);
  const tokenCounts = data.models.flatMap(model => [model.inputTokens, model.outputTokens])
    .filter((value): value is number => value !== null);
  const max = Math.max(1, ...tokenCounts);
  return <figure className="local-chart usage-insight" aria-label="Tokens in vs out by model">
    <h3>Tokens in vs out by model</h3>
    <p role="status" className="ins-readout">{selected ? `${selected.model} · ${count(selected.inputTokens)} tokens in · ${count(selected.outputTokens)} tokens out` : 'Hover or tab through a model to inspect token counts'}</p>
    <div className="usage-token-models" role="group" aria-label="Token counts by model">
      {data.models.map(model => <button type="button" key={model.model} aria-label={`${model.model}: ${count(model.inputTokens)} tokens in, ${count(model.outputTokens)} tokens out`} onMouseEnter={() => setActive(model.model)} onFocus={() => setActive(model.model)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
        <strong>{model.model}</strong><span className="usage-token-pair">
          {model.inputTokens === null ? <span className="usage-token-missing">In not recorded</span> : <i data-direction="in" style={{ width: `${model.inputTokens / max * 100}%` }} />}
          {model.outputTokens === null ? <span className="usage-token-missing">Out not recorded</span> : <i data-direction="out" style={{ width: `${model.outputTokens / max * 100}%` }} />}
        </span>
        <span>{count(model.inputTokens)} tokens in · {count(model.outputTokens)} tokens out</span>
      </button>)}
    </div>
    <figcaption>Input and output tokens remain separate; null counts are not drawn as zero.</figcaption>
  </figure>;
}

export function UsageInsights({ usageRows, decisionRows, routingRows, now = Date.now() }: {
  usageRows: readonly unknown[]; decisionRows: readonly unknown[]; routingRows: readonly unknown[]; now?: number;
}) {
  const data = aggregateUsageRows(usageRows, decisionRows, now, USAGE_WINDOW_DAYS);
  const routing = routeSpendByTier(records(routingRows)[0] ?? {});
  return <section className="usage-insights" aria-label="Usage insights">
    <h3 className="local-dashboard-caption">Latest {USAGE_WINDOW_DAYS} UTC days · counted from served usage rows</h3>
    <div className="usage-insight-grid"><SpendByModel data={data} /><CostPerRun data={data} /><TokensByModel data={data} /></div>
    <section className="local-chart usage-cost-by-route" aria-label="Cost by route">
      <h3 className="local-dashboard-caption">Cost by route</h3>
      {routing.length === 0 ? <p className="local-dashboard-caption" role="status">Route cost is not served yet.</p> : <dl className="local-dashboard-fields local-routing-counts">{routing.map(row => <div key={row.route}><dt>{row.route}</dt><dd>{row.runs} runs · {row.share}</dd><dd>{row.cost}</dd></div>)}</dl>}
      <p role="status">Savings by route is not served yet</p>
    </section>
  </section>;
}
