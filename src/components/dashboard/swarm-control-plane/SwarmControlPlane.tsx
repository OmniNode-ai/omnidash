import { useState, type ComponentType } from 'react';
import { Activity, BarChart2, CircleDollarSign, GitBranch, LayoutDashboard, List } from 'lucide-react';
import { Text } from '@/components/ui/typography';
import { ComponentWrapper } from '../ComponentWrapper';
import { useSwarmSnapshot } from './useSwarmSnapshot';
import { SwarmRunTable } from './SwarmRunTable';
import { SwarmDecompositionTree } from './SwarmDecompositionTree';
import { SwarmSubtaskCard } from './SwarmSubtaskCard';
import { SwarmWaveVisualization } from './SwarmWaveVisualization';
import { SwarmLiveCounters } from './SwarmLiveCounters';
import { SwarmSavingsBar } from './SwarmSavingsBar';
import { SwarmSubtaskDetailPanel } from './SwarmSubtaskDetailPanel';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import type { SwarmControlPlaneConfig, SwarmRunRow } from './swarm-control-plane.types';

const DEFAULT_MAX_RUNS = 12;

type TabId = 'overview' | 'decomposition' | 'subtask-detail' | 'subtask-rows' | 'wave' | 'savings';

const TABS: Array<{ id: TabId; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'decomposition', label: 'Decomposition', Icon: GitBranch },
  { id: 'subtask-detail', label: 'Run Detail', Icon: Activity },
  { id: 'subtask-rows', label: 'Subtask Detail', Icon: List },
  { id: 'wave', label: 'Wave View', Icon: BarChart2 },
  { id: 'savings', label: 'Savings', Icon: CircleDollarSign },
];

function PanelFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text as="div" size="sm" weight="semibold" color="primary">{title}</Text>
        {subtitle && (
          <Text as="div" size="xs" color="tertiary" style={{ marginTop: 2 }}>{subtitle}</Text>
        )}
      </div>
      {children}
    </div>
  );
}

function SwarmEvidenceTabs({ selectedRun, runs }: { selectedRun: SwarmRunRow | null; runs: SwarmRunRow[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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

      {activeTab === 'overview' && (
        <PanelFrame
          title="Live Counters"
          subtitle="Aggregate metrics across all swarm runs from the swarm_runs projection."
        >
          <SwarmLiveCounters runs={runs} />
        </PanelFrame>
      )}

      {activeTab === 'decomposition' && (
        <PanelFrame
          title="Decomposition Tree"
          subtitle={selectedRun
            ? `Parent → subtask tree for run ${selectedRun.run_id.slice(0, 12)}…`
            : 'Select a run from the table to view its decomposition tree.'}
        >
          {selectedRun
            ? <SwarmDecompositionTree run={selectedRun} />
            : <Text as="div" size="sm" color="tertiary">No run selected.</Text>}
        </PanelFrame>
      )}

      {activeTab === 'subtask-detail' && (
        <PanelFrame
          title="Run Detail"
          subtitle={selectedRun
            ? `Per-run card for ${selectedRun.run_id.slice(0, 12)}…`
            : 'Select a run from the table to view its detail card.'}
        >
          {selectedRun
            ? <SwarmSubtaskCard run={selectedRun} />
            : <Text as="div" size="sm" color="tertiary">No run selected.</Text>}
        </PanelFrame>
      )}

      {activeTab === 'subtask-rows' && (
        <PanelFrame
          title="Subtask Detail"
          subtitle={selectedRun
            ? `Per-subtask rows for run ${selectedRun.run_id.slice(0, 12)}… (derived from aggregates)`
            : 'Select a run from the table to view per-subtask detail.'}
        >
          {selectedRun
            ? <SwarmSubtaskDetailPanel run={selectedRun} />
            : <Text as="div" size="sm" color="tertiary">No run selected.</Text>}
        </PanelFrame>
      )}

      {activeTab === 'wave' && (
        <PanelFrame
          title="Wave Visualization"
          subtitle={selectedRun
            ? `Wave execution layout for run ${selectedRun.run_id.slice(0, 12)}…`
            : 'Select a run to view its wave layout.'}
        >
          {selectedRun
            ? <SwarmWaveVisualization run={selectedRun} />
            : <Text as="div" size="sm" color="tertiary">No run selected.</Text>}
        </PanelFrame>
      )}

      {activeTab === 'savings' && (
        <PanelFrame
          title="Aggregate Savings"
          subtitle="Actual cost vs Opus-equivalent baseline across all swarm runs."
        >
          <SwarmSavingsBar runs={runs} />
        </PanelFrame>
      )}
    </section>
  );
}

export default function SwarmControlPlane({ config }: { config: SwarmControlPlaneConfig }) {
  const snapshot = useSwarmSnapshot();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const dataSourceMode = useDataSourceMode();
  const maxRuns = Math.max(1, Math.trunc(config.maxRuns ?? DEFAULT_MAX_RUNS));

  const selectedRun = snapshot.runs.find((r) => r.run_id === selectedRunId)
    ?? snapshot.runs[0]
    ?? null;

  const isInitialLoading = snapshot.isLoading && !snapshot.hasAnyData;

  return (
    <ComponentWrapper
      title="Swarm Control Plane"
      isLoading={isInitialLoading}
      error={snapshot.error}
      isEmpty={!snapshot.isLoading && !snapshot.hasAnyData}
      emptyMessage="No swarm runs"
      emptyHint="Trigger a swarm dispatch via onex.cmd.omnimarket.swarm-dispatch.v1 to populate the swarm_runs projection."
      isLive={isLiveDataSource(dataSourceMode)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SwarmRunTable
          runs={snapshot.runs}
          selectedRunId={selectedRun?.run_id ?? null}
          maxRuns={maxRuns}
          onSelectRun={setSelectedRunId}
        />
        <SwarmEvidenceTabs selectedRun={selectedRun} runs={snapshot.runs} />
      </div>
    </ComponentWrapper>
  );
}
