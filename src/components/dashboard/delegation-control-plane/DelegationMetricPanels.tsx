import { Text } from '@/components/ui/typography';
import { fmtPct, fmtTokens, fmtUsd } from './format';
import { DelegationPanelFrame, EmptyPanel } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot } from './delegation-control-plane.types';

// OMN-12785: all four metric panels are aggregate-only summaries materialized from
// projection-API rows. Per-run prompt+response is visible in the Correlation Trace tab.
export function DelegationMetricPanels({ snapshot }: { snapshot: DelegationEvidenceSnapshot }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      <DelegationPanelFrame
        title="Savings"
        authority="projection-backed"
        subtitle="Aggregate cost-savings summary from node_projection_savings. Per-run detail in Correlation Trace."
      >
        {snapshot.savings ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <MetricRow label="Cumulative savings" value={fmtUsd(snapshot.savings.cumulative_savings_usd)} tone="ok" />
            <MetricRow label="Baseline" value={snapshot.savings.baseline_model} />
            <MetricRow label="Pricing manifest" value={snapshot.savings.pricing_manifest_version} />
            <MetricRow label="Sessions" value={String(snapshot.savings.session_count)} />
          </div>
        ) : (
          <EmptyPanel message="No savings projection row." />
        )}
      </DelegationPanelFrame>

      <DelegationPanelFrame
        title="Model Routing"
        authority="projection-backed"
        subtitle="Aggregate delegation volume by model from projection-API. Per-run routing in Correlation Trace."
      >
        {snapshot.modelRouting ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <MetricRow label="Total delegations" value={String(snapshot.modelRouting.total_delegations)} />
            {snapshot.modelRouting.by_model.slice(0, 4).map((model) => (
              <MetricRow
                key={model.model_name}
                label={model.model_name}
                value={`${model.total_count} / ${fmtPct(model.pct_of_total)}`}
              />
            ))}
          </div>
        ) : (
          <EmptyPanel message="No model-routing projection row." />
        )}
      </DelegationPanelFrame>

      <DelegationPanelFrame
        title="Quality Gate"
        authority="projection-backed"
        subtitle="Aggregate pass/fail rates from projection-API. Per-run quality gate in Correlation Trace."
      >
        {snapshot.qualityGate ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <MetricRow label="Pass rate" value={fmtPct(snapshot.qualityGate.overall_pass_rate)} tone={snapshot.qualityGate.overall_pass_rate >= 0.8 ? 'ok' : 'warn'} />
            <MetricRow label="Passed" value={String(snapshot.qualityGate.total_passed)} />
            <MetricRow label="Failed" value={String(snapshot.qualityGate.total_failed)} />
            <MetricRow label="Escalation rate" value={fmtPct(snapshot.qualityGate.escalation_rate)} />
          </div>
        ) : (
          <EmptyPanel message="No quality-gate projection row." />
        )}
      </DelegationPanelFrame>

      <DelegationPanelFrame
        title="Token Usage"
        authority="projection-backed"
        subtitle="Aggregate token totals from projection-API. Per-run tokens in Correlation Trace."
      >
        {snapshot.tokenUsage ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <MetricRow label="Total tokens" value={fmtTokens(snapshot.tokenUsage.total_tokens)} />
            <MetricRow label="Prompt" value={fmtTokens(snapshot.tokenUsage.total_prompt_tokens)} />
            <MetricRow label="Completion" value={fmtTokens(snapshot.tokenUsage.total_completion_tokens)} />
            <MetricRow label="Estimated cost" value={fmtUsd(snapshot.tokenUsage.total_estimated_cost_usd)} />
          </div>
        ) : (
          <EmptyPanel message="No token-usage projection row." />
        )}
      </DelegationPanelFrame>
    </section>
  );
}

function MetricRow({
  label,
  value,
  tone = 'secondary',
}: {
  label: string;
  value: string;
  tone?: 'secondary' | 'ok' | 'warn';
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, minWidth: 0 }}>
      <Text as="span" size="xs" color="tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      <Text as="span" size="xs" family="mono" color={tone} style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </Text>
    </div>
  );
}
