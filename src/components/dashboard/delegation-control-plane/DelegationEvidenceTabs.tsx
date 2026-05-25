import { Activity, Archive, BarChart2, CircleDollarSign, Database, FileCheck2, GitCommitHorizontal, LayoutDashboard, Network } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Text } from '@/components/ui/typography';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import { DelegationEventChainPanel } from './DelegationEventChainPanel';
import { DelegationCorrelationTracePanel } from './DelegationCorrelationTracePanel';
import { DelegationProjectionProbePanel } from './DelegationProjectionProbePanel';
import { DelegationRuntimeTopologyPanel } from './DelegationRuntimeTopologyPanel';
import { DelegationArtifactPanel } from './DelegationArtifactPanel';
import { DelegationEvidenceBundlePanel } from './DelegationEvidenceBundlePanel';
import { useDelegationRunContext } from './DelegationRunContext';
import type { DelegationEvidenceTabId } from './delegation-control-plane.types';
import { fmtTokens, fmtUsd } from './format';

const TABS: Array<{ id: DelegationEvidenceTabId; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'runtime-topology', label: 'Runtime Topology', Icon: Network },
  { id: 'event-chain', label: 'Event Chain', Icon: Activity },
  { id: 'correlation-trace', label: 'Correlation Trace', Icon: GitCommitHorizontal },
  { id: 'projection', label: 'Projection / API', Icon: Database },
  { id: 'cost-tokens', label: 'Cost & Tokens', Icon: CircleDollarSign },
  { id: 'quality', label: 'Quality', Icon: BarChart2 },
  { id: 'artifacts', label: 'Artifacts', Icon: Archive },
  { id: 'evidence-bundle', label: 'Evidence Bundle', Icon: FileCheck2 },
];

const DEFAULT_TAB: DelegationEvidenceTabId = 'overview';

export function DelegationEvidenceTabs() {
  const { snapshot, selectedRun } = useDelegationRunContext();
  const [activeTab, setActiveTab] = useState<DelegationEvidenceTabId>(DEFAULT_TAB);

  return (
    <section>
      <div
        role="tablist"
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 12 }}
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '6px 9px',
              background: activeTab === id ? 'var(--panel-2)' : 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <Icon size={14} />
            <Text as="span" size="xs" color="primary">{label}</Text>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'runtime-topology' && <DelegationRuntimeTopologyPanel snapshot={snapshot} />}
      {activeTab === 'event-chain' && <DelegationEventChainPanel />}
      {activeTab === 'correlation-trace' && <DelegationCorrelationTracePanel />}
      {activeTab === 'projection' && <DelegationProjectionProbePanel />}
      {activeTab === 'cost-tokens' && <CostTokensTab />}
      {activeTab === 'quality' && <QualityTab />}
      {activeTab === 'artifacts' && <DelegationArtifactPanel snapshot={snapshot} selectedRun={selectedRun} />}
      {activeTab === 'evidence-bundle' && <DelegationEvidenceBundlePanel snapshot={snapshot} selectedRun={selectedRun} />}
    </section>
  );
}

function OverviewTab() {
  const { snapshot, selectedRun } = useDelegationRunContext();
  const passedCount = snapshot.runs.filter((r) => r.status === 'passed').length;
  const failedCount = snapshot.runs.filter((r) => r.status === 'failed').length;
  const projectedCount = snapshot.runs.filter((r) => r.status === 'projected').length;

  return (
    <DelegationPanelFrame
      title="Overview"
      subtitle="Summary of all delegation runs and snapshot health for the selected control plane."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <OverviewFact label="Total runs" value={String(snapshot.runs.length)} />
        <OverviewFact label="Passed" value={String(passedCount)} />
        <OverviewFact label="Failed" value={String(failedCount)} />
        <OverviewFact label="Projected" value={String(projectedCount)} />
        <OverviewFact label="Projection topics" value={String(snapshot.probes.length)} />
        <OverviewFact label="Decision rows" value={String(snapshot.decisions.length)} />
      </div>
      {selectedRun && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 6 }}>
            Selected run
          </Text>
          <Text as="div" size="sm" family="mono" color="secondary">
            {selectedRun.taskType} / {selectedRun.modelName} / {selectedRun.status}
          </Text>
        </div>
      )}
    </DelegationPanelFrame>
  );
}

function CostTokensTab() {
  const { snapshot, selectedRun } = useDelegationRunContext();
  const totalTokens = snapshot.tokenUsage?.total_tokens ?? 0;
  const totalSavings = snapshot.savings?.cumulative_savings_usd ?? 0;

  return (
    <DelegationPanelFrame
      title="Cost & Tokens"
      subtitle="Aggregated token consumption and estimated cost savings across all delegation runs."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <OverviewFact label="Total tokens" value={fmtTokens(totalTokens)} />
        <OverviewFact label="Cumulative savings" value={fmtUsd(totalSavings)} />
        <OverviewFact
          label="Pricing manifest"
          value={snapshot.savings?.pricing_manifest_version ?? 'pending'}
        />
      </div>
      {selectedRun && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 6 }}>
            Selected run
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <OverviewFact label="Tokens" value={fmtTokens(selectedRun.tokenCount)} />
            <OverviewFact label="Est. cost" value={fmtUsd(selectedRun.estimatedCostUsd)} />
            <OverviewFact label="Savings" value={fmtUsd(selectedRun.savingsUsd)} />
          </div>
        </div>
      )}
      {!snapshot.tokenUsage && (
        <Text as="div" size="xs" color="tertiary" style={{ marginTop: 10 }}>
          Token usage projection not yet populated. Run the market delegation golden chain.
        </Text>
      )}
    </DelegationPanelFrame>
  );
}

function QualityTab() {
  const { snapshot } = useDelegationRunContext();
  const passRate = snapshot.qualityGate?.overall_pass_rate ?? null;
  const passedCount = snapshot.runs.filter((r) => r.status === 'passed').length;
  const failedCount = snapshot.runs.filter((r) => r.status === 'failed').length;

  return (
    <DelegationPanelFrame
      title="Quality"
      subtitle="Quality gate pass rates and per-run quality assessments from projection rows."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <OverviewFact
          label="Overall pass rate"
          value={passRate != null ? `${Math.round(passRate * 100)}%` : 'pending'}
        />
        <OverviewFact label="Passed runs" value={String(passedCount)} />
        <OverviewFact label="Failed runs" value={String(failedCount)} />
      </div>
      {!snapshot.qualityGate && (
        <Text as="div" size="xs" color="tertiary" style={{ marginTop: 10 }}>
          Quality gate projection not yet populated. Run the market delegation golden chain.
        </Text>
      )}
    </DelegationPanelFrame>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="lg" family="mono" color="primary">{value}</Text>
    </div>
  );
}
