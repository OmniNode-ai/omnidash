import { useMemo } from 'react';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { SectionCard } from '../SectionCard';
import { formatPct } from '../lib/format';
import { tierFromCostTier, TIER_LABEL, TIER_ORDER, type Tier } from '../lib/tier';
import type { DelegationDecisionRow, ModelRoutingProjection } from '../types';

/**
 * "Delegation across tiers" — a visual of how much work each tier served, not a
 * second hero number. The tier is the AUTHORITATIVE `cost_tier_name` carried on
 * each delegation decision (decisions.v1, OMN-13649), mapped to a display bucket
 * by tierFromCostTier — no client-side model-name heuristic.
 */
export function TierDistributionSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { data, isLoading, error } = useProjectionQuery<DelegationDecisionRow>({
    queryKey: ['dashboard', 'decisions'],
    topic: TOPICS.delegationDecisions,
  });
  // decisions.v1 is a row list with no `provisioned` flag; source the "sample
  // data" marker from the model-routing aggregate, which carries it.
  const { data: routingData } = useProjectionQuery<ModelRoutingProjection>({
    queryKey: ['dashboard', 'model-routing'],
    topic: TOPICS.delegationModelRouting,
  });
  const rows = data;
  const provisioned = routingData?.[0]?.provisioned;

  const shares = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const counts: Record<Tier, number> = { local: 0, cheap: 0, premium: 0 };
    for (const r of rows) counts[tierFromCostTier(r.cost_tier_name)] += 1;
    // rows.length > 0 is guaranteed by the guard above (no divide-by-zero).
    const total = rows.length;
    return TIER_ORDER.map((tier) => ({ tier, fraction: counts[tier] / total }));
  }, [rows]);

  return (
    <SectionCard
      eyebrow="Delegation across tiers"
      sub={<Text as="span" size="md" color="tertiary">Share of requests this period</Text>}
      isLoading={isLoading}
      error={error}
      isEmpty={!shares}
      sample={provisioned === false}
      className="sd-hero-tiers"
    >
      {shares && (
        <>
          <div className="sd-tierbar">
            {shares.map(({ tier, fraction }) =>
              fraction > 0 ? (
                <button
                  key={tier}
                  type="button"
                  className={`sd-seg sd-seg-${tier}`}
                  style={{ width: `${fraction * 100}%` }}
                  title={`See ${TIER_LABEL[tier]} tasks (${formatPct(fraction)})`}
                  onClick={() => setActivePage('tasks', { tasksTier: tier })}
                >
                  <span className="sd-seg-label">{formatPct(fraction)}</span>
                </button>
              ) : null,
            )}
          </div>
          <div className="sd-legend">
            {shares.map(({ tier, fraction }) => (
              <button
                key={tier}
                type="button"
                className="sd-leg"
                onClick={() => setActivePage('tasks', { tasksTier: tier })}
                title={`See ${TIER_LABEL[tier]} tasks`}
              >
                <span className={`sd-sw sd-sw-${tier}`} aria-hidden="true" />
                <Text as="span" size="lg" color="secondary">{TIER_LABEL[tier]}</Text>
                <Text as="span" size="lg" color="primary" weight="semibold" className="sd-leg-val">
                  {formatPct(fraction)}
                </Text>
              </button>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
