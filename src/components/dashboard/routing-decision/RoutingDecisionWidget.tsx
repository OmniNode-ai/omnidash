/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useState, useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { NodePill, CardHeader, Price } from '@/components/primitives';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in RoutingDecisionWidget.static.css.
import './RoutingDecisionWidget.static.css';

// ── Projection types ─────────────────────────────────────────────────

export interface RoutingModel {
  id: string;
  name: string;
  tier: 'local' | 'cloud';
  cost: number;
  host: string;
}

export interface RoutingIntent {
  id: string;
  label: string;
  color: string;
}

export interface RoutingTaskPreset {
  id: string;
  label: string;
  intent: string;
  chosen: string;
}

export interface RoutingRule {
  type: string;
  model: string;
  cost: number;
  intentId: string;
}

export interface RoutingDecisionProjection {
  models: RoutingModel[];
  intents: RoutingIntent[];
  task_presets: RoutingTaskPreset[];
  routing_rules: RoutingRule[];
  captured_at: string;
  provisioned: boolean;
}

// ── Fallback data (shown when projection is upstream-blocked) ────────

const FALLBACK_MODELS: RoutingModel[] = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B-A3B', tier: 'local', cost: 0.000, host: '.200' },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B-A3B', tier: 'local', cost: 0.000, host: '.200' },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', tier: 'local', cost: 0.000, host: '.201' },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', tier: 'local', cost: 0.000, host: '.201' },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', tier: 'cloud', cost: 0.118, host: 'cloud' },
];

const FALLBACK_INTENTS: RoutingIntent[] = [
  { id: 'code_generation', label: 'Code generation', color: 'var(--ds-kind-compute)' },
  { id: 'debugging', label: 'Debugging', color: 'var(--ds-kind-reducer)' },
  { id: 'classification', label: 'Classification', color: 'var(--ds-kind-orchestrator)' },
  { id: 'complex_reasoning', label: 'Complex reasoning', color: 'var(--ds-brand)' },
  { id: 'large_context', label: 'Large context', color: 'var(--ds-kind-effect)' },
];

const FALLBACK_TASK_PRESETS: RoutingTaskPreset[] = [
  { id: 'palindrome', label: 'Write a palindrome checker (Python)', intent: 'code_generation', chosen: 'qwen3-coder-30b' },
  { id: 'kafka-bug', label: 'Diagnose Kafka consumer-lag in payments-svc', intent: 'debugging', chosen: 'deepseek-r1-32b' },
  { id: 'monorepo', label: 'Refactor 18-file monorepo to ESM', intent: 'large_context', chosen: 'qwen3-next-80b' },
  { id: 'intent-rule', label: 'Classify ticket type from PR description', intent: 'classification', chosen: 'deepseek-r1-14b' },
  { id: 'sec-review', label: 'Review auth flow for OWASP Top-10', intent: 'complex_reasoning', chosen: 'claude-sonnet-4-5' },
];

const FALLBACK_ROUTING_RULES: RoutingRule[] = [
  { type: 'Classification', model: 'DeepSeek-R1-14B', cost: 0, intentId: 'classification' },
  { type: 'Code generation', model: 'Qwen3-Coder-30B', cost: 0, intentId: 'code_generation' },
  { type: 'Complex reasoning', model: 'DeepSeek-R1-32B', cost: 0, intentId: 'complex_reasoning' },
  { type: 'Large context', model: 'Qwen3-Next-80B', cost: 0, intentId: 'large_context' },
  { type: 'Fallback / hard', model: 'Claude-Sonnet-4-5', cost: 0.118, intentId: 'debugging' },
];

// ── Arrow connector ─────────────────────────────────────────────────

function Arrow({ accent }: { accent?: boolean }) {
  return (
    <svg className="routing-decision-widget-s350f32" width="32" height="20" viewBox="0 0 32 20">
      <line x1="0" y1="10" x2="26" y2="10" stroke={accent ? 'var(--ds-brand)' : 'var(--ds-ink-3)'} strokeWidth={accent ? 2 : 1.5} />
      <path d="M22,5 L30,10 L22,15" fill={accent ? 'var(--ds-brand)' : 'var(--ds-ink-3)'} />
    </svg>
  );
}

// ── Confidence bar ──────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="routing-decision-widget-sa9a36c">
      <div style={{ width: `${value * 100}%`, height: '100%', background: color, transition: 'width .5s' }} />
    </div>
  );
}

// ── Routing rules table ─────────────────────────────────────────────

function RoutingRulesTable({ rules, activeIntent, onSelectIntent }: {
  rules: RoutingRule[];
  activeIntent: string;
  onSelectIntent: (intentId: string) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rules;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (r: RoutingRule) =>
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
          "fontSize": 10,
          color: active ? 'var(--ds-link)' : 'var(--ds-ink-3)',
          "letterSpacing": '0.18em',
          "fontWeight": 700,
          textAlign: align as 'left' | 'right',
        }}
      >
        {label}
        <span style={{ marginLeft: 4, color: active ? 'var(--ds-brand)' : 'currentColor', opacity: active ? 1 : 0.35 }}>
          {!active ? '⇕' : sort!.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    );
  };

  return (
    <div className="routing-decision-widget-seffb15">
      <div className="routing-decision-widget-s6cac61">
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
              background: isActive ? 'var(--ds-brand-soft)' : 'transparent',
              borderLeft: isActive ? '3px solid var(--ds-brand)' : '3px solid transparent',
              borderBottom: i < sorted.length - 1 ? '1px solid var(--ds-line-soft)' : 'none',
              transition: 'background .3s, border-color .3s',
              cursor: 'pointer',
            }}
          >
            <div className="routing-decision-widget-se1d496">{r.type}</div>
            <div className="mono" style={{ "fontSize": 12, color: r.cost === 0 ? 'var(--ds-kind-compute-ink)' : 'var(--ds-kind-effect)', "fontWeight": 700 }}>
              {r.model}
            </div>
            <div className="routing-decision-widget-s13cbe0">
              <span
                className="mono tnum"
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: r.cost === 0 ? 'var(--ds-kind-compute)' : 'var(--ds-kind-effect)',
                  color: 'var(--ds-on-accent)',
                  "fontSize": 10,
                  "fontWeight": 700,
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
  const { data, isLoading, error } = useProjectionQuery<RoutingDecisionProjection>({
    queryKey: ['routing-decision-widget', TOPICS.routingDecision],
    topic: TOPICS.routingDecision,
    refetchInterval: refreshInterval(),
  });

  const projection = useMemo<RoutingDecisionProjection | null>(() => {
    return data?.[0] ?? null;
  }, [data]);

  const models = projection?.models ?? FALLBACK_MODELS;
  const intents = projection?.intents ?? FALLBACK_INTENTS;
  const taskPresets = projection?.task_presets ?? FALLBACK_TASK_PRESETS;
  const routingRules = projection?.routing_rules ?? FALLBACK_ROUTING_RULES;
  const isUpstreamBlocked = !projection || !projection.provisioned;

  const [taskIdx, setTaskIdx] = useState(0);
  const safeIdx = Math.min(taskIdx, taskPresets.length - 1);
  const task = taskPresets[safeIdx];
  const chosen = models.find((m) => m.id === task.chosen) ?? models[0];
  const intent = intents.find((i) => i.id === task.intent) ?? intents[0];

  const isEmpty = taskPresets.length === 0;

  return (
    <ComponentWrapper
      title="Model Routing"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No routing data"
      emptyHint="Routing decisions appear once delegation events are recorded"
    >
      <div className="routing-decision-widget-s69d66e">
        <CardHeader
          eyebrow="Model routing"
          title="What's the cheapest model that can do this task?"
          sub="Every routing decision is a contract. Receipts hash-bound to evidence."
        />

        {/* Task selector */}
        <div className="routing-decision-widget-s390758">
          <label
            htmlFor="task-selector"
            className="mono routing-decision-widget-sdf99a7"
          >
            Select task
          </label>
          <select
            id="task-selector"
            value={safeIdx}
            onChange={(e) => setTaskIdx(Number(e.target.value))}
            className="mono routing-decision-widget-s467a09"
          >
            {taskPresets.map((t, i) => (
              <option key={t.id} value={i}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Live trace */}
        <div className="routing-decision-widget-s3cc629"
        >
          <div className="eyebrow routing-decision-widget-s72d6c3">decision trace</div>
          <div className="routing-decision-widget-sea62e4">
            {/* INPUT */}
            <div>
              <NodePill kind="cmd">input</NodePill>
              <div className="mono routing-decision-widget-s661127">
                {task.label}
              </div>
              <div className="mono routing-decision-widget-sb62dad">
                ticket-{4470 + safeIdx} {'·'} 1.2 KB
              </div>
            </div>

            <Arrow />

            {/* CLASSIFY */}
            <div>
              <NodePill kind="compute">classify</NodePill>
              <div className="routing-decision-widget-sa023c2">
                {intent.label}
              </div>
              <div className="routing-decision-widget-s6a1fb2">
                <ConfidenceBar value={0.91} color={intent.color} />
                <span className="mono routing-decision-widget-s279e25">0.91</span>
              </div>
            </div>

            <Arrow accent />

            {/* ROUTE */}
            <div>
              <NodePill kind="effect">route</NodePill>
              <div className="mono routing-decision-widget-sa023c2">
                {chosen.name}
              </div>
              <div className="routing-decision-widget-sc71373">
                <Price value={chosen.cost} />
                <span className="mono routing-decision-widget-sd430d9">
                  {'·'} {chosen.host}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Routing rules table */}
        <div className="eyebrow routing-decision-widget-s7f3cba">routing rules {'·'} learned from cost/quality history</div>
        <RoutingRulesTable
          rules={routingRules}
          activeIntent={task.intent}
          onSelectIntent={(intentId) => {
            const idx = taskPresets.findIndex((t) => t.intent === intentId);
            if (idx >= 0) setTaskIdx(idx);
          }}
        />

        {isUpstreamBlocked && (
          <div className="routing-decision-widget-sf28a0b">
            Projection upstream-blocked — displaying contract-valid fixtures.
          </div>
        )}

        <div className="routing-decision-widget-sed6a48">
          Every routing decision produces a receipt with <span className="mono">model_chosen</span>, <span className="mono">tokens</span>, <span className="mono">cost</span>.
        </div>
      </div>
    </ComponentWrapper>
  );
}
