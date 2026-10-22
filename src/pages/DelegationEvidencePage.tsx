/**
 * OMN-12943 — Delegation Evidence (ported from prototype view-delegation.jsx).
 *
 * SOURCE: Claude Design prototype app/view-delegation.jsx (DelegationView).
 * Every panel reads a REAL delegation projection via src/services/event-dash-api.ts.
 * data.jsx fixtures were a SHAPE REFERENCE only and do not ship. A panel whose
 * projection returns no rows / is degraded renders an explicit honest state.
 */

import { type ReactNode } from 'react';
import { Activity, Award, Coins, PiggyBank } from 'lucide-react';
import { formatUsd } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { isUnavailableField } from '@/components/dashboard/field-identity';
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
  fmtMoney4,
  fmtPct,
  fmtTokens,
  shortId,
  type DataColumn,
  type ProjectionSnapshot,
} from '@/components/dashboard/event-dash/primitives';
import {
  useCostSavingsOverview,
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
  CostSavingsOverviewRow,
  DelegationDecisionRow,
  DelegationSummaryRow,
} from '@/services/event-dash-api';
import { runBreakdownText, runModelledCell } from '@/pages/LocalDashboardPage';

const recordedMoney = (value: unknown) => isUnavailableField(value) || !Number.isFinite(Number(value))
  ? 'Not recorded' : formatUsd(value);

/**
 * OMN-21166 AC37: the one cost.savings-overview.v1 row both pages read: the newest all-time row. Two all-time rows
 * captured at the same moment cannot be told apart, so neither is picked (the same rule as Overview's cards).
 */
function overviewRowOf(rows: readonly CostSavingsOverviewRow[]): CostSavingsOverviewRow | 'ambiguous' | null {
  const time = (row: CostSavingsOverviewRow) => { const t = Date.parse(row.captured_at); return Number.isFinite(t) ? t : -Infinity; };
  const all = rows.filter(row => row.window === 'all').sort((a, b) => time(b) - time(a));
  if (all.length === 0) return null;
  if (all.length > 1 && time(all[0]!) === time(all[1]!)) return 'ambiguous';
  return all[0]!;
}

/** A served whole number grouped for reading, or why there is none; never 0 for a missing field. */
function servedCount(value: unknown): string {
  return isUnavailableField(value) || !Number.isFinite(Number(value)) ? 'Not measured' : Number(value).toLocaleString('en-US');
}

/** A served dollar total to the cent, grouped as Overview shows it, or why there is none. */
function servedUsd(value: unknown): string {
  if (isUnavailableField(value) || !Number.isFinite(Number(value))) return 'Not measured';
  const amount = Number(value);
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `-$${text}` : `$${text}`;
}

/**
 * OMN-21166: the savings panel's pricing tag. A served version that is a number reads "pricing v3"; anything else is
 * named as served ("pricing savings-estimated"), never with a "v" glued to a word. No version served, no tag.
 */
export function pricingLabel(version: unknown): string | null {
  if (isUnavailableField(version)) return null;
  const text = String(version).trim();
  if (text === '') return null;
  return /^\d/.test(text) ? `pricing v${text}` : `pricing ${text}`;
}

const REASON_MAX = 120;

/**
 * OMN-21166: one escalation reason as the panel shows it. A served reason can be a whole provider error, URLs and
 * response body included; the row shows its first line of text, shortened to fit, and the element's title keeps the
 * whole served text. A missing reason is named, never an empty row.
 */
export function escalationReason(reason: unknown): { text: string; title: string | undefined } {
  const served = typeof reason === 'string' ? reason : isUnavailableField(reason) ? '' : String(reason);
  const text = served.replace(/\s+/g, ' ').trim();
  if (text === '') return { text: 'Not recorded', title: undefined };
  if (text.length <= REASON_MAX) return { text, title: undefined };
  return { text: `${text.slice(0, REASON_MAX - 1).trimEnd()}…`, title: served };
}

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

function SelectedRun({ correlationId, decision }: { correlationId: string | null; decision?: DelegationDecisionRow }) {
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
        <EvEmpty title="No trace rows for this correlation" reason={data.degradedReason} note="Nothing was recorded for this run yet." />
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
          { k: 'Tokens in', v: row.tokens_input ?? 'Not recorded' },
          { k: 'Tokens out', v: row.tokens_output ?? 'Not recorded' },
          { k: 'Cost', v: recordedMoney(row.cost_usd) },
          // OMN-21166 AC37: the run's one modelled saving, the figure Runs shows (delegation.decisions.v1), not the
          // event's legacy cost_savings_usd, which is 0 for a run the savings writer never priced.
          { k: 'Savings (modelled)', v: decision ? runModelledCell(decision as unknown as Record<string, unknown>) : 'Not recorded' },
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
        <EvEmpty title="No routing aggregate" reason={data.degradedReason} note="No routing data yet." />
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
        <span className="stat-inline" data-field-tone="pass"><span className="big c-green">{q.total_passed}</span><span className="note">pass</span></span>
        <span className="stat-inline" data-field-tone="fail"><span className="big c-red">{q.total_failed}</span><span className="note">fail</span></span>
        <span className="stat-inline"><span className="big">{fmtPct(q.escalation_rate)}</span><span className="note">escalation</span></span>
      </div>
      <div className="bar-track ev-qg-bar">
        <div className="bar-fill m-green" style={{ width: total > 0 ? `${(q.total_passed / total) * 100}%` : '0%' }} />
        <div className="bar-fill m-red" style={{ width: total > 0 ? `${(q.total_failed / total) * 100}%` : '0%' }} />
      </div>
      <div className="divider" />
      <div className="section-label">Escalation reasons</div>
      {q.failure_categories.slice(0, 6).map((f, i) => {
        const reason = escalationReason(f.category);
        return (
          <div className="ev-qg-cat" key={i}>
            <span className="mono c-amber">{f.count}</span>
            <span className="mono dim" title={reason.title}>{reason.text}</span>
          </div>
        );
      })}
    </Panel>
  );
}

// ── savings (aggregate) ──────────────────────────────────────────────────────

function SavingsPanel({ overview, unavailable }: { overview: CostSavingsOverviewRow | null; unavailable: string }) {
  const { data, isLoading } = useDelegationSavings();
  if (isLoading || !data) {
    return <Panel title="SAVINGS vs CLOUD BASELINE"><EvEmpty title="Loading…" /></Panel>;
  }
  // OMN-21166 AC37: the money figures are the shared overview row's, the same total Overview's Savings card shows;
  // delegation.savings.v1 supplies only the baseline model and pricing version it alone serves.
  const s = data.rows[0];
  const finite = (value: unknown) => !isUnavailableField(value) && Number.isFinite(Number(value));
  const cloud = overview?.total_baseline_cost_usd;
  const local = overview?.total_cost_usd;
  const saved = overview?.total_savings_usd;
  const width = (value: unknown) => finite(value) && finite(cloud) && Number(cloud) > 0
    ? `${Math.max(0, Math.min(100, (Number(value) / Number(cloud)) * 100))}%` : null;
  const bar = (label: string, value: unknown, tone: string, labelClass = '') => (
    <div className="barrow"><div className={`lab ${labelClass}`.trim()}>{label}</div><div className={`val ${labelClass}`.trim()}>{finite(value) ? fmtMoney4(Number(value)) : 'Not measured'}</div>
      <div className="track2 bar-track">{width(value) && <div className={`bar-fill ${tone}`} style={{ width: width(value)! }} />}</div></div>
  );
  return (
    <Panel
      title="SAVINGS vs CLOUD BASELINE"
      sub={s?.baseline_model || 'Baseline model not recorded'}
      right={s && pricingLabel(s.pricing_manifest_version) ? <span className="src-tag">{pricingLabel(s.pricing_manifest_version)}</span> : undefined}
    >
      <span className="stat-inline ev-savings-hero">
        <span className="big c-amber">{overview ? servedUsd(saved) : unavailable}</span>
        <span className="note">cumulative savings (modelled) over {overview ? servedCount(overview.measured_run_count) : 'Not measured'} measured runs</span>
      </span>
      {bar('Cloud baseline cost', cloud, 'm-blue')}
      {bar('Local / delegated cost', local, 'm-green')}
      {bar('Saved', saved, 'm-green', 'c-green')}
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
        <div data-field-tone="tokens-in"><div className="note">Prompt</div><div className="mono ev-token-num">{fmtTokens(t.total_prompt_tokens)}</div></div>
        <div data-field-tone="tokens-out"><div className="note">Completion</div><div className="mono ev-token-num">{fmtTokens(t.total_completion_tokens)}</div></div>
        <div data-field-tone="cost"><div className="note">Est. cost</div><div className="mono ev-token-num c-amber">{fmtMoney4(t.total_estimated_cost_usd)}</div></div>
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
        pageSize={25}
        rowKey={(r) => r.correlation_id}
        renderDetail={(r) => <DecisionDetail row={r} />}
      />
    </Panel>
  );
}

/**
 * OMN-21304 AC4: delegation.summary.v1 counts fixture delegations into its totals and says how many. When it serves
 * more than zero, every figure read from that row says so beside it; a figure is never shown as if all of it were live.
 */
function fixtureNoticeOf(summary: DelegationSummaryRow): string | null {
  const n = Number(summary.fixtureDelegations);
  if (summary.fixtureDelegations === null || summary.fixtureDelegations === undefined || !Number.isFinite(n) || n <= 0) return null;
  return `Includes ${n.toLocaleString('en-US')} fixture delegation${n === 1 ? '' : 's'}`;
}

function withFixtureNotice(text: string, notice: string | null): string {
  return notice ? `${text} · ${notice}` : text;
}

// ── page ─────────────────────────────────────────────────────────────────────

export function DelegationEvidencePage() {
  const summaryQ = useDelegationSummary();
  const tokensQ = useDelegationTokenUsage();
  const savingsQ = useDelegationSavings();
  const decisionsQ = useDelegationDecisions();
  const overviewQ = useCostSavingsOverview();

  const summary = summaryQ.data?.rows[0];
  const fixtureNotice = summary ? fixtureNoticeOf(summary) : null;
  const decisions = decisionsQ.data?.rows ?? [];
  const latestCid = decisions[0]?.correlation_id ?? null;

  // OMN-21166 AC37: savings, tokens and runs come from the same served row as Overview's headline cards, so the two
  // pages show one figure per concept. The measured population is a labelled breakdown, never a second headline.
  const picked = overviewQ.data ? overviewRowOf(overviewQ.data.rows) : null;
  const overview = picked === 'ambiguous' ? null : picked;
  const unavailable = picked === 'ambiguous' ? 'Not measured: ambiguous overview totals' : overviewQ.isLoading ? '—' : 'Not measured';
  const kpiRuns: ReactNode = overview ? servedCount(overview.run_count) : unavailable;
  const kpiSavings: ReactNode = overview ? servedUsd(overview.total_savings_usd) : unavailable;
  const kpiTokens: ReactNode = overview ? servedCount(overview.tokens_total) : unavailable;
  const runBreakdown = overview ? runBreakdownText(overview as unknown as Record<string, unknown>) : null;

  // Include the savings source in freshness alongside the other headline projections.
  // so the header reflects the composite data state, not a single query's freshness.
  const snapshots: ProjectionSnapshot[] = [summaryQ.data, tokensQ.data, decisionsQ.data, savingsQ.data, overviewQ.data]
    .filter((d): d is NonNullable<typeof d> => d !== undefined)
    .map((d) => ({ rowCount: d.rowCount, freshness: d.freshness }));
  const badgeState = derivePageBadge(snapshots);
  const latestEventAt =
    decisionsQ.data?.latestEventAt ??
    summaryQ.data?.latestEventAt ??
    tokensQ.data?.latestEventAt ??
    null;

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
        <KPI label="Delegations" icon={<Activity size={15} aria-hidden="true" />} tone="blue" value={kpiRuns} sub={runBreakdown ?? undefined} />
        <KPI label="Quality pass" icon={<Award size={15} aria-hidden="true" />} tone="green" value={summary ? fmtPct(summary.qualityGatePassRate) : '—'} sub={withFixtureNotice('deterministic gate', fixtureNotice)} />
        <KPI label="Savings (modelled)" icon={<PiggyBank size={15} aria-hidden="true" />} tone="purple" value={kpiSavings} accent sub="vs cloud baseline" />
        <KPI label="Tokens" icon={<Coins size={15} aria-hidden="true" />} tone="amber" value={kpiTokens} sub={summary ? withFixtureNotice(`avg ${(summary.avgLatencyMs / 1000).toFixed(2)}s latency`, fixtureNotice) : undefined} />
      </div>

      <div className="grid cols-2 ev-selected-run-layout">
        <SelectedRun correlationId={latestCid} decision={decisions[0]} />
        <ModelRouting />
        <SavingsPanel overview={overview} unavailable={unavailable} />
      </div>

      <div className="grid cols-2 ev-align-start">
        <QualityGate />
        <TokenUsage />
      </div>

      {decisionsQ.isLoading ? (
        <Panel title="RECENT DELEGATIONS"><EvEmpty title="Loading…" /></Panel>
      ) : decisions.length === 0 ? (
        <Panel title="RECENT DELEGATIONS">
          <EvEmpty title="No delegation decisions" reason={decisionsQ.data?.degradedReason} note="No delegation decisions recorded yet." />
        </Panel>
      ) : (
        <RecentDelegations decisions={decisions} />
      )}
    </EvPageShell>
  );
}
