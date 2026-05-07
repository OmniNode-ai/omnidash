/* eslint-disable local/no-typography-inline -- OMN-10624 prototype widget */
import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { useThemeColors } from '@/theme';

// ── Projection types (from delegation_events SQLite table, OMN-10623) ─

export interface ModelRoutingRow {
  model_name: string;
  task_type: string;
  count: number;
  pct_of_model: number;
  pct_of_total: number;
}

export interface ModelRoutingSummary {
  model_name: string;
  total_count: number;
  pct_of_total: number;
  top_task_type: string;
}

export interface DelegationModelRoutingProjection {
  total_delegations: number;
  rows: ModelRoutingRow[];
  by_model: ModelRoutingSummary[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationModelRoutingConfig {
  showTaskBreakdown?: boolean;
}

// ── Frequency bar ─────────────────────────────────────────────────────

function FrequencyBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: 'var(--panel-2)',
        overflow: 'hidden',
        flex: '0 0 80px',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          borderRadius: 3,
          transition: 'width 0.6s ease-out',
        }}
      />
    </div>
  );
}

// ── Task type breakdown panel ─────────────────────────────────────────

function TaskBreakdown({ rows, modelName, colors }: { rows: ModelRoutingRow[]; modelName: string; colors: string[] }) {
  const modelRows = rows.filter((r) => r.model_name === modelName);
  if (modelRows.length === 0) return null;
  const sorted = [...modelRows].sort((a, b) => b.count - a.count);
  return (
    <div
      style={{
        marginTop: 4,
        padding: '8px 10px',
        background: 'var(--panel-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
      }}
    >
      <Text as="div" size="xs" color="secondary" weight="semibold" style={{ marginBottom: 6 }}>
        {modelName} — task type breakdown
      </Text>
      {sorted.map((r, i) => (
        <div
          key={r.task_type}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 40px 80px 40px',
            gap: 8,
            padding: '3px 0',
            alignItems: 'center',
          }}
        >
          <Text as="span" size="xs" family="mono" color="primary">
            {r.task_type}
          </Text>
          <Text as="span" size="xs" family="mono" tabularNums style={{ textAlign: 'right' }}>
            {r.count}
          </Text>
          <FrequencyBar pct={r.pct_of_model * 100} color={colors[i % colors.length]} />
          <Text as="span" size="xs" family="mono" tabularNums color="secondary" style={{ textAlign: 'right' }}>
            {(r.pct_of_model * 100).toFixed(0)}%
          </Text>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationModelRoutingWidget(props: { config: DelegationModelRoutingConfig }) {
  const { config } = props;
  const showTaskBreakdown = config.showTaskBreakdown ?? true;

  const { data, isLoading, error } = useProjectionQuery<DelegationModelRoutingProjection>({
    queryKey: ['delegation-model-routing', TOPICS.delegationModelRouting],
    topic: TOPICS.delegationModelRouting,
    refetchInterval: 60_000,
  });

  const projection = useMemo<DelegationModelRoutingProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const colors = useThemeColors();

  const sorted = useMemo(() => {
    if (!projection) return [];
    return [...projection.by_model].sort((a, b) => b.total_count - a.total_count);
  }, [projection]);

  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  const isEmpty = !projection || projection.total_delegations === 0;

  return (
    <ComponentWrapper
      title="Model Routing"
      isLoading={isLoading}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No routing data"
      emptyHint="Routing data appears once delegation events are recorded"
    >
      {projection && !isEmpty && (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
          onPointerLeave={() => setHoveredModel(null)}
        >
          <div style={{ marginBottom: 8 }}>
            <Text as="span" size="sm" color="secondary">
              {projection.total_delegations} total delegations across {sorted.length} models
            </Text>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 48px 80px 40px',
              gap: 8,
              paddingBottom: 4,
              borderBottom: '1px solid var(--line)',
            }}
          >
            {(['Model', 'Count', 'Frequency', '%'] as const).map((h) => (
              <Text key={h} as="span" size="xs" color="tertiary" style={{ textAlign: h === 'Model' ? 'left' : 'right' }}>
                {h}
              </Text>
            ))}
          </div>

          {sorted.map((s, i) => (
            <div key={s.model_name}>
              <div
                onPointerEnter={() => setHoveredModel(s.model_name)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 48px 80px 40px',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--line-2)',
                  alignItems: 'center',
                  opacity: hoveredModel === null || hoveredModel === s.model_name ? 1 : 0.65,
                  transition: 'opacity 120ms ease-out',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: colors.chart[i % colors.chart.length],
                      flex: '0 0 auto',
                    }}
                  />
                  <Text as="span" size="sm" family="mono" color="primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.model_name}
                  </Text>
                </div>
                <Text as="span" size="sm" family="mono" tabularNums style={{ textAlign: 'right' }}>
                  {s.total_count}
                </Text>
                <FrequencyBar pct={s.pct_of_total * 100} color={colors.chart[i % colors.chart.length]} />
                <Text as="span" size="sm" family="mono" tabularNums color="secondary" style={{ textAlign: 'right' }}>
                  {(s.pct_of_total * 100).toFixed(0)}%
                </Text>
              </div>
              {showTaskBreakdown && hoveredModel === s.model_name && (
                <TaskBreakdown
                  rows={projection.rows}
                  modelName={s.model_name}
                  colors={colors.chart}
                />
              )}
            </div>
          ))}

          {!projection.provisioned && (
            <Text as="div" size="xs" color="tertiary" style={{ marginTop: 8, fontStyle: 'italic' }}>
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10623).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
