import { useState, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { NodePill, CardHeader, Price } from '@/components/primitives';

// ── Synthetic data ──────────────────────────────────────────────────

const MODELS = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B-A3B', tier: 'local', cost: 0.000, host: '.200' },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B-A3B', tier: 'local', cost: 0.000, host: '.200' },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', tier: 'local', cost: 0.000, host: '.201' },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', tier: 'local', cost: 0.000, host: '.201' },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', tier: 'cloud', cost: 0.118, host: 'cloud' },
];

const INTENTS = [
  { id: 'code_generation', label: 'Code generation', color: 'var(--compute)' },
  { id: 'debugging', label: 'Debugging', color: 'var(--reducer)' },
  { id: 'classification', label: 'Classification', color: 'var(--orchestrator)' },
  { id: 'complex_reasoning', label: 'Complex reasoning', color: 'var(--accent)' },
  { id: 'large_context', label: 'Large context', color: 'var(--effect)' },
];

const TASK_PRESETS = [
  { id: 'palindrome', label: 'Write a palindrome checker (Python)', intent: 'code_generation', chosen: 'qwen3-coder-30b' },
  { id: 'kafka-bug', label: 'Diagnose Kafka consumer-lag in payments-svc', intent: 'debugging', chosen: 'deepseek-r1-32b' },
  { id: 'monorepo', label: 'Refactor 18-file monorepo to ESM', intent: 'large_context', chosen: 'qwen3-next-80b' },
  { id: 'intent-rule', label: 'Classify ticket type from PR description', intent: 'classification', chosen: 'deepseek-r1-14b' },
  { id: 'sec-review', label: 'Review auth flow for OWASP Top-10', intent: 'complex_reasoning', chosen: 'claude-sonnet-4-5' },
];

const ROUTING_RULES = [
  { type: 'Classification', model: 'DeepSeek-R1-14B', cost: 0, intentId: 'classification' },
  { type: 'Code generation', model: 'Qwen3-Coder-30B', cost: 0, intentId: 'code_generation' },
  { type: 'Complex reasoning', model: 'DeepSeek-R1-32B', cost: 0, intentId: 'complex_reasoning' },
  { type: 'Large context', model: 'Qwen3-Next-80B', cost: 0, intentId: 'large_context' },
  { type: 'Fallback / hard', model: 'Claude-Sonnet-4-5', cost: 0.118, intentId: 'debugging' },
];

// ── Arrow connector ─────────────────────────────────────────────────

function Arrow({ accent }: { accent?: boolean }) {
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" style={{ overflow: 'visible' }}>
      <line x1="0" y1="10" x2="26" y2="10" stroke={accent ? 'var(--accent)' : 'var(--ink-3)'} strokeWidth={accent ? 2 : 1.5} />
      <path d="M22,5 L30,10 L22,15" fill={accent ? 'var(--accent)' : 'var(--ink-3)'} />
    </svg>
  );
}

// ── Confidence bar ──────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${value * 100}%`, height: '100%', background: color, transition: 'width .5s' }} />
    </div>
  );
}

// ── Routing rules table ─────────────────────────────────────────────

function RoutingRulesTable({ rules, activeIntent, onSelectIntent }: {
  rules: typeof ROUTING_RULES;
  activeIntent: string;
  onSelectIntent: (intentId: string) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rules;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (r: typeof rules[0]) =>
      sort.key === 'type' ? r.type : sort.key === 'model' ? r.model : r.cost;
    return [...rules].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rules, sort]);

  const toggle = (key: string) =>
    setSort((prev) =>
      !prev || prev.key !== key
        ? { key, dir: 'desc' }
        : prev.dir === 'desc'
          ? { key, dir: 'asc' }
          : null,
    );

  const Header = ({ label, k, align = 'left' }: { label: string; k: string; align?: string }) => {
    const active = sort?.key === k;
    return (
      <button
        type="button"
        onClick={() => toggle(k)}
        className="mono"
        style={{
          all: 'unset',
          cursor: 'pointer',
          fontSize: 10,
          color: active ? 'var(--accent-ink)' : 'var(--ink-3)',
          letterSpacing: '0.18em',
          fontWeight: 700,
          textAlign: align as 'left' | 'right',
        }}
      >
        {label}
        <span style={{ marginLeft: 4, color: active ? 'var(--accent)' : 'currentColor', opacity: active ? 1 : 0.35 }}>
          {!active ? '⇕' : sort!.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    );
  };

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 70px', padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
        <Header label="TASK TYPE" k="type" />
        <Header label="MODEL" k="model" />
        <Header label="COST" k="cost" align="right" />
      </div>
      {sorted.map((r, i) => {
        const isActive = r.intentId === activeIntent;
        return (
          <div
            key={r.type}
            role="button"
            tabIndex={0}
            onClick={() => onSelectIntent(r.intentId)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectIntent(r.intentId); } }}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1.5fr 70px',
              padding: '10px 12px',
              alignItems: 'center',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              borderBottom: i < sorted.length - 1 ? '1px solid var(--line-2)' : 'none',
              transition: 'background .3s, border-color .3s',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{r.type}</div>
            <div className="mono" style={{ fontSize: 12, color: r.cost === 0 ? 'var(--compute-ink)' : 'var(--effect)', fontWeight: 700 }}>
              {r.model}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                className="mono tnum"
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: r.cost === 0 ? 'var(--compute)' : 'var(--effect)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {r.cost === 0 ? '$0.00' : '$$$'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

export default function RoutingDecisionWidget() {
  const [taskIdx, setTaskIdx] = useState(0);
  const task = TASK_PRESETS[taskIdx];
  const chosen = MODELS.find((m) => m.id === task.chosen) ?? MODELS[0];
  const intent = INTENTS.find((i) => i.id === task.intent) ?? INTENTS[0];

  // User-driven task selection (no auto-cycle)

  return (
    <ComponentWrapper
      title="Model Routing"
      isLoading={false}
      isEmpty={false}
    >
      <div style={{ width: '100%' }}>
        <CardHeader
          eyebrow="Model routing"
          title="What's the cheapest model that can do this task?"
          sub="Every routing decision is a contract. Receipts hash-bound to evidence."
        />

        {/* Task selector */}
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="task-selector"
            className="mono"
            style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6, display: 'block' }}
          >
            Select task
          </label>
          <select
            id="task-selector"
            value={taskIdx}
            onChange={(e) => setTaskIdx(Number(e.target.value))}
            className="mono"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--ink)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              cursor: 'pointer',
              appearance: 'auto',
            }}
          >
            {TASK_PRESETS.map((t, i) => (
              <option key={t.id} value={i}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Live trace */}
        <div
          style={{
            background: 'var(--bg-sunken)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 12 }}>decision trace</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            {/* INPUT */}
            <div>
              <NodePill kind="cmd">input</NodePill>
              <div className="mono" style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                {task.label}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4 }}>
                ticket-{4470 + taskIdx} {'·'} 1.2 KB
              </div>
            </div>

            <Arrow />

            {/* CLASSIFY */}
            <div>
              <NodePill kind="compute">classify</NodePill>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
                {intent.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <ConfidenceBar value={0.91} color={intent.color} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>0.91</span>
              </div>
            </div>

            <Arrow accent />

            {/* ROUTE */}
            <div>
              <NodePill kind="effect">route</NodePill>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--ink)' }}>
                {chosen.name}
              </div>
              <div style={{ marginTop: 4 }}>
                <Price value={chosen.cost} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 8 }}>
                  {'·'} {chosen.host}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Routing rules table */}
        <div className="eyebrow" style={{ marginBottom: 8 }}>routing rules {'·'} learned from cost/quality history</div>
        <RoutingRulesTable
          rules={ROUTING_RULES}
          activeIntent={task.intent}
          onSelectIntent={(intentId) => {
            const idx = TASK_PRESETS.findIndex((t) => t.intent === intentId);
            if (idx >= 0) setTaskIdx(idx);
          }}
        />

        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', textAlign: 'center' }}>
          Every routing decision produces a receipt with <span className="mono">model_chosen</span>, <span className="mono">tokens</span>, <span className="mono">cost</span>.
        </div>
      </div>
    </ComponentWrapper>
  );
}
