/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useState, useMemo, useCallback } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { CountUp } from '@/components/primitives';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import { fixed as fmtFixed } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in AbCompareWidget.static.css.
import './AbCompareWidget.static.css';

// ── Data types ──────────────────────────────────────────────────────

export interface AbCompareRow {
  correlation_id: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  usage_source: string | null;
  created_at: string;
  task_description?: string;
}

interface ModelOption {
  id: string;
  name: string;
  tier: 'local' | 'cloud';
  cost: number;
  latency: number;
  tokens: number;
  host: string;
}

const _INTENTS = [
  { id: 'code_generation', label: 'Code generation' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'classification', label: 'Classification' },
  { id: 'complex_reasoning', label: 'Complex reasoning' },
  { id: 'large_context', label: 'Large context' },
];
void _INTENTS;

// ── Formatting helpers ──────────────────────────────────────────────

function shortModel(id: string): string {
  const parts = id.split('/');
  const name = parts[parts.length - 1];
  return name.replace(/-AWQ.*|-GGUF.*|-Instruct.*|-4bit.*/i, '').substring(0, 22);
}

function shortCorrelationId(id: string): string {
  if (id.length <= 8) return id;
  return id.slice(0, 4) + '…' + id.slice(-4);
}

// ── Grouped task from projection rows ───────────────────────────────

interface TaskGroup {
  id: string;
  label: string;
  intent: string;
  prompt: string;
  chosenModel: ModelOption;
  models: ModelOption[];
  cheapestCost: number;
  cloudCost: number;
  savedDollars: number;
  savedPct: number;
}

function buildTasksFromProjection(data: AbCompareRow[]): TaskGroup[] {
  const map = new Map<string, AbCompareRow[]>();
  for (const row of data) {
    const existing = map.get(row.correlation_id);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.correlation_id, [row]);
    }
  }

  const tasks: TaskGroup[] = [];
  for (const [correlationId, rows] of map) {
    const sorted = [...rows].sort(
      (a, b) => (a.estimated_cost_usd ?? 0) - (b.estimated_cost_usd ?? 0),
    );
    const cheapest = sorted[0];
    const cheapestCost = cheapest.estimated_cost_usd ?? 0;
    const modelNames = rows.map((r) => shortModel(r.model_id));

    const taskDesc = rows[0].task_description;
    const taskLabel = taskDesc || 'Run ' + shortCorrelationId(correlationId);

    const mostExpensiveCost = Math.max(...rows.map((r) => r.estimated_cost_usd ?? 0));
    const actualCloudCost = mostExpensiveCost > 0 ? mostExpensiveCost : 0.118;
    const actualSaved = Math.max(0, actualCloudCost - cheapestCost);
    const actualPct = actualCloudCost > 0 ? Math.round((actualSaved / actualCloudCost) * 100) : 0;

    const rowModels = sorted.map((r) => ({
      id: r.model_id,
      name: shortModel(r.model_id),
      tier: (r.estimated_cost_usd ?? 0) === 0 ? 'local' as const : 'cloud' as const,
      cost: r.estimated_cost_usd ?? 0,
      latency: (r.latency_ms ?? 0) / 1000,
      tokens: r.total_tokens,
      host: r.usage_source ?? '',
    }));

    tasks.push({
      id: correlationId,
      label: taskLabel,
      intent: taskDesc ? taskLabel : 'code_generation',
      prompt: taskDesc
        ? `${taskDesc}\n\ncorrelation_id: ${correlationId}\nModels compared: ${modelNames.join(', ')}`
        : `correlation_id: ${correlationId}\nModels compared: ${modelNames.join(', ')}`,
      chosenModel: rowModels[0],
      models: rowModels,
      cheapestCost,
      cloudCost: actualCloudCost,
      savedDollars: actualSaved,
      savedPct: actualPct,
    });
  }

  return tasks;
}

// ── Caret icon ──────────────────────────────────────────────────────

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      style={{
        transition: 'transform .15s',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path
        d="M3,1 L7,5 L3,9"
        stroke="var(--ds-ink-3)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Prompt block ────────────────────────────────────────────────────

function PromptBlock({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!prompt) return null;

  const preview = prompt.length > 96 ? prompt.slice(0, 96) + '…' : prompt;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="ab-compare-widget-seffb15"
    >
      <button className="ab-compare-widget-sa712cb"
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        <Caret open={open} />
        <span
          className="mono ab-compare-widget-sdb50b4"
        >
          Prompt
        </span>
        {!open && (
          <span className="ab-compare-widget-s3a4d75"
          >
            {preview}
          </span>
        )}
        <span style={{ flex: open ? 1 : 0 }} />
        <span
          onClick={copy}
          className="mono"
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: copied ? 'var(--ds-ok-soft)' : 'var(--ds-inset)',
            color: copied ? 'var(--ds-ok)' : 'var(--ds-ink-3)',
            "fontSize": 9,
            "fontWeight": 700,
            "letterSpacing": '0.1em',
            "textTransform": 'uppercase',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
      {open && (
        <pre
          className="mono ab-compare-widget-s210dfb"
        >
          {prompt}
        </pre>
      )}
    </div>
  );
}

// ── Ledger detail view ──────────────────────────────────────────────

function LedgerDetail({
  models,
  chosenId,
  dollars,
}: {
  models: ModelOption[];
  chosenId: string;
  dollars: number;
}) {
  return (
    <div className="ab-compare-widget-s7dd398"
    >
      {/* Header */}
      <div className="ab-compare-widget-s5a3f63"
      >
        <div className="mono ab-compare-widget-s797961">
          MODEL
        </div>
        <div className="mono ab-compare-widget-s460335">
          CREDIT
        </div>
        <div className="mono ab-compare-widget-sa713fc">
          DEBIT
        </div>
      </div>

      {/* Rows */}
      {models.map((m, i) => {
        const isWinner = m.id === chosenId;
        const free = m.cost === 0;
        return (
          <div
            key={`${m.id}:${m.host}:${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px',
              gap: 10,
              padding: '5px 0',
              borderBottom: i < models.length - 1 ? '1px dashed var(--ds-line-soft)' : 'none',
              alignItems: 'center',
            }}
          >
            <div className="ab-compare-widget-s5f3741">
              {isWinner && <span className="ab-compare-widget-s67d777">{'★'}</span>}
              <span className="mono" style={{ "fontSize": 11, "fontWeight": isWinner ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </span>
              <span className="mono ab-compare-widget-sa29e5a">{'·'} {m.host}</span>
            </div>
            <div className="mono tnum" style={{ "fontSize": 11, color: free ? 'var(--ds-ok)' : 'var(--ds-ink-4)', textAlign: 'right' }}>
              {free ? '+ $0.118' : '—'}
            </div>
            <div className="mono tnum" style={{ "fontSize": 11, color: free ? 'var(--ds-ink-4)' : 'var(--ds-bad)', textAlign: 'right' }}>
              {free ? '—' : `– $${fmtFixed(m.cost, 3)}`}
            </div>
          </div>
        );
      })}

      {/* Net total */}
      <div className="ab-compare-widget-sbaaf50"
      >
        <div className="mono ab-compare-widget-sc5cfdd">
          Net
        </div>
        <div />
        <div className="mono tnum ab-compare-widget-sed0a79">
          + ${fmtFixed(dollars, 3)}
        </div>
      </div>
    </div>
  );
}

// ── Task list item ──────────────────────────────────────────────────

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${fmtFixed((ms / 1000), 1)}s`;
  return `${ms}ms`;
}

function TaskListItem({
  task,
  expanded,
  onToggle,
}: {
  task: TaskGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const chosen = task.chosenModel;
  const modelCount = task.models.length;
  const winnerLatencyMs = chosen.latency * 1000;
  const maxCost = Math.max(...task.models.map((m) => m.cost));
  const minCost = Math.min(...task.models.map((m) => m.cost));
  const costRange = minCost === maxCost
    ? (minCost === 0 ? 'FREE' : `$${fmtFixed(minCost, 3)}`)
    : `${minCost === 0 ? '$0' : `$${fmtFixed(minCost, 3)}`} – $${fmtFixed(maxCost, 3)}`;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--ds-line-soft)',
        transition: 'background .15s',
        background: expanded ? 'var(--ds-inset)' : 'transparent',
      }}
    >
      {/* Summary row */}
      <button className="ab-compare-widget-s1a359f"
        type="button"
        onClick={onToggle}
      >
        <Caret open={expanded} />
        <div className="ab-compare-widget-s2cd52a">
          <div className="ab-compare-widget-s86ecb8">
            {task.label}
          </div>
          <div className="mono ab-compare-widget-s462708">
            {chosen.name} {'·'} {chosen.tier}
          </div>
        </div>
        <div className="mono tnum ab-compare-widget-sa74b0c">
          {modelCount} models
        </div>
        <div className="mono tnum" style={{ "fontSize": 11, color: winnerLatencyMs < 5000 ? 'var(--ds-ok)' : winnerLatencyMs < 30000 ? 'var(--ds-ink-2)' : 'var(--ds-warn)', textAlign: 'right' }}>
          {formatLatency(winnerLatencyMs)}
        </div>
        <div className="mono tnum" style={{ "fontSize": 11, "fontWeight": 600, textAlign: 'right', color: maxCost === 0 ? 'var(--ds-ok)' : 'var(--ds-ink-2)' }}>
          {costRange}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="ab-compare-widget-s3ec5ac">
          <PromptBlock prompt={task.prompt} />
          <LedgerDetail models={task.models} chosenId={chosen.id} dollars={task.savedDollars} />
          <div className="ab-compare-widget-scce500">
            <span className="mono">correlation_id: {shortCorrelationId(task.id)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort helpers ────────────────────────────────────────────────────

type SortKey = 'task' | 'models' | 'latency' | 'cost';
type SortDir = 'asc' | 'desc';
interface SortState {
  key: SortKey;
  dir: SortDir;
}

function HeaderCell({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const active = sort?.key === sortKey;
  const arrow = !active ? '⇕' : sort.dir === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="mono"
      style={{
        all: 'unset',
        cursor: 'pointer',
        "fontSize": 9,
        "fontWeight": 700,
        color: active ? 'var(--ds-link)' : 'var(--ds-ink-3)',
        "letterSpacing": '0.16em',
        textAlign: align,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {label}
      <span
        style={{
          display: 'inline-block',
          marginLeft: 4,
          color: active ? 'var(--ds-brand)' : 'currentColor',
          opacity: active ? 1 : 0.35,
        }}
      >
        {arrow}
      </span>
    </button>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export default function AbCompareWidget({
  config: _config,
}: {
  config: Record<string, unknown>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const dataSourceMode = useDataSourceMode();

  const { data, isLoading, error } = useProjectionQuery<AbCompareRow>({
    topic: TOPICS.abCompare,
    queryKey: ['ab-compare'],
    refetchInterval: refreshInterval(),
  });

  // Build tasks from projection data. Storybook owns demo fixture seeding; the
  // widget itself preserves empty-state semantics when the projection is empty.
  const tasks = useMemo(() => {
    if (data && data.length > 0) {
      return buildTasksFromProjection(data);
    }
    return [];
  }, [data]);

  // Auto-expand first task
  const effectiveOpenId = openId;

  // Aggregate totals
  const totals = useMemo(() => {
    if (tasks.length === 0) return { savedPct: 0, savedDollars: 0, count: 0 };
    const cloud = tasks.length * 0.118;
    let local = 0;
    for (const t of tasks) {
      local += t.cheapestCost;
    }
    const saved = cloud - local;
    return {
      savedPct: Math.round((saved / cloud) * 100),
      savedDollars: saved,
      count: tasks.length,
    };
  }, [tasks]);

  // Sort tasks
  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  }, []);

  const sortedTasks = useMemo(() => {
    if (!sort) return tasks;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (t: TaskGroup) => {
      switch (sort.key) {
        case 'task': return t.label;
        case 'models': return t.models.length;
        case 'latency': return t.chosenModel.latency;
        case 'cost': return t.cloudCost;
        default: return 0;
      }
    };
    return [...tasks].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tasks, sort]);

  return (
    <ComponentWrapper
      title="AB Model Cost Compare"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={tasks.length === 0}
      emptyMessage="No comparison data yet"
      emptyHint="Results appear after the first ab-compare run completes. In file mode, add fixture files under fixtures/onex.snapshot.projection.ab-compare.v1/"
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      <div className="ab-compare-widget-s1a382a">
        {/* Hero header */}
        <div className="ab-compare-widget-s4a0162">
          <div>
            <div className="eyebrow">A/B model cost compare {'·'} last {totals.count} tasks</div>
            <div className="ab-compare-widget-sdee618">
              Tap any task to see the prompt and correlation.
            </div>
          </div>
          <div className="ab-compare-widget-sb99074">
            <div className="ab-compare-widget-s13cbe0">
              <div className="mono tnum ab-compare-widget-s36e936">
                <CountUp value={totals.savedPct} suffix="%" />
              </div>
              <div className="eyebrow ab-compare-widget-s644dd4">saved</div>
            </div>
            <div className="ab-compare-widget-s89e50e" />
            <div className="ab-compare-widget-s13cbe0">
              <div className="mono tnum ab-compare-widget-s0dc60a">
                <CountUp value={totals.savedDollars} prefix="$" decimals={3} />
              </div>
              <div className="eyebrow ab-compare-widget-s45f395">vs cloud-only</div>
            </div>
          </div>
        </div>

        {/* Sortable column headers */}
        <div className="ab-compare-widget-s746dd0"
        >
          <div />
          <HeaderCell label="TASK" sortKey="task" sort={sort} onSort={toggleSort} />
          <HeaderCell label="MODELS" sortKey="models" sort={sort} onSort={toggleSort} align="center" />
          <HeaderCell label="LATENCY" sortKey="latency" sort={sort} onSort={toggleSort} align="right" />
          <HeaderCell label="COST RANGE" sortKey="cost" sort={sort} onSort={toggleSort} align="right" />
        </div>

        {/* Task list */}
        {sortedTasks.map((t) => (
          <TaskListItem
            key={t.id}
            task={t}
            expanded={effectiveOpenId === t.id}
            onToggle={() => setOpenId(effectiveOpenId === t.id ? null : t.id)}
          />
        ))}
      </div>
    </ComponentWrapper>
  );
}
