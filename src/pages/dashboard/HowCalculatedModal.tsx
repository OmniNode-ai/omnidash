import { useEffect, useRef, type ReactNode } from 'react';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { formatUsd } from './lib/format';
import type { DelegationSavingsProjection } from './types';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hc-section">
      <Text as="div" size="xs" color="tertiary" transform="uppercase" weight="semibold" className="hc-sec-label">{label}</Text>
      {children}
    </div>
  );
}

/**
 * The "how is this calculated?" explainer, opened from any savings figure (hero,
 * tokens band, run-detail, savings-over-time). An overlay, not a route, so the
 * reader keeps their place. The math figures are the real cumulative numbers from
 * the savings projection; the prose covers the counterfactual basis, the tokens
 * denomination open-item, and the subscription-ceiling caveat.
 */
export function HowCalculatedModal() {
  const closeHowCalc = useFrameStore((s) => s.closeHowCalc);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data } = useProjectionQuery<DelegationSavingsProjection>({
    queryKey: ['dashboard', 'savings'],
    topic: TOPICS.delegationSavings,
  });
  const p = data?.[0];
  const baseline = p ? p.baseline_model : 'claude-opus-4-6';

  // ESC closes; move focus into the dialog on open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeHowCalc(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [closeHowCalc]);

  return (
    <div className="hc-backdrop" role="presentation" onClick={closeHowCalc}>
      <div
        className="hc-modal"
        role="dialog"
        aria-modal="true"
        aria-label="How savings and tokens are calculated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hc-head">
          <Text as="span" size="3xl" weight="semibold" color="primary">How savings and tokens are calculated</Text>
          <button ref={closeRef} type="button" className="hc-x" aria-label="Close" onClick={closeHowCalc}>×</button>
        </div>

        <div className="hc-body">
          <Text as="p" size="md" color="secondary" className="hc-lead">
            Each task goes to the cheapest model that can handle it. The saving on a task is what the premium model would have cost for the same work, minus what the cheaper model actually cost. When a task needs the premium model anyway, its saving is zero.
          </Text>

          <Section label="The math, this period">
            <div className="hc-calc">
              <div className="hc-crow">
                <Text as="span" size="md" color="secondary">If all work ran on premium</Text>
                <Text as="span" size="md" color="primary" weight="semibold">{p ? formatUsd(p.cumulative_cloud_cost_usd) : '—'}</Text>
              </div>
              <div className="hc-crow">
                <Text as="span" size="md" color="secondary">What it actually cost</Text>
                <Text as="span" size="md" color="primary" weight="semibold">{p ? formatUsd(p.cumulative_local_cost_usd) : '—'}</Text>
              </div>
              <div className="hc-crow hc-csum">
                <Text as="span" size="md" color="primary" weight="semibold">Estimated savings</Text>
                <Text as="span" size="2xl" color="primary" weight="semibold">{p ? formatUsd(p.cumulative_savings_usd) : '—'}</Text>
              </div>
            </div>
          </Section>

          <Section label="The premium baseline">
            <Text as="p" size="md" color="secondary"><strong>{baseline}</strong>, priced at its list rate, read from the data per row.</Text>
          </Section>

          <Section label="It is an estimate">
            <Text as="p" size="md" color="secondary">
              The premium cost is a counterfactual: the same tokens priced at the baseline model&apos;s list rate. The premium model was not run when a cheaper tier served the task, so the figure is an estimate, not an incurred charge.
            </Text>
          </Section>

          <Section label="Tokens used and tokens saved">
            <Text as="p" size="md" color="secondary">
              <strong>Tokens used</strong> is the real token count for the work (input measured exactly, output corrected by task type). Because the same task uses about the same number of tokens on any model, <strong>tokens saved</strong> is not fewer tokens spent; it is the dollar saving expressed in premium-baseline tokens, so the unit lines up with the rest of the dashboard. For free-local work that equals the full token count. <em>Open item: confirm whether tokens saved is reported as this baseline-token equivalent or as the volume of tokens routed to cheaper tiers; the two differ.</em>
            </Text>
          </Section>

          <Section label="On a subscription plan">
            <Text as="p" size="md" color="secondary">
              On a flat-fee plan with a usage cap, work costs nothing until the cap is reached. There the figure shown is <strong>budget headroom preserved</strong> rather than dollars. (Not yet available; see A4.)
            </Text>
          </Section>
        </div>

        <div className="hc-foot">
          <button type="button" className="sd-show-more" onClick={closeHowCalc}>
            <Text as="span" size="md" weight="semibold" color="secondary">Close</Text>
          </button>
        </div>
      </div>
    </div>
  );
}
