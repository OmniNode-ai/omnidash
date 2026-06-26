import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { SectionCard } from '../SectionCard';
import { formatCompact, formatShortDate } from '../lib/format';
import type { TokenUsageProjection, TokenSeriesPoint } from '../types';

/**
 * Dual-line trend: tokens used vs tokens saved over the period. Unlike the savings
 * sparkline (a deliberately axis-less glance cue), this is a real chart, so it
 * carries a date x-axis and a light token-scale y reference. The saved line is
 * DESIGN/FIXTURE DATA — there is no real projection for it (see types.ts). In live
 * mode the series is absent and the chart doesn't render, so nothing is fabricated
 * as real; the "Sample data" marker covers the fixture case.
 */
function TokensTrend({ series }: { series: TokenSeriesPoint[] }) {
  if (series.length < 2) return null;
  const n = series.length;

  // y scale: round the peak up to a tidy token mark, with a little headroom.
  const maxUsed = Math.max(...series.map((p) => p.tokens_used), 1);
  let niceMax = Math.ceil(maxUsed / 1_000_000) * 1_000_000;
  if (maxUsed / niceMax > 0.95) niceMax += 1_000_000;
  const yTicks = [niceMax, niceMax / 2, 0];

  const xPct = (i: number) => (i / (n - 1)) * 100;
  const yPct = (v: number) => 100 - (v / niceMax) * 100;
  const line = (key: 'tokens_used' | 'tokens_saved') =>
    series.map((p, i) => `${xPct(i).toFixed(2)},${yPct(p[key]).toFixed(2)}`).join(' ');

  // ~4 evenly spaced date ticks; step keeps them aligned to real buckets.
  const step = Math.max(1, Math.round((n - 1) / 3));
  const xIdx: number[] = [];
  for (let i = 0; i < n; i += step) xIdx.push(i);
  if (xIdx[xIdx.length - 1] !== n - 1) xIdx.push(n - 1);

  return (
    <div className="sd-tok-chart-wrap">
      <div className="sd-tok-yaxis">
        {yTicks.map((v) => (
          <Text key={v} as="span" size="xs" color="tertiary">{formatCompact(v)}</Text>
        ))}
      </div>
      <div className="sd-tok-plot">
        <svg className="sd-tok-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Tokens used and tokens saved over time">
          {yTicks.map((v) => (
            <line key={v} className="sd-tok-grid" x1="0" x2="100" y1={yPct(v)} y2={yPct(v)} vectorEffect="non-scaling-stroke" />
          ))}
          <polyline className="sd-tok-line-used" points={line('tokens_used')} vectorEffect="non-scaling-stroke" />
          <polyline className="sd-tok-line-saved" points={line('tokens_saved')} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="sd-tok-xaxis">
        {xIdx.map((i) => (
          <Text key={i} as="span" size="xs" color="tertiary">{formatShortDate(series[i].bucket)}</Text>
        ))}
      </div>
    </div>
  );
}

/**
 * The tokens band (Tony's request). "Tokens used" is real and metered. "Tokens
 * saved" and its trend line are fixture/design data pending a real projection
 * that, as expected, won't exist — the dashboard marks the whole band "Sample
 * data", and in live mode the saved figure falls back to "—" with no series.
 */
export function TokensSection() {
  const openHowCalc = useFrameStore((s) => s.openHowCalc);
  const { data, isLoading, error } = useProjectionQuery<TokenUsageProjection>({
    queryKey: ['dashboard', 'token-usage'],
    topic: TOPICS.delegationTokenUsage,
  });
  const p = data?.[0];

  return (
    <SectionCard
      eyebrow="Tokens this period"
      isLoading={isLoading}
      error={error}
      isEmpty={!p}
      sample={p?.provisioned === false}
      className="sd-tokens"
    >
      {p && (
        <>
          <div className="sd-tokrow">
            <div className="sd-tok">
              <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Tokens used</Text>
              <div className="sd-tok-val">{formatCompact(p.total_tokens)}</div>
              <Text as="div" size="sm" color="tertiary">Metered · input + output across all runs</Text>
            </div>
            <div className="sd-tok">
              <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold">Tokens saved</Text>
              <div className="sd-tok-val">
                {p.total_tokens_saved !== undefined ? formatCompact(p.total_tokens_saved) : '—'}
              </div>
              <Text as="div" size="sm" color="tertiary">
                vs premium baseline · <button type="button" className="sd-linkbtn" onClick={openHowCalc}>how is this counted?</button>
              </Text>
            </div>
          </div>

          {p.series && p.series.length > 1 && (
            <div className="sd-tok-trend">
              <TokensTrend series={p.series} />
              <div className="sd-tok-legend">
                <span className="sd-tok-leg"><span className="sd-tok-sw sd-tok-sw-used" /><Text as="span" size="sm" color="secondary">Tokens used</Text></span>
                <span className="sd-tok-leg"><span className="sd-tok-sw sd-tok-sw-saved" /><Text as="span" size="sm" color="secondary">Tokens saved</Text></span>
              </div>
            </div>
          )}

          <Text as="div" size="sm" color="tertiary" className="sd-tok-future">
            <Text as="span" size="sm" weight="semibold" color="secondary">Coming later: </Text>
            a &ldquo;fewer tokens&rdquo; lever (reusing generated nodes) will report real token reduction here, on top of today&apos;s cheaper-model savings.
          </Text>
        </>
      )}
    </SectionCard>
  );
}
