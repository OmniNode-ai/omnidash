/* eslint-disable local/no-typography-inline -- OMN-10346 prototype widget; typography compliance enforced by separate scorecard. */
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { KPI, SortableTable } from '@/components/primitives';
import type { ColumnDef } from '@/components/primitives';

// ── View model types (OMN-10346 dashboard view contract) ─────────────

export type ExecutionMode = 'local' | 'cloud' | 'delegated' | 'market' | 'workflow_child';

export interface CostSavingsRow {
  model_id: string;
  display_name: string;
  execution_mode: ExecutionMode;
  task_count: number;
  tokens_total: number;
  cost_usd: number;
  baseline_cost_usd: number;
  savings_usd: number;
  savings_pct: number;
  runtime_address: string | null;
  evidence_ref: string | null;
}

export interface CostSavingsOverviewProjection {
  /** Aggregation window, e.g. "24h", "7d", "30d". */
  window: string;
  total_cost_usd: number;
  total_baseline_cost_usd: number;
  total_savings_usd: number;
  savings_rate: number;
  tokens_total: number;
  local_token_pct: number;
  captured_at: string;
  rows: CostSavingsRow[];
  warnings: string[];
  provisioned: boolean;
}

// ── Config ────────────────────────────────────────────────────────────

type CostSavingsOverviewConfig = {
  window?: '24h' | '7d' | '30d';
  showWarnings?: boolean;
};

// ── Derived helpers ───────────────────────────────────────────────────

const MODE_LABEL: Record<ExecutionMode, string> = {
  local: 'Local',
  cloud: 'Cloud',
  delegated: 'Delegated',
  market: 'Market',
  workflow_child: 'Workflow',
};

const MODE_COLOR: Record<ExecutionMode, string> = {
  local: 'var(--good)',
  cloud: 'var(--accent)',
  delegated: 'var(--orchestrator)',
  market: 'var(--reducer)',
  workflow_child: 'var(--effect)',
};

function fmtUsd(v: number): string {
  return v === 0 ? '$0.00' : `$${v.toFixed(v < 0.01 ? 4 : 2)}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

// ── KPI bar ───────────────────────────────────────────────────────────

function KPIBar({ overview }: { overview: CostSavingsOverviewProjection }) {
  const savingsTone = overview.total_savings_usd > 0 ? 'good' : 'default';
  const localPct = Math.round(overview.local_token_pct * 100);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        padding: '12px 0 16px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <KPI
        label="Cloud Spend"
        value={overview.total_cost_usd}
        prefix="$"
        decimals={2}
        tone="default"
      />
      <KPI
        label="Cloud Avoided"
        value={overview.total_savings_usd}
        prefix="$"
        decimals={2}
        tone={savingsTone}
      />
      <KPI
        label="Savings Rate"
        value={Math.round(overview.savings_rate * 100)}
        suffix="%"
        tone={savingsTone}
      />
      <KPI
        label="Local Tokens"
        value={localPct}
        suffix="%"
        tone={localPct >= 50 ? 'good' : 'warn'}
        caption={`${fmtTokens(overview.tokens_total)} total`}
      />
    </div>
  );
}

// ── Local vs cloud split bar ──────────────────────────────────────────

function SplitBar({ localPct }: { localPct: number }) {
  const cloudPct = 100 - localPct;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{ "fontSize": 10, "color": 'var(--ink-3)', "letterSpacing": '0.1em', "textTransform": 'uppercase' as const, marginBottom: 6, "fontWeight": 600 }}
      >
        Token routing split
      </div>
      <div style={{ display: 'flex', height: 20, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
        <div
          style={{
            width: `${localPct}%`,
            background: 'var(--good)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            color: '#fff',
            "fontSize": 10,
            "fontWeight": 700,
            "letterSpacing": '0.06em',
            transition: 'width .8s cubic-bezier(.2,.7,.3,1)',
            minWidth: localPct > 0 ? 32 : 0,
          }}
        >
          {localPct > 8 ? `${localPct}% local` : ''}
        </div>
        <div
          style={{
            width: `${cloudPct}%`,
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            color: '#fff',
            "fontSize": 10,
            "fontWeight": 700,
            "letterSpacing": '0.06em',
            minWidth: cloudPct > 0 ? 32 : 0,
          }}
        >
          {cloudPct > 8 ? `${cloudPct}% cloud` : ''}
        </div>
      </div>
    </div>
  );
}

// ── Per-model savings table ───────────────────────────────────────────

const COLUMNS: ColumnDef<CostSavingsRow>[] = [
  {
    key: 'display_name',
    label: 'Model',
    width: 'minmax(120px, 2fr)',
    render: (row) => (
      <span style={{ "fontWeight": 500, color: MODE_COLOR[row.execution_mode] }}>
        {row.display_name}
      </span>
    ),
  },
  {
    key: 'execution_mode',
    label: 'Mode',
    width: '72px',
    align: 'center',
    render: (row) => (
      <span
        className="mono"
        style={{
          "fontSize": 9,
          "fontWeight": 700,
          "letterSpacing": '0.12em',
          "textTransform": 'uppercase' as const,
          color: MODE_COLOR[row.execution_mode],
        }}
      >
        {MODE_LABEL[row.execution_mode]}
      </span>
    ),
  },
  {
    key: 'task_count',
    label: 'Tasks',
    width: '60px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.task_count,
  },
  {
    key: 'tokens_total',
    label: 'Tokens',
    width: '72px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.tokens_total,
    render: (row) => fmtTokens(row.tokens_total),
  },
  {
    key: 'cost_usd',
    label: 'Cost',
    width: '80px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.cost_usd,
    render: (row) => fmtUsd(row.cost_usd),
  },
  {
    key: 'baseline_cost_usd',
    label: 'Baseline',
    width: '80px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.baseline_cost_usd,
    render: (row) => (
      <span style={{ color: 'var(--warn)' }}>{fmtUsd(row.baseline_cost_usd)}</span>
    ),
  },
  {
    key: 'savings_usd',
    label: 'Saved',
    width: '80px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.savings_usd,
    render: (row) => (
      <span style={{ color: row.savings_usd > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
        {row.savings_usd > 0 ? `+${fmtUsd(row.savings_usd)}` : '—'}
      </span>
    ),
  },
  {
    key: 'savings_pct',
    label: 'Save%',
    width: '64px',
    align: 'right',
    mono: true,
    sortValue: (r) => r.savings_pct,
    render: (row) => (
      <span style={{ color: row.savings_pct > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
        {row.savings_pct > 0 ? fmtPct(row.savings_pct) : '—'}
      </span>
    ),
  },
  {
    key: 'evidence_ref',
    label: 'Evidence',
    width: '72px',
    align: 'center',
    render: (row) =>
      row.evidence_ref ? (
        <span
          className="mono"
          style={{ "fontSize": 9, color: 'var(--accent)', cursor: 'help' }}
          title={row.evidence_ref}
        >
          ref
        </span>
      ) : (
        <span style={{ "fontSize": 9, "color": 'var(--ink-4)' }}>provisional</span>
      ),
  },
];

// ── Warnings strip ────────────────────────────────────────────────────

function WarningsStrip({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '8px 12px',
        background: 'color-mix(in srgb, var(--warn) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)',
        borderRadius: 6,
        "fontSize": 11,
        color: 'var(--warn)',
        "lineHeight": 1.5,
      }}
    >
      {warnings.map((w, i) => (
        <div key={i}>⚠ {w}</div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 160,
        gap: 8,
        "color": 'var(--ink-3)',
      }}
    >
      <div style={{ "fontSize": 13, "fontWeight": 500 }}>No cost savings data available</div>
      <div style={{ "fontSize": 11, "color": 'var(--ink-4)', textAlign: 'center', maxWidth: 300 }}>
        Cost savings overview appears once the projection emitter lands.
        Upstream-blocked until node_dashboard_view_composer is deployed (OMN-10346).
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────

export default function CostSavingsOverviewWidget(props: { config: CostSavingsOverviewConfig }) {
  const { config } = props;
  const showWarnings = config.showWarnings ?? true;

  const { data, isLoading, error } = useProjectionQuery<CostSavingsOverviewProjection>({
    queryKey: ['cost-savings-overview', TOPICS.costSavingsOverview],
    topic: TOPICS.costSavingsOverview,
  });

  const overview = useMemo<CostSavingsOverviewProjection | null>(() => {
    const row = data?.[0];
    if (!row) return null;
    return row;
  }, [data]);

  const localPct = overview ? Math.round(overview.local_token_pct * 100) : 0;

  return (
    <ComponentWrapper
      title="Cost Savings Overview"
      isLoading={isLoading}
      error={error}
    >
      {!overview ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <KPIBar overview={overview} />

          <div style={{ marginTop: 16 }}>
            <SplitBar localPct={localPct} />
          </div>

          <div>
            <div
              style={{
                "fontSize": 10,
                "color": 'var(--ink-3)',
                "letterSpacing": '0.1em',
                "textTransform": 'uppercase' as const,
                marginBottom: 6,
                "fontWeight": 600,
              }}
            >
              Per-model breakdown
            </div>
            <SortableTable<CostSavingsRow>
              rows={overview.rows}
              columns={COLUMNS}
              initialSort={{ key: 'savings_usd', dir: 'desc' }}
              rowKey="model_id"
              dense
            />
          </div>

          {showWarnings && <WarningsStrip warnings={overview.warnings} />}

          {!overview.provisioned && (
            <div
              style={{
                marginTop: 8,
                "fontSize": 10,
                "color": 'var(--ink-4)',
                fontStyle: 'italic',
              }}
            >
              Projection upstream-blocked — displaying contract-valid fixtures (OMN-10346).
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
