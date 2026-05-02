import { Text } from '@/components/ui/typography';
import type { VisualizationContract, VisualizationType, ControlSpec } from '@shared/types/visualization-contract';

interface ToolbarProps {
  contract: VisualizationContract;
  data: Record<string, unknown>[];
  activeVisualization: VisualizationType;
  onVizChange: (viz: VisualizationType) => void;
  onRunChange: (runId: string | null) => void;
}

const VIZ_LABELS: Record<VisualizationType, string> = {
  bar_chart: 'Bar Chart',
  scatter_plot: 'Scatter',
  table: 'Table',
  trend_line: 'Trend',
  kpi_tiles: 'KPI Tiles',
};

function VizPicker({
  available,
  active,
  onVizChange,
}: {
  available: VisualizationType[];
  active: VisualizationType;
  onVizChange: (viz: VisualizationType) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Text size="xs" family="mono" color="tertiary" transform="uppercase">
        View
      </Text>
      <select
        value={active}
        onChange={(e) => onVizChange(e.target.value as VisualizationType)}
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 4,
          padding: '3px 8px',
          cursor: 'pointer',
        }}
        data-testid="viz-picker"
      >
        {available.map((v) => (
          <option key={v} value={v}>
            {VIZ_LABELS[v] ?? v}
          </option>
        ))}
      </select>
    </div>
  );
}

function RunSelector({
  contract,
  control,
  data,
  onRunChange,
}: {
  contract: VisualizationContract;
  control: ControlSpec;
  data: Record<string, unknown>[];
  onRunChange: (runId: string | null) => void;
}) {
  const field = control.field ?? contract.query_params?.run_selector?.field;
  if (!field) return null;

  const uniqueRuns = [...new Set(data.map((row) => row[field]).filter((v): v is string => typeof v === 'string'))];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Text size="xs" family="mono" color="tertiary" transform="uppercase">
        Run
      </Text>
      <select
        defaultValue=""
        onChange={(e) => onRunChange(e.target.value || null)}
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 4,
          padding: '3px 8px',
          cursor: 'pointer',
          maxWidth: 220,
        }}
        data-testid="run-selector"
      >
        <option value="">All runs</option>
        {uniqueRuns.map((runId) => (
          <option key={runId} value={runId}>
            {runId.length > 20 ? `…${runId.slice(-18)}` : runId}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toolbar({ contract, data, activeVisualization, onVizChange, onRunChange }: ToolbarProps) {
  if (contract.controls.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 0 10px',
        borderBottom: '1px solid var(--line-2)',
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
      data-testid="projection-toolbar"
    >
      {contract.controls.map((control, i) => {
        if (control.type === 'visualization_picker') {
          return (
            <VizPicker
              key={i}
              available={contract.available_visualizations}
              active={activeVisualization}
              onVizChange={onVizChange}
            />
          );
        }
        if (control.type === 'run_selector') {
          return (
            <RunSelector
              key={i}
              contract={contract}
              control={control}
              data={data}
              onRunChange={onRunChange}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
