import { useMemo } from 'react';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useFrameStore } from '@/store/store';
import { TOPICS } from '@shared/types/topics';
import { SectionCard } from '../SectionCard';
import { formatUsd } from '../lib/format';
import type { DelegationSavingsProjection, DelegationSavingsSession } from '../types';

/** A quiet cumulative-savings trend over the session window. Cue, not a chart. */
function Sparkline({ sessions }: { sessions: DelegationSavingsSession[] }) {
  const points = useMemo(() => {
    const ordered = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (ordered.length < 2) return '';
    let cum = 0;
    const cums = ordered.map((s) => (cum += s.savings_usd));
    const max = Math.max(...cums, 1);
    const n = cums.length;
    return cums
      .map((c, i) => `${((i / (n - 1)) * 300).toFixed(1)},${(38 - (c / max) * 34).toFixed(1)}`)
      .join(' ');
  }, [sessions]);
  if (!points) return null;
  return (
    <svg className="sd-spark" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth="2" />
    </svg>
  );
}

/**
 * The hero savings card. Headline is `cumulative_savings_usd` — an estimate vs the
 * premium baseline, explicitly "not a charge". The breakdown shows the two
 * component figures (counterfactual premium cost vs what was actually spent).
 * The "view over time" / "how is this calculated?" affordances are placeholders
 * until their detail views exist (next steps), so they read as muted, not live links.
 */
export function SavingsHeroSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const openHowCalc = useFrameStore((s) => s.openHowCalc);
  const { data, isLoading, error } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['dashboard', 'savings'],
    topic: TOPICS.delegationSavings,
  });
  const p = data?.[0];

  return (
    <SectionCard
      eyebrow="Estimated savings this period"
      isLoading={isLoading}
      error={error}
      isEmpty={!p}
      sample={p?.provisioned === false}
      className="sd-hero-savings"
    >
      {p && (
        <>
          <div className="sd-bignum">{formatUsd(p.cumulative_savings_usd)}</div>
          <Text as="div" size="md" color="tertiary">
            Estimate vs the premium baseline ({p.baseline_model} list price). Not a charge.
          </Text>

          <Sparkline sessions={p.sessions} />
          <div className="sd-overtime">
            <button type="button" className="sd-linkbtn" onClick={() => setActivePage('savings-over-time')}>
              View savings over time →
            </button>
          </div>

          <div className="sd-breakdown">
            <div className="sd-breakdown-row">
              <Text as="span" size="lg" color="secondary">If all premium</Text>
              <Text as="span" size="lg" color="primary" weight="semibold">{formatUsd(p.cumulative_cloud_cost_usd)}</Text>
            </div>
            <div className="sd-breakdown-row">
              <Text as="span" size="lg" color="secondary">Actually spent</Text>
              <Text as="span" size="lg" color="primary" weight="semibold">{formatUsd(p.cumulative_local_cost_usd)}</Text>
            </div>
            <div className="sd-overtime">
              <button type="button" className="sd-linkbtn" onClick={openHowCalc}>How is this calculated?</button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
