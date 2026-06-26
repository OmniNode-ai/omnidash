import { useMemo } from 'react';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { SectionCard } from '../SectionCard';
import { formatPct } from '../lib/format';
import { tierForModel, TIER_LABEL, TIER_ORDER, type Tier } from '../lib/modelTier';
import type { ModelRoutingProjection } from '../types';

/**
 * "Delegation across tiers" — a visual of how much work each tier served, not a
 * second hero number. Tiers are derived from each model name (the projection has
 * no tier field today; see modelTier.ts), so this is an honest approximation.
 */
export function TierDistributionSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { data, isLoading, error } = useProjectionQuery<ModelRoutingProjection>({
    queryKey: ['dashboard', 'model-routing'],
    topic: TOPICS.delegationModelRouting,
  });
  const p = data?.[0];

  const shares = useMemo(() => {
    if (!p || p.by_model.length === 0) return null;
    const total = p.by_model.reduce((sum, m) => sum + m.count, 0) || 1;
    const counts: Record<Tier, number> = { local: 0, cheap: 0, premium: 0 };
    for (const m of p.by_model) counts[tierForModel(m.model_name)] += m.count;
    return TIER_ORDER.map((tier) => ({ tier, fraction: counts[tier] / total }));
  }, [p]);

  return (
    <SectionCard
      eyebrow="Delegation across tiers"
      sub={<Text as="span" size="md" color="tertiary">Share of requests this period</Text>}
      isLoading={isLoading}
      error={error}
      isEmpty={!shares}
      sample={p?.provisioned === false}
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
