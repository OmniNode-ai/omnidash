import { useState, useMemo, useCallback } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { CountUp } from '@/components/primitives';

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

// ── Synthetic data for fallback ─────────────────────────────────────

const MODELS = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B-A3B', tier: 'local', cost: 0.000, latency: 1.4, tokens: 469, host: '.200' },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B-A3B', tier: 'local', cost: 0.000, latency: 2.6, tokens: 91, host: '.200' },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', tier: 'local', cost: 0.000, latency: 0.8, tokens: 387, host: '.201' },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', tier: 'local', cost: 0.000, latency: 7.0, tokens: 891, host: '.201' },
  { id: 'glm-4-plus', name: 'GLM-4-Plus', tier: 'cloud', cost: 0.0009, latency: 8.7, tokens: 981, host: 'cloud' },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', tier: 'cloud', cost: 0.118, latency: 21.0, tokens: 17600, host: 'cloud' },
];

const INTENTS = [
  { id: 'code_generation', label: 'Code generation' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'classification', label: 'Classification' },
  { id: 'complex_reasoning', label: 'Complex reasoning' },
  { id: 'large_context', label: 'Large context' },
];

const TASK_PRESETS = [
  { id: 'palindrome', label: 'Write a palindrome checker (Python)', intent: 'code_generation', chosen: 'qwen3-coder-30b',
    prompt: 'Write a Python function `is_palindrome(s: str) -> bool` that returns True if s reads the same forwards and backwards, ignoring case, whitespace, and non-alphanumeric characters. Include docstring + 4 unit tests covering the empty string, single char, even/odd length, and a phrase with punctuation.' },
  { id: 'kafka-bug', label: 'Diagnose Kafka consumer-lag in payments-svc', intent: 'debugging', chosen: 'deepseek-r1-32b',
    prompt: 'payments-svc consumer group `payments-v3` is reporting 4.2M message lag on topic `payments.charges.v2`. Lag started at 14:02 UTC. Attached: consumer logs (last 5min), broker metrics, recent deploys. Identify root cause and propose a fix that doesn\'t drop messages.' },
  { id: 'monorepo', label: 'Refactor 18-file monorepo to ESM', intent: 'large_context', chosen: 'qwen3-next-80b',
    prompt: 'Convert this 18-file CommonJS monorepo to ESM. Update imports/exports, fix `__dirname` usage, update package.json `"type": "module"`, and migrate Jest config. Preserve all behavior. Return a unified diff.' },
  { id: 'intent-rule', label: 'Classify ticket type from PR description', intent: 'classification', chosen: 'deepseek-r1-14b',
    prompt: 'Classify this PR description into one of: bugfix | feature | refactor | docs | chore. Respond with exactly one label and a confidence score 0-1.\n\nPR: "Fix race condition in auth middleware where concurrent requests could..."' },
  { id: 'sec-review', label: 'Review auth flow for OWASP Top-10', intent: 'complex_reasoning', chosen: 'claude-sonnet-4-5',
    prompt: 'Audit the attached auth flow against OWASP Top-10 (2021). For each category, state: applies / N/A, evidence (line refs), severity, and a concrete remediation. Pay particular attention to A01 (Broken Access Control), A02 (Cryptographic Failures), and A07 (Identification & Authentication Failures).' },
];

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
  chosenModel: typeof MODELS[0];
  models: typeof MODELS;
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

function buildTasksFromSynthetic(): TaskGroup[] {
  return TASK_PRESETS.map((preset) => {
    const chosen = MODELS.find((m) => m.id === preset.chosen) ?? MODELS[0];
    const cloudCost = 0.118;
    const winnerCost = chosen.cost;
    const savedDollars = Math.max(0, cloudCost - winnerCost);
    const savedPct = cloudCost > 0 ? Math.round((savedDollars / cloudCost) * 100) : 0;
    return {
      id: preset.id,
      label: preset.label,
      intent: preset.intent,
      prompt: preset.prompt,
      chosenModel: chosen,
      models: MODELS,
      cheapestCost: winnerCost,
      cloudCost,
      savedDollars,
      savedPct,
    };
  });
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
        stroke="var(--ink-3)"
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
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '8px 10px',
          boxSizing: 'border-box',
        }}
      >
        <Caret open={open} />
        <span
          className="mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--ink-3)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Prompt
        </span>
        {!open && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              fontStyle: 'italic',
            }}
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
            background: copied ? 'var(--good-soft)' : 'var(--bg-sunken)',
            color: copied ? 'var(--good)' : 'var(--ink-3)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
      {open && (
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: '10px 12px 12px 32px',
            background: 'var(--bg-sunken)',
            fontSize: 11,
            lineHeight: 1.55,
            color: 'var(--ink-2)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            borderTop: '1px solid var(--line-2)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
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
  models: typeof MODELS;
  chosenId: string;
  dollars: number;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 90px 90px',
          gap: 10,
          paddingBottom: 6,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.16em' }}>
          MODEL
        </div>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--good)', letterSpacing: '0.16em', textAlign: 'right' }}>
          CREDIT
        </div>
        <div className="mono" style={{ fontSize: 9, fontWeight: 700, color: 'var(--bad)', letterSpacing: '0.16em', textAlign: 'right' }}>
          DEBIT
        </div>
      </div>

      {/* Rows */}
      {models.map((m, i) => {
        const isWinner = m.id === chosenId;
        const free = m.cost === 0;
        return (
          <div
            key={m.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px',
              gap: 10,
              padding: '5px 0',
              borderBottom: i < models.length - 1 ? '1px dashed var(--line-2)' : 'none',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {isWinner && <span style={{ color: 'var(--accent)', fontSize: 10 }}>{'★'}</span>}
              <span className="mono" style={{ fontSize: 11, fontWeight: isWinner ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{'·'} {m.host}</span>
            </div>
            <div className="mono tnum" style={{ fontSize: 11, color: free ? 'var(--good)' : 'var(--ink-4)', textAlign: 'right' }}>
              {free ? '+ $0.118' : '—'}
            </div>
            <div className="mono tnum" style={{ fontSize: 11, color: free ? 'var(--ink-4)' : 'var(--bad)', textAlign: 'right' }}>
              {free ? '—' : `– $${m.cost.toFixed(3)}`}
            </div>
          </div>
        );
      })}

      {/* Net total */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 90px 90px',
          gap: 10,
          padding: '8px 0 2px',
          borderTop: '1.5px solid var(--ink)',
          marginTop: 4,
        }}
      >
        <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Net
        </div>
        <div />
        <div className="mono tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--good)', textAlign: 'right' }}>
          + ${dollars.toFixed(3)}
        </div>
      </div>
    </div>
  );
}

// ── Task list item ──────────────────────────────────────────────────

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
  const winnerCost = task.cheapestCost;
  const intentLabel = INTENTS.find((i) => i.id === task.intent)?.label ?? task.intent;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--line-2)',
        transition: 'background .15s',
        background: expanded ? 'var(--bg-sunken)' : 'transparent',
      }}
    >
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: 'unset',
          display: 'grid',
          gridTemplateColumns: '20px 1fr 110px 90px 90px',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          padding: '10px 14px',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <Caret open={expanded} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.label}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
            {intentLabel}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: chosen.tier === 'local' ? 'var(--good)' : 'var(--effect)', whiteSpace: 'nowrap' }}>
          {chosen.name.split('-').slice(0, 2).join('-')}
        </div>
        <div className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: winnerCost === 0 ? 'var(--good)' : 'var(--effect)', textAlign: 'right' }}>
          {winnerCost === 0 ? 'FREE' : `$${winnerCost.toFixed(3)}`}
        </div>
        <div className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: 'var(--good)', textAlign: 'right' }}>
          +{task.savedPct}%
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '8px 14px 18px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PromptBlock prompt={task.prompt} />
          <LedgerDetail models={task.models} chosenId={chosen.id} dollars={task.savedDollars} />
          <div style={{ fontSize: 10, color: 'var(--ink-3)', fontStyle: 'italic' }}>
            <span className="mono">correlation_id: 0xa31f{'…'}b8c4</span> {'·'} receipt signed by deepseek-r1-32b
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort helpers ────────────────────────────────────────────────────

type SortKey = 'task' | 'routed' | 'cost' | 'saved';
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
  align?: 'left' | 'right';
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
        fontSize: 9,
        fontWeight: 700,
        color: active ? 'var(--accent-ink)' : 'var(--ink-3)',
        letterSpacing: '0.16em',
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
          color: active ? 'var(--accent)' : 'currentColor',
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

  const { data, isLoading, error } = useProjectionQuery<AbCompareRow>({
    topic: TOPICS.abCompare,
    queryKey: ['ab-compare'],
    refetchInterval: 10_000,
  });

  // Build tasks from projection data or fall back to synthetic
  const tasks = useMemo(() => {
    if (data && data.length > 0) {
      return buildTasksFromProjection(data);
    }
    return buildTasksFromSynthetic();
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
        case 'routed': return t.chosenModel.name;
        case 'cost': return t.cheapestCost;
        case 'saved': return t.savedDollars;
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
      isEmpty={false}
      emptyMessage="No comparison data yet"
      emptyHint="Results appear after the first ab-compare run completes"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
        {/* Hero header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div>
            <div className="eyebrow">A/B model cost compare {'·'} last {totals.count} tasks</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: 'var(--ink-2)' }}>
              Tap any task to see the prompt + receipt.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="mono tnum" style={{ fontSize: 24, fontWeight: 800, color: 'var(--good)', lineHeight: 1 }}>
                <CountUp value={totals.savedPct} suffix="%" />
              </div>
              <div className="eyebrow" style={{ color: 'var(--good)', marginTop: 3 }}>saved</div>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--line)' }} />
            <div style={{ textAlign: 'right' }}>
              <div className="mono tnum" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                <CountUp value={totals.savedDollars} prefix="$" decimals={3} />
              </div>
              <div className="eyebrow" style={{ marginTop: 3 }}>vs cloud-only</div>
            </div>
          </div>
        </div>

        {/* Sortable column headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 1fr 110px 90px 90px',
            gap: 14,
            padding: '8px 14px',
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div />
          <HeaderCell label="TASK" sortKey="task" sort={sort} onSort={toggleSort} />
          <HeaderCell label="ROUTED TO" sortKey="routed" sort={sort} onSort={toggleSort} />
          <HeaderCell label="COST" sortKey="cost" sort={sort} onSort={toggleSort} align="right" />
          <HeaderCell label="SAVED" sortKey="saved" sort={sort} onSort={toggleSort} align="right" />
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
