// 2D companion to DelegationMetrics3D. Shares the data hook and the
// parts-of-whole framing, but renders as a dense terminal-style status
// panel: a KPI header row, a horizontal stacked model-distribution bar
// (replacing the old SVG donut), task-type mini-bars, and a quality-gate
// ratio bar. No WebGL, no donut geometry — every pixel carries data.
import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { useThemeColors } from '@/theme';
import type { DelegationSummary } from './DelegationMetrics3D';
import { useDelegationRunContextOptional } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';

// avgLatencyMs is not in every projection snapshot (the file-source
// fixture omits it); treat it and the per-model breakdown as optional so
// the panel degrades gracefully when a field is absent. The Postgres
// projection serializes aggregate `count` values as strings ("13"), so
// counts are read as `string | number` and coerced via Number() before
// any arithmetic — adding them as-is would concatenate.
type Count = number | string;
type Summary = Omit<DelegationSummary, 'byTaskType'> & {
  avgLatencyMs?: number;
  byTaskType: Array<{ taskType: string; count: Count }>;
  byModel?: Array<{ model: string; count: Count }>;
};

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

// Model IDs arrive fully-qualified (e.g. "cyankiwi/Qwen3-Coder-30B-A3B").
// Strip the org prefix and any version/quant suffix so the legend reads
// at small sizes; the full id stays in the title attribute for hover.
function shortModel(model: string): string {
  const base = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return base.length > 22 ? `${base.slice(0, 21)}…` : base;
}

interface Segment {
  label: string;
  fullLabel: string;
  count: number;
  pct: number;
  color: string;
}

function StatTile({
  label,
  value,
  valueColor = 'primary',
  sub,
}: {
  label: string;
  value: string;
  valueColor?: 'primary' | 'ok' | 'warn' | 'bad';
  sub?: string;
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '8px 10px',
        background: 'var(--panel-2)',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
      }}
    >
      <Text as="div" size="xs" family="mono" color="tertiary" transform="uppercase" truncate>
        {label}
      </Text>
      <Text as="div" size="2xl" weight="bold" family="mono" color={valueColor} tabularNums truncate>
        {value}
      </Text>
      {sub && (
        <Text as="div" size="xs" family="mono" color="secondary" tabularNums truncate>
          {sub}
        </Text>
      )}
    </div>
  );
}

// One labelled, percentage-driven horizontal bar — used for the task-type
// breakdown. The track is the same panel-2 surface as the KPI tiles so the
// fill reads as data against an inset trough.
function BreakdownRow({ seg, dimmed, onHover }: { seg: Segment; dimmed: boolean; onHover: () => void }) {
  return (
    <div
      onPointerEnter={onHover}
      title={`${seg.fullLabel}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2.5rem 2.75rem',
        alignItems: 'center',
        gap: 8,
        opacity: dimmed ? 0.45 : 1,
        cursor: 'default',
        transition: 'opacity 120ms ease-out',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <Text as="div" size="sm" family="mono" color="primary" truncate>
          {seg.label}
        </Text>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'var(--panel-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(2, seg.pct)}%`,
              background: seg.color,
              borderRadius: 2,
              transition: 'width 0.5s ease-out',
            }}
          />
        </div>
      </div>
      <Text as="span" size="sm" family="mono" color="secondary" tabularNums style={{ textAlign: 'right' }}>
        {seg.count}
      </Text>
      <Text as="span" size="sm" family="mono" color="secondary" tabularNums style={{ textAlign: 'right' }}>
        {seg.pct.toFixed(0)}%
      </Text>
    </div>
  );
}

export default function DelegationMetrics2D({ config }: { config: Record<string, unknown> }) {
  const showSavings = config.showSavings !== false;
  const showQualityGates = config.showQualityGates !== false;
  const qualityGateThreshold =
    typeof config.qualityGateThreshold === 'number' ? config.qualityGateThreshold : 0.8;

  const runCtx = useDelegationRunContextOptional();
  const dataSourceMode = useDataSourceMode();

  const { data: dataArr, isLoading: queryLoading, error: queryError } = useProjectionQuery<Summary>({
    topic: TOPICS.delegationSummary,
    queryKey: ['delegation-summary'],
    refetchInterval: 60_000,
    enabled: !runCtx,
  });

  const isLoading = runCtx ? runCtx.snapshot.isLoading : queryLoading;
  const error = runCtx ? runCtx.snapshot.primaryError : queryError;
  const data = (runCtx ? runCtx.snapshot.summary : (dataArr?.[0] ?? null)) as Summary | null;

  const colors = useThemeColors();
  const [hoverModel, setHoverModel] = useState<number | null>(null);
  const [hoverTask, setHoverTask] = useState<string | null>(null);

  // Model distribution drives the stacked bar that replaces the donut.
  const modelSegments = useMemo<Segment[]>(() => {
    const rows = (data?.byModel ?? []).map((m) => ({ label: m.model, count: Number(m.count) }));
    const total = rows.reduce((acc, m) => acc + m.count, 0);
    if (total === 0) return [];
    return rows
      .sort((a, b) => b.count - a.count)
      .map((m, i) => ({
        label: shortModel(m.label),
        fullLabel: m.label,
        count: m.count,
        pct: (m.count / total) * 100,
        color: colors.chart[i % colors.chart.length],
      }));
  }, [data, colors.chart]);

  const taskSegments = useMemo<Segment[]>(() => {
    const rows = (data?.byTaskType ?? []).map((t) => ({ label: t.taskType, count: Number(t.count) }));
    const total = rows.reduce((acc, t) => acc + t.count, 0);
    if (total === 0) return [];
    return rows
      .sort((a, b) => b.count - a.count)
      .map((t, i) => ({
        label: t.label,
        fullLabel: t.label,
        count: t.count,
        pct: (t.count / total) * 100,
        color: colors.chart[i % colors.chart.length],
      }));
  }, [data, colors.chart]);

  const isEmpty = !data || data.totalDelegations === 0;

  const passRate = data?.qualityGatePassRate ?? 0;
  const gatePasses = passRate >= qualityGateThreshold;
  const passed = data?.qualityGatePassed;
  const gateTotal = data?.qualityGateTotal;
  const failed = passed != null && gateTotal != null ? Math.max(0, gateTotal - passed) : null;

  return (
    <ComponentWrapper
      title="Delegation Metrics"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No delegation events"
      emptyHint="Delegation events appear when tasks are delegated to agents. In file mode, add fixture files under fixtures/onex.snapshot.projection.delegation.summary.v1/"
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      {data && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* KPI header row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <StatTile label="Delegations" value={data.totalDelegations.toLocaleString()} />
            {showQualityGates && (
              <StatTile
                label="Local Success"
                value={`${Math.round(passRate * 100)}%`}
                valueColor={gatePasses ? 'ok' : 'warn'}
                sub={passed != null && gateTotal != null ? `${passed}/${gateTotal} local` : undefined}
              />
            )}
            {data.avgLatencyMs != null && <StatTile label="Avg Latency" value={fmtMs(data.avgLatencyMs)} />}
            {showSavings && <StatTile label="Savings" value={`$${data.totalSavingsUsd.toFixed(2)}`} />}
          </div>

          {/* Model distribution — stacked bar + legend (replaces donut) */}
          {modelSegments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text as="span" size="xs" family="mono" color="tertiary" transform="uppercase">
                  Model Distribution
                </Text>
                <Text as="span" size="xs" family="mono" color="tertiary" tabularNums>
                  {modelSegments.length} {modelSegments.length === 1 ? 'model' : 'models'}
                </Text>
              </div>
              <div
                onPointerLeave={() => setHoverModel(null)}
                style={{
                  display: 'flex',
                  height: 14,
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid var(--line-2)',
                  background: 'var(--panel-2)',
                }}
              >
                {modelSegments.map((seg, i) => (
                  <div
                    key={seg.fullLabel}
                    title={`${seg.fullLabel}: ${seg.count} (${seg.pct.toFixed(1)}%)`}
                    onPointerEnter={() => setHoverModel(i)}
                    style={{
                      width: `${seg.pct}%`,
                      background: seg.color,
                      opacity: hoverModel === null || hoverModel === i ? 1 : 0.4,
                      transition: 'opacity 120ms ease-out, width 0.5s ease-out',
                      cursor: 'default',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
                {modelSegments.map((seg, i) => (
                  <div
                    key={`${seg.fullLabel}-legend`}
                    onPointerEnter={() => setHoverModel(i)}
                    onPointerLeave={() => setHoverModel(null)}
                    title={seg.fullLabel}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                      opacity: hoverModel === null || hoverModel === i ? 1 : 0.45,
                      transition: 'opacity 120ms ease-out',
                      cursor: 'default',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{ width: 9, height: 9, borderRadius: 2, background: seg.color, flex: '0 0 auto' }}
                    />
                    <Text as="span" size="sm" family="mono" color="primary" truncate style={{ maxWidth: 150 }}>
                      {seg.label}
                    </Text>
                    <Text as="span" size="sm" family="mono" color="secondary" tabularNums>
                      {seg.pct.toFixed(0)}%
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task-type breakdown — labelled mini-bars */}
          {taskSegments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Text as="span" size="xs" family="mono" color="tertiary" transform="uppercase">
                Task Types
              </Text>
              <div onPointerLeave={() => setHoverTask(null)} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {taskSegments.map((seg) => (
                  <BreakdownRow
                    key={seg.fullLabel}
                    seg={seg}
                    dimmed={hoverTask !== null && hoverTask !== seg.fullLabel}
                    onHover={() => setHoverTask(seg.fullLabel)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Local vs escalated ratio bar */}
          {showQualityGates && passed != null && gateTotal != null && gateTotal > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text as="span" size="xs" family="mono" color="tertiary" transform="uppercase">
                  Local vs Escalated
                </Text>
                <Text as="span" size="xs" family="mono" color="secondary" tabularNums>
                  {passed} local{failed != null ? ` · ${failed} escalated` : ''}
                </Text>
              </div>
              <div
                style={{
                  display: 'flex',
                  height: 10,
                  borderRadius: 4,
                  overflow: 'hidden',
                  border: '1px solid var(--line-2)',
                  background: 'var(--panel-2)',
                }}
              >
                <div
                  title={`${passed} handled locally`}
                  style={{
                    width: `${(passed / gateTotal) * 100}%`,
                    background: 'var(--status-ok)',
                    transition: 'width 0.5s ease-out',
                  }}
                />
                {failed != null && failed > 0 && (
                  <div
                    title={`${failed} escalated to cloud`}
                    style={{
                      width: `${(failed / gateTotal) * 100}%`,
                      background: 'var(--status-bad)',
                      transition: 'width 0.5s ease-out',
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
