import { useMemo, useState } from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { resolveEffectiveDataSource } from '@/data-source/data-source-override';
import { TOPICS } from '@shared/types/topics';
import {
  formatUsd,
  formatUsdAxis,
  formatCompact,
  formatPct,
  formatShortDate,
} from './dashboard/lib/format';
import type { DelegationSavingsProjection, SavingsSeriesPoint, TokenUsageProjection } from './dashboard/types';
import '@/styles/savings-dashboard.css';

/** Spend vs premium baseline over time: two lines with the savings band filled. */
function SpendChart({ series }: { series: SavingsSeriesPoint[] }) {
  if (series.length < 2) return null;
  const n = series.length;
  const maxBaseline = Math.max(...series.map((p) => p.baseline_cost_usd), 1);
  const niceMax = Math.ceil(maxBaseline / 2000) * 2000;
  const yTicks = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0];

  const xPct = (i: number) => (i / (n - 1)) * 100;
  const yPct = (v: number) => 100 - (v / niceMax) * 100;
  const top = series.map((p, i) => `${xPct(i).toFixed(2)},${yPct(p.baseline_cost_usd).toFixed(2)}`);
  const bottom = series.map((p, i) => `${xPct(i).toFixed(2)},${yPct(p.actual_cost_usd).toFixed(2)}`);
  const areaPath = `M ${top.join(' L ')} L ${[...bottom].reverse().join(' L ')} Z`;

  return (
    <div className="sot-chart-wrap">
      <div className="sot-yaxis">
        {yTicks.map((v) => <Text key={v} as="span" size="xs" color="tertiary">{formatUsdAxis(v)}</Text>)}
      </div>
      <div className="sot-plot">
        <svg className="sot-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Actual cost and premium baseline cost per week">
          {yTicks.map((v) => (
            <line key={v} className="sot-grid" x1="0" x2="100" y1={yPct(v)} y2={yPct(v)} vectorEffect="non-scaling-stroke" />
          ))}
          <path className="sot-area" d={areaPath} />
          <polyline className="sot-line-baseline" points={top.join(' ')} vectorEffect="non-scaling-stroke" />
          <polyline className="sot-line-actual" points={bottom.join(' ')} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="sot-xaxis">
        {series.map((p) => <Text key={p.bucket} as="span" size="xs" color="tertiary">{formatShortDate(p.bucket)}</Text>)}
      </div>
    </div>
  );
}

/** Tier mix over time: 100%-stacked columns, one per bucket. */
function TierMixColumns({ series }: { series: SavingsSeriesPoint[] }) {
  return (
    <div className="sot-stack">
      {series.map((p) => (
        <div key={p.bucket} className="sot-col">
          <div className="sot-stackwrap">
            <div className="sot-seg sot-seg-prem" style={{ height: `${p.prem_pct * 100}%` }} title={`Premium ${formatPct(p.prem_pct)}`} />
            <div className="sot-seg sot-seg-cheap" style={{ height: `${p.cheap_pct * 100}%` }} title={`Cheap cloud ${formatPct(p.cheap_pct)}`} />
            <div className="sot-seg sot-seg-local" style={{ height: `${p.local_pct * 100}%` }} title={`Local ${formatPct(p.local_pct)}`} />
          </div>
          <Text as="div" size="xs" color="tertiary" className="sot-xlabel">{formatShortDate(p.bucket)}</Text>
        </div>
      ))}
    </div>
  );
}

function ARow({ k, tag, v }: { k: string; tag?: string; v: string }) {
  return (
    <div className="sot-arow">
      <Text as="span" size="lg" color="secondary">{k}{tag ? <Text as="span" size="sm" color="tertiary"> {tag}</Text> : null}</Text>
      <Text as="span" size="lg" color="primary" weight="semibold">{v}</Text>
    </div>
  );
}

export function SavingsOverTimePage() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const openHowCalc = useFrameStore((s) => s.openHowCalc);
  const { data: savingsData, isLoading, error } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['dashboard', 'savings'],
    topic: TOPICS.delegationSavings,
  });
  const { data: tokensData } = useProjectionQuery<TokenUsageProjection>({
    queryKey: ['dashboard', 'token-usage'],
    topic: TOPICS.delegationTokenUsage,
  });
  const savings = savingsData?.[0];
  const tokens = tokensData?.[0];
  const series = savings?.series;
  const isSample = resolveEffectiveDataSource().mode === 'file';

  const derived = useMemo(() => {
    if (!savings || !series || series.length === 0) return null;
    const last = series[series.length - 1];
    const windowLabel = `${formatShortDate(series[0].bucket)} to ${formatShortDate(last.bucket)}, 2026`;
    let maxInc = -Infinity;
    let maxBucket = last.bucket;
    for (let i = 1; i < series.length; i++) {
      const inc = series[i].savings_usd - series[i - 1].savings_usd;
      if (inc > maxInc) { maxInc = inc; maxBucket = series[i].bucket; }
    }
    const tokensUsed = tokens ? formatCompact(tokens.total_tokens) : '—';
    const tokensSaved = tokens && tokens.total_tokens_saved !== undefined ? formatCompact(tokens.total_tokens_saved) : '—';
    const copyText = [
      `Omninode delegation savings, ${windowLabel} (weekly buckets).`,
      `Estimated savings: ${formatUsd(savings.cumulative_savings_usd)}.`,
      `If all premium: ${formatUsd(savings.cumulative_cloud_cost_usd)} (estimate). Actually spent: ${formatUsd(savings.cumulative_local_cost_usd)}.`,
      `Tokens: ${tokensUsed} used, ${tokensSaved} saved (baseline-token equivalent).`,
      `Tier mix (latest week): Local ${formatPct(last.local_pct)} / Cheap cloud ${formatPct(last.cheap_pct)} / Premium ${formatPct(last.prem_pct)}.`,
      `Basis: estimate against ${savings.baseline_model} at list price; the premium price avoided, not a billed charge.`,
      isSample ? 'Sample data.' : '',
    ].filter(Boolean).join('\n');
    return { last, windowLabel, maxInc, maxBucket, tokensUsed, tokensSaved, copyText };
  }, [savings, series, tokens, isSample]);

  const [copied, setCopied] = useState(false);
  const copyPeriod = () => {
    if (derived && navigator.clipboard) {
      void navigator.clipboard.writeText(derived.copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="dash-body">
      <div className="sd-page">
        <button type="button" className="tl-back" onClick={() => setActivePage('dashboard')}>← Back to dashboard</button>

        <div className="sot-head">
          <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Savings over time</Text>
          <Heading level={2} size="4xl" color="primary">Savings and tier mix across the period</Heading>
          <Text as="p" size="md" color="tertiary" className="sot-sub">
            The shape behind the dashboard&apos;s savings number: how much was saved over the window, and how the work split across delegation tiers (Local, Cheap cloud, Premium).
          </Text>
        </div>

        {isLoading ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">Loading…</Text>
        ) : error ? (
          <Text as="div" size="lg" color="bad" className="tl-state">Couldn&apos;t load savings: {error.message}</Text>
        ) : !savings || !series || !derived ? (
          <Text as="div" size="lg" color="tertiary" className="tl-state">No savings history for this period yet.</Text>
        ) : (
          <>
            <Text as="p" size="sm" color="tertiary" className="sot-window">
              Showing <strong>{derived.windowLabel}</strong> in weekly buckets. Time-range and compare controls are deferred until the projections support windowed queries.
            </Text>

            {/* PANEL 0 — the lead answer */}
            <section className="sd-card sot-answer">
              <div className="sot-answer-eyebrow">
                <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Estimated savings, this period</Text>
                {isSample && <span className="sd-sample"><Text as="span" size="xs" weight="semibold" color="warn">Sample data</Text></span>}
              </div>
              <div className="sot-answer-grid">
                <div>
                  <div className="sd-bignum">{formatUsd(savings.cumulative_savings_usd)}</div>
                  <Text as="p" size="sm" color="tertiary" className="sot-estlabel">
                    An estimate against {savings.baseline_model} at list price. It is the premium price that was avoided, not a charge that was billed.
                  </Text>
                </div>
                <div className="sot-side">
                  <ARow k="If all premium" tag="(estimate)" v={formatUsd(savings.cumulative_cloud_cost_usd)} />
                  <ARow k="Actually spent" v={formatUsd(savings.cumulative_local_cost_usd)} />
                  <ARow k="Saved" tag="(the gap)" v={formatUsd(savings.cumulative_savings_usd)} />
                  <div className="sot-arow-divider">
                    <ARow k="Tokens used" v={derived.tokensUsed} />
                    <ARow k="Tokens saved" tag="(baseline equiv.)" v={derived.tokensSaved} />
                  </div>
                  <div className="sot-actions">
                    <button type="button" className="sd-linkbtn" onClick={openHowCalc}>How is this calculated?</button>
                    <button type="button" className="sd-show-more" onClick={copyPeriod}>
                      <Text as="span" size="md" weight="semibold" color="secondary">{copied ? 'Copied ✓' : 'Copy this period'}</Text>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* PANEL A — spend vs baseline */}
            <section className="sd-card sot-panel">
              <Text as="div" size="xl" weight="semibold" color="primary">Spend against the premium baseline</Text>
              <Text as="p" size="sm" color="tertiary" className="sot-panel-sub">
                Actual cost and the premium baseline cost per week. The band between the lines is the saving.
              </Text>
              <SpendChart series={series} />
              <div className="sot-linekey">
                <span className="sot-key"><span className="sot-keyline sot-keyline-dash" /><Text as="span" size="sm" color="secondary">Premium baseline (estimate)</Text></span>
                <span className="sot-key"><span className="sot-keyline" /><Text as="span" size="sm" color="secondary">Actual cost</Text></span>
                <span className="sot-key"><span className="sot-keyarea" /><Text as="span" size="sm" color="secondary">Savings between the lines</Text></span>
              </div>
              <Text as="p" size="sm" color="tertiary" className="sot-estnote">
                The premium line prices each task&apos;s tokens at {savings.baseline_model}&apos;s list rate. That model was not run when a cheaper tier served the task, so it is not an incurred charge.
              </Text>
            </section>

            {/* worst-interval callout */}
            <div className="sot-callout">
              <Text as="span" size="sm" color="secondary">
                <strong>Largest single-interval change:</strong> savings rose most in the week of {formatShortDate(derived.maxBucket)} (about +{formatUsd(derived.maxInc)}).
              </Text>
            </div>

            {/* PANEL B — tier mix over time */}
            <section className="sd-card sot-panel">
              <Text as="div" size="xl" weight="semibold" color="primary">Tier mix over time</Text>
              <Text as="p" size="sm" color="tertiary" className="sot-panel-sub">
                Where the saving comes from: more work on free local tiers means more saved. Each column is the share of tasks per tier, normalized to 100%.
              </Text>
              <TierMixColumns series={series} />
              <div className="sot-legend">
                <span className="sot-leg"><span className="sot-sw sot-seg-local" /><Text as="span" size="sm" color="secondary">Local (free)</Text></span>
                <span className="sot-leg"><span className="sot-sw sot-seg-cheap" /><Text as="span" size="sm" color="secondary">Cheap cloud</Text></span>
                <span className="sot-leg"><span className="sot-sw sot-seg-prem" /><Text as="span" size="sm" color="secondary">Premium</Text></span>
              </div>
              <Text as="p" size="sm" color="tertiary" className="sot-caption">
                Each column counts the tier that served the final answer. Share-of-spend (re-normalizing by cost) is a later add.
              </Text>
            </section>

            {/* deferred B6 */}
            <section className="rd-deferred sot-deferred">
              <div className="rd-deferred-head">
                <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Cost over time by serving model</Text>
                <span className="rd-deferred-tag"><Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">Deferred · B6</Text></span>
              </div>
              <div className="rd-deferred-body">
                <Text as="div" size="md" color="tertiary">Not available yet.</Text>
                <Text as="div" size="sm" color="tertiary" className="rd-deferred-muted">
                  Splitting cost by the model that served each task needs a by-model time series. The raw per-task records exist, but the projection that serves this view isn&apos;t built yet.
                </Text>
              </div>
              <div className="rd-deferred-strip" aria-hidden="true" />
            </section>

            <Text as="p" size="sm" color="tertiary" className="rd-footnote">
              Both panels read the same window. This view is a snapshot from when it loaded. When a projection reports no live data, its panel shows clearly labeled sample data, not zeros.
            </Text>
          </>
        )}
      </div>
    </div>
  );
}
