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
  /** Average delegation latency in ms for this model. */
  avg_latency_ms?: number;
  /** Quality gate pass rate (0–1) for this model. */
  qg_pass_rate?: number;
  /** All task types served by this model (derived from rows). */
  task_types?: string[];
}

export interface RoutingDecisionTrace {
  id: number;
  correlation_id: string;
  task_type: string;
  model_name: string;
  delegated_to: string;
  routing_rule: string | null;
  routing_confidence: number | null;
  routing_candidates: string | null;
  latency_ms: number | null;
  quality_gate_passed: number;
  created_at: number;
}

export interface DelegationModelRoutingProjection {
  total_delegations: number;
  rows: ModelRoutingRow[];
  by_model: ModelRoutingSummary[];
  decision_traces?: RoutingDecisionTrace[];
  captured_at: string;
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

export interface DelegationModelRoutingConfig {
  showTaskBreakdown?: boolean;
  showDecisionTrace?: boolean;
}

// ── Formatters ────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
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

// ── Decision trace panel ──────────────────────────────────────────────

const RULE_LABELS: Record<string, { label: string; color: string }> = {
  'exploit:best-latency':    { label: 'exploit · best-latency',   color: 'var(--good)' },
  'explore:random-sample':   { label: 'explore · random-sample',  color: 'var(--warn)' },
  'explore:capability-match':{ label: 'explore · capability-match', color: 'var(--accent, var(--warn))' },
};

function ConfidencePip({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <Text as="span" size="xs" color="tertiary">—</Text>;
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.75 ? 'var(--good)' : confidence >= 0.5 ? 'var(--warn)' : 'var(--error, var(--warn))';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 32, height: 4, borderRadius: 2, background: 'var(--panel-2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <Text as="span" size="xs" family="mono" tabularNums style={{ color }}>{pct}%</Text>
    </div>
  );
}

function DecisionTracePanel({ traces }: { traces: RoutingDecisionTrace[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? traces : traces.slice(0, 5);

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <Text as="div" size="xs" color="secondary" weight="semibold" style={{ marginBottom: 8 }}>
        Decision Trace — per delegation
      </Text>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 1fr 72px',
          gap: 8,
          paddingBottom: 4,
          borderBottom: '1px solid var(--line-2)',
        }}
      >
        {(['Task', 'Rule fired', 'Confidence', 'Model'] as const).map((h) => (
          <Text key={h} as="span" size="xs" color="tertiary">
            {h}
          </Text>
        ))}
      </div>
      {visible.map((t) => {
        const ruleInfo = t.routing_rule ? (RULE_LABELS[t.routing_rule] ?? { label: t.routing_rule, color: 'var(--accent)' }) : null;
        const shortModel = t.model_name.split('/').pop() ?? t.model_name;
        return (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 1fr 72px',
              gap: 8,
              padding: '4px 0',
              borderBottom: '1px solid var(--line-2)',
              alignItems: 'center',
            }}
          >
            <Text as="span" size="xs" family="mono" color="primary">{t.task_type}</Text>
            {ruleInfo ? (
              <Text as="span" size="xs" family="mono" style={{ color: ruleInfo.color }}>{ruleInfo.label}</Text>
            ) : (
              <Text as="span" size="xs" color="tertiary">—</Text>
            )}
            <ConfidencePip confidence={t.routing_confidence} />
            <Text as="span" size="xs" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shortModel}
            </Text>
          </div>
        );
      })}
      {traces.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 6,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <Text as="span" size="xs" color="secondary">
            {expanded ? 'Show less' : `Show all ${traces.length} delegations`}
          </Text>
        </button>
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function DelegationModelRoutingWidget(props: { config: DelegationModelRoutingConfig }) {
  const { config } = props;
  const showTaskBreakdown = config.showTaskBreakdown ?? true;
  const showDecisionTrace = config.showDecisionTrace ?? true;

  const { data, isLoading, error } = useProjectionQuery<DelegationModelRoutingProjection>({
    queryKey: ['delegation-model-routing', TOPICS.delegationModelRouting],
    topic: TOPICS.delegationModelRouting,
    refetchInterval: 5_000,
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
              gridTemplateColumns: '1fr 44px 1fr 72px 60px 80px 36px',
              gap: 8,
              paddingBottom: 4,
              borderBottom: '1px solid var(--line)',
            }}
          >
            {(['Model', 'N', 'Task Types', 'Latency', 'QG Pass', 'Frequency', '%'] as const).map((h) => (
              <Text key={h} as="span" size="xs" color="tertiary" style={{ textAlign: h === 'Model' || h === 'Task Types' ? 'left' : 'right' }}>
                {h}
              </Text>
            ))}
          </div>

          {sorted.map((s, i) => {
            // Derive task_types from rows if not provided in summary
            const taskTypeList: string[] = s.task_types?.length
              ? s.task_types
              : [...new Set(projection.rows.filter((r) => r.model_name === s.model_name).map((r) => r.task_type))];
            return (
              <div key={s.model_name}>
                <div
                  tabIndex={0}
                  role="button"
                  aria-label={`Show task breakdown for ${s.model_name}`}
                  onPointerEnter={() => setHoveredModel(s.model_name)}
                  onFocus={() => setHoveredModel(s.model_name)}
                  onBlur={() => setHoveredModel(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 44px 1fr 72px 60px 80px 36px',
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
                  {/* Task types: comma-separated chips */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', overflow: 'hidden' }}>
                    {taskTypeList.slice(0, 3).map((tt) => (
                      <Text
                        key={tt}
                        as="span"
                        size="xs"
                        family="mono"
                        color="secondary"
                        style={{
                          display: 'inline-block',
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: 'var(--panel-2)',
                          border: '1px solid var(--line-2)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 90,
                        }}
                      >
                        {tt}
                      </Text>
                    ))}
                    {taskTypeList.length > 3 && (
                      <Text as="span" size="xs" color="tertiary">+{taskTypeList.length - 3}</Text>
                    )}
                  </div>
                  <Text as="span" size="sm" family="mono" tabularNums color="secondary" style={{ textAlign: 'right' }}>
                    {s.avg_latency_ms != null ? fmtMs(s.avg_latency_ms) : '—'}
                  </Text>
                  <Text
                    as="span"
                    size="sm"
                    family="mono"
                    tabularNums
                    style={{ textAlign: 'right' }}
                    color={
                      s.qg_pass_rate == null
                        ? 'tertiary'
                        : s.qg_pass_rate >= 0.8
                        ? 'ok'
                        : s.qg_pass_rate >= 0.6
                        ? 'warn'
                        : 'bad'
                    }
                  >
                    {s.qg_pass_rate != null ? fmtPct(s.qg_pass_rate) : '—'}
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
            );
          })}

          {showDecisionTrace && projection.decision_traces && projection.decision_traces.length > 0 && (
            <DecisionTracePanel traces={projection.decision_traces} />
          )}

          {!projection.provisioned && (
            <Text as="em" size="xs" color="tertiary" style={{ marginTop: 8, display: 'block' }}>
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10623).
            </Text>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
