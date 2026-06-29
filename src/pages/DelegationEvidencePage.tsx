/**
 * OMN-12943 — Delegation Evidence (ported from prototype view-delegation.jsx).
 *
 * SOURCE: Claude Design prototype app/view-delegation.jsx (DelegationView).
 * Every panel reads a REAL delegation projection via src/services/event-dash-api.ts.
 * data.jsx fixtures were a SHAPE REFERENCE only and do not ship. A panel whose
 * projection returns no rows / is degraded renders an explicit honest state.
 */

import { type ReactNode } from 'react';
import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import {
  Badge,
  CodeBlock,
  DataTable,
  EvEmpty,
  FreshnessChip,
  KPI,
  KV,
  Panel,
  StateBadge,
  derivePageBadge,
  fmtLatency,
  fmtMoney,
  fmtMoney4,
  fmtPct,
  fmtTokens,
  shortId,
  type DataColumn,
  type ProjectionSnapshot,
} from '@/components/dashboard/event-dash/primitives';
import {
  useCorrelationTrace,
  useDelegationDecisions,
  useDelegationModelRouting,
  useDelegationQualityGate,
  useDelegationSavings,
  useDelegationSummary,
  useDelegationTokenUsage,
} from '@/components/dashboard/event-dash/useEventDashData';
import type {
  CorrelationTraceRow,
  DelegationDecisionRow,
} from '@/services/event-dash-api';

// ── golden chain (stage labels justified by the trace row) ───────────────────

interface ChainStep {
  step: number;
  label: string;
  detail: string;
  topic: string;
  evidence: 'observed' | 'inferred';
  kind: '' | 'ok' | 'fail';
}

function buildChain(row: CorrelationTraceRow): ChainStep[] {
  const ok = row.quality_gate_passed;
  return [
    { step: 1, label: 'Command envelope', detail: `correlation_id ${shortId(row.correlation_id)}`, topic: 'onex.cmd.delegation.delegate.v1', evidence: 'inferred', kind: '' },
    { step: 2, label: 'Routing trace', detail: `${row.model_name}${row.routing_rule ? ` (rule: ${row.routing_rule})` : ''}`, topic: 'onex.evt.delegation.routing_trace.v1', evidence: 'observed', kind: '' },
    { step: 3, label: 'Inference response', detail: row.response_text ? 'response_text present' : 'response_text = null', topic: 'onex.evt.delegation.inference-response.v1', evidence: row.response_text ? 'observed' : 'inferred', kind: '' },
    { step: 4, label: 'Decision terminal', detail: ok ? 'quality gate passed' : (row.quality_gate_detail ?? 'failed'), topic: 'onex.evt.delegation.decision_terminal.v1', evidence: 'observed', kind: ok ? 'ok' : 'fail' },
    { step: 5, label: 'Projection row', detail: `id ${shortId(row.id)} · ${fmtLatency(row.latency_ms)}`, topic: 'onex.snapshot.projection.delegation.decisions.v1', evidence: 'observed', kind: ok ? 'ok' : 'fail' },
  ];
}

function Chain({ steps }: { steps: ChainStep[] }) {
  return (
    <div className="chain">
      {steps.map((c) => (
        <div className="chain-item" key={c.step}>
          <div className={`chain-node ${c.kind}`}>{c.step}</div>
          <div className="chain-body">
            <div className="cl">
              {c.label} <Badge kind="muted">{c.evidence}</Badge>
            </div>
            <div className="cd">{c.detail}</div>
            <div className="ct">{c.topic}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── selected run (latest decision → correlation trace) ───────────────────────

function SelectedRun({ correlationId }: { correlationId: string | null }) {
  const { data, isLoading } = useCorrelationTrace(correlationId);
  if (!correlationId) {
    return (
      <Panel title="SELECTED RUN">
        <EvEmpty title="No delegation selected" note="Awaiting a delegation decision on the bus." />
      </Panel>
    );
  }
  if (isLoading || !data) {
    return (
      <Panel title="SELECTED RUN" sub={shortId(correlationId)}>
        <EvEmpty title="Loading correlation trace…" />
      </Panel>
    );
  }
  const row = data.rows[0];
  if (!row) {
    return (
      <Panel title="SELECTED RUN" sub={shortId(correlationId)}>
        <EvEmpty title="No trace rows for this correlation" reason={data.degradedReason} note="correlation-trace projection returned no rows for this id." />
      </Panel>
    );
  }
  return (
    <Panel
      title="SELECTED RUN"
      sub={shortId(row.correlation_id)}
      right={<StateBadge passed={row.quality_gate_passed} />}
    >
      <KV
        items={[
          { k: 'Correlation', v: row.correlation_id, accent: true },
          { k: 'Task type', v: row.task_type },
          { k: 'Model', v: row.model_name },
          { k: 'Latency', v: fmtLatency(row.latency_ms) },
          { k: 'Tokens in / out', v: row.tokens_input != null ? `${row.tokens_input} / ${row.tokens_output ?? '—'}` : '—' },
          { k: 'Cost · Savings', v: `${fmtMoney(row.cost_usd)} · ${fmtMoney(row.cost_savings_usd)}` },
          { k: 'Routing rule', v: row.routing_rule ?? '—' },
          { k: 'Quality detail', v: row.quality_gate_detail ?? (row.quality_gate_passed ? 'pass' : '—') },
        ]}
      />
      <div className="divider" />
      <div className="section-label">Golden chain · command → projection</div>
      <Chain steps={buildChain(row)} />
    </Panel>
  );
}

// ── model routing (aggregate — no correlation_id) ────────────────────────────

function ModelRouting() {
  const { data, isLoading } = useDelegationModelRouting();
  if (isLoading || !data) {
    return <Panel title="MODEL ROUTING"><EvEmpty title="Loading…" /></Panel>;
  }
  const agg = data.rows[0];
  if (!agg || agg.rows.length === 0) {
    return (
      <Panel title="MODEL ROUTING">
        <EvEmpty title="No routing aggregate" reason={data.degradedReason} note="delegation.model-routing projection returned no rows." />
      </Panel>
    );
  }
  // Aggregate by model_name across task types.
  const byModel = new Map<string, number>();
  for (const r of agg.rows) byModel.set(r.model_name, (byModel.get(r.model_name) ?? 0) + r.count);
  const entries = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entries.map(([, n]) => n));
  const colors = ['blue', 'green', 'amber', 'purple', 'teal', 'pink', 'red', 'blue'];
  return (
    <Panel title="MODEL ROUTING" sub={`${agg.total_delegations} delegations by selected model (aggregate)`}>
      {entries.map(([model, count], i) => (
        <div className="barrow" key={model}>
          <div className="lab" title={model}>{model}</div>
          <div className="val">{count} · {fmtPct(count / agg.total_delegations)}</div>
          <div className="track2 bar-track">
            <div className={`bar-fill m-${colors[i % colors.length]}`} style={{ width: `${Math.max(3, (count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ── quality gate ─────────────────────────────────────────────────────────────

function QualityGate() {
  const { data, isLoading } = useDelegationQualityGate();
  if (isLoading || !data) {
    return <Panel title="QUALITY GATE"><EvEmpty title="Loading…" /></Panel>;
  }
  const q = data.rows[0];
  if (!q) {
    return (
      <Panel title="QUALITY GATE">
        <EvEmpty title="No quality-gate rows" reason={data.degradedReason} />
      </Panel>
    );
  }
  const total = q.total_passed + q.total_failed;
  return (
    <Panel title="QUALITY GATE" sub="deterministic checks">
      <div className="ev-qg-stats">
        <span className="stat-inline"><span className="big c-amber">{fmtPct(q.overall_pass_rate)}</span><span className="note">pass rate</span></span>
        <span className="stat-inline"><span className="big c-green">{q.total_passed}</span><span className="note">pass</span></span>
        <span className="stat-inline"><span className="big c-red">{q.total_failed}</span><span className="note">fail</span></span>
        <span className="stat-inline"><span className="big">{fmtPct(q.escalation_rate)}</span><span className="note">escalation</span></span>
      </div>
      <div className="bar-track ev-qg-bar">
        <div className="bar-fill m-green" style={{ width: total > 0 ? `${(q.total_passed / total) * 100}%` : '0%' }} />
        <div className="bar-fill m-red" style={{ width: total > 0 ? `${(q.total_failed / total) * 100}%` : '0%' }} />
      </div>
      <div className="divider" />
      <div className="section-label">Escalation reasons</div>
      {q.failure_categories.slice(0, 6).map((f, i) => (
        <div className="ev-qg-cat" key={i}>
          <span className="mono c-amber">{f.count}</span>
          <span className="mono dim">{f.category}</span>
        </div>
      ))}
    </Panel>
  );
}

// ── savings (aggregate) ──────────────────────────────────────────────────────

function SavingsPanel() {
  const { data, isLoading } = useDelegationSavings();
  if (isLoading || !data) {
    return <Panel title="SAVINGS vs CLOUD BASELINE"><EvEmpty title="Loading…" /></Panel>;
  }
  const s = data.rows[0];
  if (!s) {
    return (
      <Panel title="SAVINGS vs CLOUD BASELINE">
        <EvEmpty title="No savings rows" reason={data.degradedReason} />
      </Panel>
    );
  }
  const max = s.cumulative_cloud_cost_usd || 1;
  return (
    <Panel
      title="SAVINGS vs CLOUD BASELINE"
      sub={s.baseline_model}
      right={<span className="src-tag">pricing v{s.pricing_manifest_version}</span>}
    >
      <span className="stat-inline ev-savings-hero">
        <span className="big c-amber">{fmtMoney(s.cumulative_savings_usd)}</span>
        <span className="note">cumulative savings over {s.session_count} sessions</span>
      </span>
      <div className="barrow"><div className="lab">Cloud baseline cost</div><div className="val">{fmtMoney4(s.cumulative_cloud_cost_usd)}</div>
        <div className="track2 bar-track"><div className="bar-fill m-blue" style={{ width: '100%' }} /></div></div>
      <div className="barrow"><div className="lab">Local / delegated cost</div><div className="val">{fmtMoney4(s.cumulative_local_cost_usd)}</div>
        <div className="track2 bar-track"><div className="bar-fill m-green" style={{ width: `${(s.cumulative_local_cost_usd / max) * 100}%` }} /></div></div>
      <div className="barrow"><div className="lab c-green">Saved</div><div className="val c-green">{fmtMoney4(s.cumulative_savings_usd)}</div>
        <div className="track2 bar-track"><div className="bar-fill m-green" style={{ width: `${(s.cumulative_savings_usd / max) * 100}%` }} /></div></div>
    </Panel>
  );
}

// ── token usage (by model) ───────────────────────────────────────────────────

function TokenUsage() {
  const { data, isLoading } = useDelegationTokenUsage();
  if (isLoading || !data) {
    return <Panel title="TOKEN USAGE"><EvEmpty title="Loading…" /></Panel>;
  }
  const t = data.rows[0];
  if (!t) {
    return (
      <Panel title="TOKEN USAGE">
        <EvEmpty title="No token-usage rows" reason={data.degradedReason} />
      </Panel>
    );
  }
  const models = t.by_model.filter((m) => m.total_tokens > 0 || m.token_provenance === 'measured');
  const max = Math.max(1, ...models.map((m) => m.total_tokens));
  return (
    <Panel title="TOKEN USAGE" sub={`${fmtTokens(t.total_tokens)} total · ${fmtMoney4(t.total_estimated_cost_usd)}`}>
      <div className="ev-token-summary">
        <div><div className="note">Prompt</div><div className="mono ev-token-num">{fmtTokens(t.total_prompt_tokens)}</div></div>
        <div><div className="note">Completion</div><div className="mono ev-token-num">{fmtTokens(t.total_completion_tokens)}</div></div>
        <div><div className="note">Est. cost</div><div className="mono ev-token-num c-amber">{fmtMoney4(t.total_estimated_cost_usd)}</div></div>
      </div>
      {models.map((m, i) => (
        <div className="barrow" key={m.model_id}>
          <div className="lab" title={m.model_name}>{m.model_name.length > 26 ? `${m.model_name.slice(0, 24)}…` : m.model_name}</div>
          <div className="val">{fmtTokens(m.total_tokens)} {m.token_provenance === 'measured' ? <span className="c-green">●</span> : <span className="dim3">○</span>}</div>
          <div className="track2 bar-track"><div className={`bar-fill m-${['blue', 'green', 'amber', 'purple', 'teal'][i % 5]}`} style={{ width: `${Math.max(2, (m.total_tokens / max) * 100)}%` }} /></div>
        </div>
      ))}
    </Panel>
  );
}

// ── recent delegations table (decisions → expand → correlation trace) ────────

function DecisionDetail({ row }: { row: DelegationDecisionRow }) {
  const { data, isLoading } = useCorrelationTrace(row.correlation_id);
  const trace = data?.rows[0];
  return (
    <>
      <KV
        items={[
          { k: 'Correlation', v: row.correlation_id, accent: true },
          { k: 'Task type', v: row.task_type },
          { k: 'Model', v: row.model_name },
          { k: 'Quality detail', v: row.quality_gate_detail ?? '—' },
          { k: 'Tokens in / out', v: row.tokens_input != null ? `${row.tokens_input} / ${row.tokens_output ?? '—'}` : '—' },
          { k: 'Latency', v: fmtLatency(row.latency_ms) },
          { k: 'Created', v: row.created_at.replace('T', ' ').slice(0, 19) },
        ]}
      />
      {isLoading ? (
        <div className="note">loading correlation trace…</div>
      ) : trace && (trace.prompt_text || trace.response_text) ? (
        <div className="grid cols-2">
          {trace.prompt_text ? <CodeBlock title="prompt_text" lang="text" code={trace.prompt_text} /> : <div className="note">prompt_text = null (not persisted)</div>}
          {trace.response_text ? <CodeBlock title="response_text" lang="text" code={trace.response_text} /> : <div className="note">response_text = null (not persisted)</div>}
        </div>
      ) : (
        <div className="note">prompt / response not persisted for this correlation</div>
      )}
      {trace ? (
        <div>
          <div className="section-label">Event chain</div>
          <Chain steps={buildChain(trace)} />
        </div>
      ) : null}
    </>
  );
}

function RecentDelegations({ decisions }: { decisions: DelegationDecisionRow[] }) {
  const cols: DataColumn<DelegationDecisionRow>[] = [
    { key: 'correlation_id', label: 'Correlation', render: (r) => <span className="mono c-blue">{shortId(r.correlation_id)}</span> },
    { key: 'task_type', label: 'Task', grow: true, render: (r) => r.task_type },
    { key: 'model_name', label: 'Model', truncate: true, render: (r) => <span className="mono">{r.model_name.length > 22 ? `${r.model_name.slice(0, 20)}…` : r.model_name}</span> },
    { key: 'state', label: 'State', render: (r) => <StateBadge passed={r.quality_gate_passed} /> },
    { key: 'tokens', label: 'Tokens', num: true, render: (r) => fmtTokens(r.tokens_to_compliance) },
    { key: 'latency_ms', label: 'Latency', num: true, render: (r) => fmtLatency(r.latency_ms) },
    { key: 'created_at', label: 'Created', num: true, render: (r) => <span className="mono dim">{r.created_at.replace('T', ' ').slice(0, 19)}</span> },
  ];
  return (
    <Panel
      title="RECENT DELEGATIONS"
      sub="every row expands to prompt, response & golden chain"
      pad={false}
      right={<span className="note">showing {decisions.length}</span>}
    >
      <DataTable
        columns={cols}
        rows={decisions}
        rowKey={(r) => r.correlation_id}
        renderDetail={(r) => <DecisionDetail row={r} />}
      />
    </Panel>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export function DelegationEvidencePage() {
  const summaryQ = useDelegationSummary();
  const tokensQ = useDelegationTokenUsage();
  const decisionsQ = useDelegationDecisions();

  const summary = summaryQ.data?.rows[0];
  const tokens = tokensQ.data?.rows[0];
  const decisions = decisionsQ.data?.rows ?? [];
  const latestCid = decisions[0]?.correlation_id ?? null;

  const kpiTokens: ReactNode = tokens ? fmtTokens(tokens.total_tokens) : '—';

  // OMN-12943: derive badge from all three authoritative projections for this page
  // so the header reflects the composite data state, not a single query's freshness.
  const snapshots: ProjectionSnapshot[] = [summaryQ.data, tokensQ.data, decisionsQ.data]
    .filter((d): d is NonNullable<typeof d> => d !== undefined)
    .map((d) => ({ rowCount: d.rowCount, freshness: d.freshness }));
  const badgeState = derivePageBadge(snapshots);
  const latestEventAt = decisionsQ.data?.latestEventAt ?? null;

  const headRight = snapshots.length > 0 ? (
    <FreshnessChip state={badgeState} latestEventAt={latestEventAt} />
  ) : null;

  return (
    <EvPageShell
      crumb="OmniDash · Delegation Evidence"
      title="Delegation Evidence"
      sub="Routing, quality gate, savings & per-correlation trace — live projections"
      headRight={headRight}
    >
      <div className="grid cols-4">
        <KPI label="Delegations" value={summary ? summary.totalDelegations : '—'} sub={summary ? `${summary.qualityGatePassed} pass · ${summary.qualityGateTotal - summary.qualityGatePassed} fail` : undefined} />
        <KPI label="Quality pass" value={summary ? fmtPct(summary.qualityGatePassRate) : '—'} sub="deterministic gate" />
        <KPI label="Savings" value={summary ? fmtMoney(summary.totalSavingsUsd) : '—'} accent sub="vs cloud baseline" />
        <KPI label="Tokens" value={kpiTokens} sub={summary ? `avg ${(summary.avgLatencyMs / 1000).toFixed(2)}s latency` : undefined} />
      </div>

      <div className="grid cols-2 ev-align-start">
        <SelectedRun correlationId={latestCid} />
        <div className="grid">
          <ModelRouting />
          <SavingsPanel />
        </div>
      </div>

      <div className="grid cols-2 ev-align-start">
        <QualityGate />
        <TokenUsage />
      </div>

      {decisionsQ.isLoading ? (
        <Panel title="RECENT DELEGATIONS"><EvEmpty title="Loading…" /></Panel>
      ) : decisions.length === 0 ? (
        <Panel title="RECENT DELEGATIONS">
          <EvEmpty title="No delegation decisions" reason={decisionsQ.data?.degradedReason} note="delegation.decisions projection returned no rows." />
        </Panel>
      ) : (
        <RecentDelegations decisions={decisions} />
      )}
    </EvPageShell>
  );
}
