import { useState, useMemo, Component, type ReactNode } from 'react';
import type { VisualizationType } from '../../../../shared/types/visualization-contract';
import { AB_COMPARE_VIZ_CONTRACT, type VisualizationContract } from '../../../../shared/types/visualization-contract';
import { useProjectionQueryWithContract } from '@/hooks/useProjectionQuery';
import { ComponentWrapper } from '../ComponentWrapper';
import { VizRenderer } from './VizRenderer';
import { Text } from '@/components/ui/typography';

const SUPPORTED_CONTRACT_VERSIONS = ['1.0.0'];

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return <Text as="div" size="lg" color="tertiary">Loading...</Text>;
}

function InlineErrorState({ message }: { message: string }) {
  return <Text as="div" size="lg" color="bad">Error: {message}</Text>;
}

function InlineEmptyState({ guidance }: { guidance: string }) {
  return <Text as="div" size="lg" color="tertiary">{guidance}</Text>;
}

function DegradedBanner({ freshness }: { freshness: string | null }) {
  return (
    <Text as="div" size="sm" color="bad" style={{ marginBottom: 8 }}>
      Data may be stale{freshness ? ` (last snapshot: ${freshness})` : ''}.
    </Text>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  contract: VisualizationContract;
  data: unknown[];
  activeVisualization: VisualizationType;
  onVizChange: (v: VisualizationType) => void;
  onRunChange: (runId: string | null) => void;
}

function Toolbar({ contract, data, activeVisualization, onVizChange, onRunChange }: ToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      {contract.controls.map((control, i) => {
        if (control.type === 'visualization_picker') {
          return (
            <select
              key={i}
              value={activeVisualization}
              onChange={(e) => onVizChange(e.target.value as VisualizationType)}
              aria-label="Select visualization type"
            >
              {contract.available_visualizations.map((v) => (
                <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
              ))}
            </select>
          );
        }
        if (control.type === 'run_selector' && contract.query_params?.run_selector) {
          const field = contract.query_params.run_selector.field;
          const uniqueRuns = Array.from(
            new Set(
              (data as Record<string, unknown>[])
                .map((row) => row[field])
                .filter((v): v is string => typeof v === 'string'),
            ),
          );
          return (
            <select
              key={i}
              defaultValue=""
              onChange={(e) => onRunChange(e.target.value || null)}
              aria-label="Select run"
            >
              <option value="">All runs</option>
              {uniqueRuns.map((runId) => (
                <option key={runId} value={runId}>{runId}</option>
              ))}
            </select>
          );
        }
        // time_range and model_filter: follow-up tickets, render nothing for now.
        return null;
      })}
    </div>
  );
}

// ── ErrorBoundary ─────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ── ProjectionContainerInner — all hooks called unconditionally ───────────────

function ProjectionContainerInner({ contract }: { contract: VisualizationContract }) {
  const [activeVisualization, setActiveVisualization] = useState<VisualizationType>(
    contract.default_visualization,
  );
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const queryParams = useMemo(
    () =>
      selectedRun && contract.query_params?.run_selector
        ? { [contract.query_params.run_selector.param]: selectedRun }
        : undefined,
    [selectedRun, contract],
  );

  const { data, is_degraded, freshness, isLoading, error } = useProjectionQueryWithContract({
    topic: contract.topic,
    contract,
    params: queryParams,
  });

  const fieldError = useMemo(() => {
    if (!data.length) return null;
    const row = data[0] as Record<string, unknown>;
    const required = [
      contract.cost_field,
      contract.latency_field,
      contract.display_name_field,
      contract.group_by,
    ];
    const missing = required.filter((f) => !(f in row));
    return missing.length ? `Required fields missing in data: ${missing.join(', ')}` : null;
  }, [data, contract]);

  if (isLoading) {
    return (
      <ComponentWrapper title={contract.display_name}>
        <LoadingSkeleton />
      </ComponentWrapper>
    );
  }

  if (error) {
    return (
      <ComponentWrapper title={contract.display_name}>
        <InlineErrorState message={error.message} />
      </ComponentWrapper>
    );
  }

  if (fieldError) {
    return (
      <ComponentWrapper title={contract.display_name}>
        <InlineErrorState message={fieldError} />
      </ComponentWrapper>
    );
  }

  if (!data.length) {
    return (
      <ComponentWrapper title={contract.display_name}>
        <InlineEmptyState guidance="No data available for this projection." />
      </ComponentWrapper>
    );
  }

  return (
    <ComponentWrapper title={contract.display_name}>
      {is_degraded && <DegradedBanner freshness={freshness} />}
      <Toolbar
        contract={contract}
        data={data}
        activeVisualization={activeVisualization}
        onVizChange={setActiveVisualization}
        onRunChange={setSelectedRun}
      />
      <ErrorBoundary
        fallback={<InlineErrorState message="Visualization failed to render." />}
      >
        <VizRenderer type={activeVisualization} data={data} contract={contract} />
      </ErrorBoundary>
    </ComponentWrapper>
  );
}

// ── ProjectionContainer ───────────────────────────────────────────────────────

interface ProjectionContainerProps {
  contract?: VisualizationContract;
  config?: Record<string, unknown>;
}

export default function ProjectionContainer({ contract: contractProp, config }: ProjectionContainerProps) {
  const contract = contractProp ?? (config?.contract as VisualizationContract | undefined) ?? AB_COMPARE_VIZ_CONTRACT;
  if (!SUPPORTED_CONTRACT_VERSIONS.includes(contract.version)) {
    return (
      <ComponentWrapper title="Visualization Error">
        <InlineErrorState message={`Unsupported contract version: ${contract.version}`} />
      </ComponentWrapper>
    );
  }
  return <ProjectionContainerInner contract={contract} />;
}
