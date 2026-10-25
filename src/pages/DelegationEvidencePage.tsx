import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
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
  useExposureCensus,
  useMeteringSummary,
} from '@/components/dashboard/event-dash/useEventDashData';
import type {
  QualityGateRow,
  CorrelationTraceRow,
  CostSavingsOverviewRow,
  DelegationDecisionRow,
  DelegationSummaryRow,
} from '@/services/event-dash-api';
import {
  captionText, meteringMoneyBasis, meteringTokens, overviewHeadlineSource, pickMeteringRow, runBreakdownText, runModelledCell,
} from '@/pages/LocalDashboardPage';
import { overviewRunCount } from '@/lib/dashboard-overview-count';
import { modelColor } from '@/lib/dashboard-colors';
import { formatDuration } from '@/lib/duration';
import { percent as sharePercent } from '@/pages/local/shares';
import { taskLabel } from '@/pages/local/plain-text';
import { readableTime } from '@/lib/readable-time';
import { modelIdentityStyle } from '@/components/dashboard/model-identity';

/**
 * OMN-21166 AC72 pass 1: a rate on Evidence reads to one decimal, as Overview writes the same served rate (91.6%, not
 * 92%), and a rate above zero never reads 0%.
 */
const passRate = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '—' : sharePercent(value);

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
  return isUnavailableField(value) || !Number.isFinite(Number(value)) ? 'Not measured' : formatDashboardCount(value);
}

/** A served dollar total to the cent, grouped as Overview shows it, or why there is none. */
function servedUsd(value: unknown): string {
  if (isUnavailableField(value) || !Number.isFinite(Number(value))) return 'Not measured';
  return formatUsd(value);
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

// OMN-21166 AC52: the gate's typed codes as a reader names them. A code not listed reads as its words in sentence case.
const REASON_CODE_LABELS: Readonly<Record<string, string>> = {
  SHAPE_REFUSED: 'Response too short', MALFORMED: 'Malformed output', TASK_MISMATCH: 'Task mismatch',
  WEAK_OUTPUT: 'Weak output', UNGROUNDED: 'Ungrounded figures', REFUSAL: 'Response refused',
  SCHEMA_VIOLATION: 'Schema violation',
};
const REASON_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\bfinish_reason=length\b/g, 'output limit reached'],
  [/\bcredential_rejected\b/g, 'key rejected'],
];

/** A stored credential's id never reaches the page, in the row or in its title (OMN-21166 AC52). */
function maskCredentialIds(text: string): string {
  return text.replace(/\bcred_[A-Za-z0-9_]+/g, 'a stored key');
}

function sentenceCase(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The reason in plain words: typed codes and snake_case names become words; the served wording is kept otherwise. */
function plainReasonText(text: string): string {
  let plain = maskCredentialIds(text)
    .replace(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3,}):\s*/g, (_, code: string) => `${REASON_CODE_LABELS[code] ?? sentenceCase(code)}: `);
  for (const [pattern, phrase] of REASON_PHRASES) plain = plain.replace(pattern, phrase);
  return plain.replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g, name => name.replace(/_/g, ' '));
}

/**
 * OMN-21166: one escalation reason as the panel shows it. A served reason can be a whole provider error, URLs and
 * response body included; the row shows its first line of text in plain words (AC52), shortened to fit, and the
 * element's title keeps the whole served text with any credential id masked. A missing reason is named, never an
 * empty row.
 */
export function escalationReason(reason: unknown): { text: string; title: string | undefined } {
  const served = typeof reason === 'string' ? reason : isUnavailableField(reason) ? '' : String(reason);
  const text = plainReasonText(served.replace(/\s+/g, ' ').trim());
  if (text === '') return { text: 'Not recorded', title: undefined };
  if (text.length <= REASON_MAX) return { text, title: undefined };
  return { text: `${text.slice(0, REASON_MAX - 1).trimEnd()}…`, title: maskCredentialIds(served) };
}

/**
 * OMN-21166 AC53: why a panel has no rows, in plain words with no HTTP status. A runtime that does not serve the data
 * (404 or 503) says so; another server failure says the runtime could not answer; any other reason is left to EvEmpty.
 */
export function plainUnservedReason(reason: string | null | undefined): string | null | undefined {
  const status = reason ? /^HTTP (\d{3})(?: .*)?$/.exec(reason.trim()) : null;
  if (!status) return reason;
  const code = Number(status[1]);
  if (code === 404 || code === 503) return 'This runtime does not provide this data yet';
  return code >= 500 ? 'The runtime could not answer' : reason;
}

// ── golden chain (stage labels justified by the trace row) ───────────────────

interface ChainStep {
  step: number;
  label: string;
  detail: string;
  evidence: 'observed' | 'inferred';
  kind: '' | 'ok' | 'fail';
}

// OMN-21166 AC51: each step names what happened in plain words; the event and exposure names stay in code.
function buildChain(row: CorrelationTraceRow): ChainStep[] {
  const ok = row.quality_gate_passed;
  return [
    { step: 1, label: 'Request received', detail: `Run ${shortId(row.correlation_id)}`, evidence: 'inferred', kind: '' },
    { step: 2, label: 'Model routed', detail: `${row.model_name}${row.routing_rule ? ` (rule: ${row.routing_rule})` : ''}`, evidence: 'observed', kind: '' },
    { step: 3, label: 'Answer returned', detail: row.response_text ? 'Answer recorded' : 'No answer recorded', evidence: row.response_text ? 'observed' : 'inferred', kind: '' },
    { step: 4, label: 'Quality gate', detail: ok ? 'Passed' : escalationReason(row.quality_gate_detail ?? 'Failed').text, evidence: 'observed', kind: ok ? 'ok' : 'fail' },
    { step: 5, label: 'Run recorded', detail: fmtLatency(row.latency_ms), evidence: 'observed', kind: ok ? 'ok' : 'fail' },
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
        <EvEmpty title="No trace rows for this correlation" reason={plainUnservedReason(data.degradedReason)} note="Nothing was recorded for this run yet." />
      </Panel>
    );
  }
  return (
    <Panel
      title="SELECTED RUN"
      right={<StateBadge passed={row.quality_gate_passed} />}
    >
      <KV
        items={[
          { k: 'Correlation', v: row.correlation_id, accent: true },
          { k: 'Task type', v: taskLabel(row.task_type) },
          { k: 'Model', v: row.model_name },
          { k: 'Latency', v: fmtLatency(row.latency_ms) },
          { k: 'Tokens in', v: row.tokens_input == null ? 'Not recorded' : formatFullCount(row.tokens_input) },
          { k: 'Tokens out', v: row.tokens_output == null ? 'Not recorded' : formatFullCount(row.tokens_output) },
          { k: 'Cost', v: recordedMoney(row.cost_usd) },
          // OMN-21166 AC37: the run's one modelled saving, the figure Runs shows (delegation.decisions.v1), not the
          // event's legacy cost_savings_usd, which is 0 for a run the savings writer never priced.
          { k: 'Savings (modelled)', v: decision ? runModelledCell(decision as unknown as Record<string, unknown>) : 'Not recorded' },
          { k: 'Routing rule', v: row.routing_rule ?? '—' },
          { k: 'Quality detail', v: row.quality_gate_detail ? escalationReason(row.quality_gate_detail).text : (row.quality_gate_passed ? 'Passed' : '—') },
        ]}
      />
      <div className="divider" />
      <div className="section-label">Run path</div>
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
        <EvEmpty title="No routing aggregate" reason={plainUnservedReason(data.degradedReason)} note="No routing data yet." />
      </Panel>
    );
  }
  // Aggregate by model_name across task types.
  const byModel = new Map<string, number>();
  for (const r of agg.rows) byModel.set(r.model_name, (byModel.get(r.model_name) ?? 0) + r.count);
  const entries = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entries.map(([, n]) => n));
  return (
    <Panel title="MODEL ROUTING" sub={`${formatDashboardCount(agg.total_delegations)} delegations by selected model (aggregate)`}>
      {entries.map(([model, count]) => (
        <div className="barrow" key={model}>
          <div className="lab local-model-identity" title={model} style={modelIdentityStyle(model)}>{model}</div>
          <div className="val">{formatDashboardCount(count)} · {sharePercent(count / agg.total_delegations)}</div>
          <div className="track2 bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(3, (count / max) * 100)}%`, background: modelColor(model) }} />
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
        <EvEmpty title="No quality-gate rows" reason={plainUnservedReason(data.degradedReason)} />
      </Panel>
    );
  }
  const total = q.total_passed + q.total_failed;
  return (
    <Panel title="QUALITY GATE" sub="deterministic checks">
      <div className="ev-qg-stats">
        <span className="stat-inline"><span className="big c-amber" style={{ color: 'var(--field-pass)' }}>{passRate(q.overall_pass_rate)}</span><span className="note">pass rate</span></span>
        <span className="stat-inline" data-field-tone="pass"><span className="big c-green" style={{ color: 'var(--field-pass)' }}>{formatDashboardCount(q.total_passed)}</span><span className="note">pass</span></span>
        <span className="stat-inline" data-field-tone="fail"><span className="big c-red" style={{ color: 'var(--field-fail)' }}>{formatDashboardCount(q.total_failed)}</span><span className="note">fail</span></span>
        <span className="stat-inline"><span className="big">{passRate(q.escalation_rate)}</span><span className="note">escalation</span></span>
      </div>
      <div className="bar-track ev-qg-bar">
        <div className="bar-fill m-green" data-field-tone="pass" data-semantic-concept="field:pass" data-semantic-label="Passed checks" style={{ background: 'var(--field-pass)', width: total > 0 ? `${(q.total_passed / total) * 100}%` : '0%' }} />
        <div className="bar-fill m-red" data-field-tone="fail" data-semantic-concept="field:fail" data-semantic-label="Failed checks" style={{ background: 'var(--field-fail)', width: total > 0 ? `${(q.total_failed / total) * 100}%` : '0%' }} />
      </div>
      {/* OMN-21166 Maple grid: the headline in view; the checks by type, cost to comply and escalation reasons are one
          click away, so the panel sits beside the selected run without running the length of the page. */}
      <details className="local-more ev-more">
      <summary>More quality detail</summary>
      <AcceptanceChecks q={q} />
      <div className="divider" />
      <div className="section-label">Escalation reasons</div>
      {q.failure_categories.slice(0, 6).map((f, i) => {
        const reason = escalationReason(f.category);
        return (
          <div className="ev-qg-cat" key={i}>
            <span className="mono c-amber">{formatDashboardCount(f.count)}</span>
            <span className="mono dim" title={reason.title}>{reason.text}</span>
          </div>
        );
      })}
      </details>
    </Panel>
  );
}

/** A served check name in words ("score vs required bar"); the served key stays in the data attribute. */
const checkName = (value: unknown) => (isUnavailableField(value) ? 'Not recorded' : String(value).replace(/_+/g, ' '));
const servedNumber = (value: unknown): number | null =>
  isUnavailableField(value) || !Number.isFinite(Number(value)) ? null : Number(value);
const wholeTokens = (value: unknown) => {
  const n = servedNumber(value);
  return n === null ? 'Not recorded' : formatFullCount(Math.round(n));
};
const attempts = (value: unknown) => {
  const n = servedNumber(value);
  return n === null ? 'Not recorded' : n.toFixed(1);
};

/**
 * OMN-21166 AC66: what the quality gate checked and what it cost to pass, from the same served quality-gate row: each
 * check type with its own pass and fail counts, and the tokens and attempts a run took to comply, overall and by
 * model. Nothing is computed here; a field the runtime does not serve reads Not recorded and a list it does not serve
 * is left out.
 */
function AcceptanceChecks({ q }: { q: QualityGateRow }) {
  const checks = Array.isArray(q.by_check_type) ? q.by_check_type : [];
  const byModel = Array.isArray(q.tokens_to_compliance_by_model) ? q.tokens_to_compliance_by_model : [];
  return (
    <section className="ev-acceptance" aria-label="Acceptance checks">
      <div className="divider" />
      <div className="section-label">Acceptance checks</div>
      {checks.length > 0 && (
        <ul className="ev-acceptance-checks" aria-label="Checks by type">
          {checks.map((check, index) => (
            <li key={`${String(check.check_type)}-${index}`} data-check-type={String(check.check_type ?? '')}>
              <span>{checkName(check.check_type)}</span>
              <span data-field-tone="pass">{servedNumber(check.passed) === null ? 'Not recorded' : formatDashboardCount(check.passed)} passed</span>
              <span data-field-tone="fail">{servedNumber(check.failed) === null ? 'Not recorded' : formatDashboardCount(check.failed)} failed</span>
              <span>{servedNumber(check.pass_rate) === null ? 'Not recorded' : passRate(check.pass_rate)}</span>
            </li>
          ))}
        </ul>
      )}
      <KV items={[
        { k: 'Median tokens to comply', v: wholeTokens(q.median_tokens_to_compliance) },
        { k: 'Average tokens to comply', v: wholeTokens(q.avg_tokens_to_compliance) },
        { k: 'Average attempts', v: attempts(q.avg_compliance_attempts) },
      ]} />
      {byModel.length > 0 && (
        <ul className="ev-acceptance-models" aria-label="Tokens to comply by model">
          {byModel.map((model, index) => (
            <li key={`${String(model.model_name)}-${index}`}>
              <span className="mono local-model-identity" style={modelIdentityStyle(String(model.model_name ?? ''))}>{isUnavailableField(model.model_name) ? 'Unknown model' : String(model.model_name)}</span>
              <span>{wholeTokens(model.avg_tokens)} tokens</span>
              <span>{attempts(model.avg_attempts)} attempts</span>
              <span>{servedNumber(model.sample_count) === null ? 'Not recorded' : `${formatDashboardCount(model.sample_count)} runs`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── savings (aggregate) ──────────────────────────────────────────────────────

/**
 * OMN-21166 AC37/AC50: the money figures of the savings panel, from the same served row as Overview's Savings card
 * (cost.savings-overview.v1, or metering-summary.v1 when the old aggregate is not in the local store). Null when that
 * row cannot be read; the panel then names why instead of showing a figure.
 */
interface HeadlineMoney {
  cloud: unknown; local: unknown; saved: unknown;
  baselineModel: unknown; pricing: unknown; measuredRuns: unknown;
  /** The runs the total leaves out, as Overview's basis line names them; null when the source serves no such count. */
  basis: string | null;
}

function SavingsPanel({ money, unavailable }: { money: HeadlineMoney | null; unavailable: string }) {
  const { data, isLoading } = useDelegationSavings();
  if (isLoading || !data) {
    return <Panel title="SAVINGS vs CLOUD BASELINE"><EvEmpty title="Loading…" /></Panel>;
  }
  // delegation.savings.v1 supplies the baseline model and pricing version only when the headline row serves neither.
  const s = data.rows[0];
  const finite = (value: unknown) => !isUnavailableField(value) && Number.isFinite(Number(value));
  const cloud = money?.cloud;
  const width = (value: unknown) => finite(value) && finite(cloud) && Number(cloud) > 0
    ? `${Math.max(0, Math.min(100, (Number(value) / Number(cloud)) * 100))}%` : null;
  const bar = (label: string, value: unknown, concept: 'baseline' | 'cost' | 'savings', tone: string, labelClass = '') => (
    <div className="barrow" data-field-tone={concept} data-semantic-concept={`field:${concept}`} data-semantic-label={label}>
      <div className={`lab ${labelClass}`.trim()} style={{ color: 'var(--field-ink)' }}>{label}</div>
      <div className={`val ${labelClass}`.trim()} style={{ color: finite(value) ? 'var(--field-ink)' : 'var(--field-unavailable)' }}>{finite(value) ? formatUsd(value) : 'Not measured'}</div>
      <div className="track2 bar-track">{width(value) && <div className={`bar-fill ${tone}`} style={{ width: width(value)!, background: 'var(--field-ink)' }} />}</div>
    </div>
  );
  const baselineModel = !isUnavailableField(money?.baselineModel) ? money?.baselineModel : s?.baseline_model;
  const pricing = pricingLabel(!isUnavailableField(money?.pricing) ? money?.pricing : s?.pricing_manifest_version);
  return (
    <Panel
      title="SAVINGS vs CLOUD BASELINE"
      sub={baselineModel ? String(baselineModel) : 'Baseline model not recorded'}
      right={pricing ? <span className="src-tag">{pricing}</span> : undefined}
    >
      <span className="stat-inline ev-savings-hero" data-field-tone="savings">
        <span className="big c-amber" style={{ color: money && finite(money.saved) ? 'var(--field-savings)' : 'var(--field-unavailable)' }}>{money ? servedUsd(money.saved) : unavailable}</span>
        <span className="note">cumulative savings (modelled) over {money ? servedCount(money.measuredRuns) : 'Not measured'} measured runs</span>
      </span>
      {/* The money source names the runs it leaves out where it serves them; the savings population cannot fill it. */}
      <p className="note">{money?.basis ?? 'Unpriced runs not recorded'}</p>
      {bar('Cloud baseline cost', cloud, 'baseline', 'm-blue')}
      {bar('Local / delegated cost', money?.local, 'cost', 'm-green')}
      {bar('Saved', money?.saved, 'savings', 'm-green', 'c-green')}
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
    // OMN-21166 part 13: when nothing is served the panel is one line, not an empty card (Usage owns token figures).
    return (
      <p className="ev-unserved-line" role="status">
        Token usage by model: {plainUnservedReason(data.degradedReason) ?? 'not available yet'}
      </p>
    );
  }
  const models = t.by_model.filter((m) => m.total_tokens > 0 || m.token_provenance === 'measured');
  const max = Math.max(1, ...models.map((m) => m.total_tokens));
  return (
    <Panel title="TOKEN USAGE" sub={`${formatDashboardCount(t.total_tokens)} total · ${formatUsd(t.total_estimated_cost_usd)}`}>
      <div className="ev-token-summary">
        <div data-field-tone="tokens-in"><div className="note">Prompt</div><div className="mono ev-token-num">{formatFullCount(t.total_prompt_tokens)}</div></div>
        <div data-field-tone="tokens-out"><div className="note">Completion</div><div className="mono ev-token-num">{formatFullCount(t.total_completion_tokens)}</div></div>
        <div data-field-tone="cost"><div className="note">Est. cost</div><div className="mono ev-token-num c-amber">{formatUsd(t.total_estimated_cost_usd)}</div></div>
      </div>
      {models.map(m => (
        <div className="barrow" key={m.model_id}>
          <div className="lab local-model-identity" title={m.model_name} style={modelIdentityStyle(m.model_id)}>{m.model_name.length > 26 ? `${m.model_name.slice(0, 24)}…` : m.model_name}</div>
          <div className="val">{formatDashboardCount(m.total_tokens)} {m.token_provenance === 'measured' ? <span className="c-green">●</span> : <span className="dim3">○</span>}</div>
          <div className="track2 bar-track"><div className="bar-fill" data-model-id={m.model_id} style={{ width: `${Math.max(2, (m.total_tokens / max) * 100)}%`, background: modelColor(m.model_id) }} /></div>
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
          { k: 'Task type', v: taskLabel(row.task_type) },
          { k: 'Model', v: row.model_name },
          { k: 'Quality detail', v: row.quality_gate_detail ? escalationReason(row.quality_gate_detail).text : '—' },
          { k: 'Tokens in / out', v: `${row.tokens_input == null ? 'Not recorded' : formatFullCount(row.tokens_input)} / ${row.tokens_output == null ? 'Not recorded' : formatFullCount(row.tokens_output)}` },
          { k: 'Latency', v: fmtLatency(row.latency_ms) },
          { k: 'Created', v: readableTime(row.created_at) ?? row.created_at },
        ]}
      />
      {isLoading ? (
        <div className="note">Loading the run…</div>
      ) : trace && (trace.prompt_text || trace.response_text) ? (
        <div className="grid cols-2">
          {trace.prompt_text ? <CodeBlock title="Prompt" lang="text" code={trace.prompt_text} /> : <div className="note">Prompt not recorded</div>}
          {trace.response_text ? <CodeBlock title="Answer" lang="text" code={trace.response_text} /> : <div className="note">Answer not recorded</div>}
        </div>
      ) : (
        <div className="note">Prompt and answer not recorded for this run</div>
      )}
      {trace ? (
        <div>
          <div className="section-label">Run path</div>
          <Chain steps={buildChain(trace)} />
        </div>
      ) : null}
    </>
  );
}

function RecentDelegations({ decisions }: { decisions: DelegationDecisionRow[] }) {
  const cols: DataColumn<DelegationDecisionRow>[] = [
    { key: 'correlation_id', label: 'Correlation', render: (r) => <span className="mono c-blue">{shortId(r.correlation_id)}</span> },
    { key: 'task_type', label: 'Task', grow: true, render: (r) => taskLabel(r.task_type) },
    { key: 'model_name', label: 'Model', truncate: true, render: (r) => <span className="mono local-model-identity" style={modelIdentityStyle(r.model_name)}>{r.model_name.length > 22 ? `${r.model_name.slice(0, 20)}…` : r.model_name}</span> },
    { key: 'state', label: 'State', render: (r) => <StateBadge passed={r.quality_gate_passed} /> },
    { key: 'tokens', label: 'Tokens', num: true, render: (r) => formatDashboardCount(r.tokens_to_compliance) },
    { key: 'latency_ms', label: 'Latency', num: true, render: (r) => fmtLatency(r.latency_ms) },
    // OMN-21166 AC60: the time reads as on the other pages; the served value is the title.
    { key: 'created_at', label: 'Created', num: true, render: (r) => <span className="dim" title={r.created_at}>{readableTime(r.created_at) ?? r.created_at}</span> },
  ];
  return (
    <Panel
      title="RECENT DELEGATIONS"
      pad={false}
      right={<span className="note">showing {formatDashboardCount(decisions.length)}</span>}
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
  const delegations = fixtureAmount(summary.fixtureDelegations);
  const savings = fixtureAmount(summary.fixtureSavingsUsd);
  if (delegations !== null && delegations > 0) {
    return `Includes ${formatDashboardCount(delegations)} fixture delegation${delegations === 1 ? '' : 's'}`;
  }
  if (savings !== null && savings > 0) return `Includes ${formatUsd(summary.fixtureSavingsUsd)} of fixture savings`;
  return null;
}

/** A served amount as a number: a finite number or decimal text; true, {} or '' is not an amount. */
function fixtureAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

function withFixtureNotice(text: string, notice: string | null): string {
  return notice ? `${text} · ${notice}` : text;
}

// ── headline (one source with Overview) ──────────────────────────────────────

interface EvidenceHeadline {
  runs: ReactNode; runsSub: string | null; savings: ReactNode; tokens: ReactNode;
  money: HeadlineMoney | null; unavailable: string;
}

function unavailableHeadline(unavailable: string): EvidenceHeadline {
  return { runs: unavailable, runsSub: null, savings: unavailable, tokens: unavailable, money: null, unavailable };
}

/** The cost.savings-overview.v1 headline, as Overview's aggregate cards read it. */
function aggregateHeadline(rows: readonly CostSavingsOverviewRow[] | undefined, loading: boolean): EvidenceHeadline {
  const picked = rows ? overviewRowOf(rows) : null;
  if (picked === 'ambiguous') return unavailableHeadline('Not measured: ambiguous overview totals');
  if (picked === null) return unavailableHeadline(loading ? '—' : 'Not measured');
  return {
    runs: servedCount(overviewRunCount(picked)),
    runsSub: runBreakdownText(picked as unknown as Record<string, unknown>),
    savings: servedUsd(picked.total_savings_usd),
    tokens: servedCount(picked.tokens_total),
    money: { cloud: picked.total_baseline_cost_usd, local: picked.total_cost_usd, saved: picked.total_savings_usd,
      baselineModel: null, pricing: null, measuredRuns: picked.measured_run_count, basis: null },
    unavailable: 'Not measured',
  };
}

/**
 * The metering-summary.v1 headline, as Overview's metering cards read it: the same all-time row (pickMeteringRow),
 * the same Agent calls figure and run classes, the same token total and the same money basis line.
 */
function meteringHeadline(rows: readonly unknown[] | undefined, loading: boolean): EvidenceHeadline {
  if (!rows) return unavailableHeadline(loading ? '—' : 'Not measured');
  const picked = pickMeteringRow(rows, 'all');
  if ('message' in picked) return unavailableHeadline(picked.message);
  const row = picked.row;
  const unresolved = row.baseline_state === 'unresolved';
  return {
    runs: servedCount(row.runs_measured),
    runsSub: captionText({ runs_total: row.runs_total, runs_unknown_tokens: row.runs_unknown_tokens, runs_unknown_spend: row.runs_unknown_spend }),
    savings: unresolved ? 'Baseline unresolved' : servedUsd(row.savings_usd),
    tokens: servedCount(meteringTokens(row).total),
    money: { cloud: unresolved ? null : row.counterfactual_usd, local: row.spend_usd, saved: unresolved ? null : row.savings_usd,
      baselineModel: row.baseline_model, pricing: row.pricing_manifest_version, measuredRuns: row.runs_measured,
      basis: captionText(meteringMoneyBasis(row)) },
    unavailable: 'Not measured',
  };
}

// ── page ─────────────────────────────────────────────────────────────────────

/**
 * OMN-21166 AC79: the page's scope in one line: the window (all time, as the headline row is) and the same served
 * delegation count the Delegations figure shows. A count that is not a number stays in words.
 */
export function evidenceScopeLine(runs: ReactNode): ReactNode {
  if (typeof runs !== 'string') return <>All time · delegations served: {runs}</>;
  if (!/^\d[\d,.]*[KMB]?$/.test(runs)) return `All time · delegations served: ${runs}`;
  return `All time · ${runs} ${runs === '1' ? 'delegation' : 'delegations'} served`;
}

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

  // OMN-21166 AC37/AC50: savings, tokens and runs come from the same served row as Overview's headline cards, so the
  // two pages show one figure per concept. Overview reads metering-summary.v1 when the catalogue says the old
  // aggregate is not in the local store; Evidence asks the catalogue the same question and reads the same row.
  const censusQ = useExposureCensus();
  const source = censusQ.data ? overviewHeadlineSource(censusQ.data) : null;
  const meteringQ = useMeteringSummary(source === 'metering');
  const headline = source === 'metering'
    ? meteringHeadline(meteringQ.data?.rows, meteringQ.isLoading || censusQ.isLoading)
    : aggregateHeadline(overviewQ.data?.rows, overviewQ.isLoading);

  // Include the savings source in freshness alongside the other headline projections.
  // so the header reflects the composite data state, not a single query's freshness.
  const headlineSnapshot = source === 'metering' ? meteringQ.data : overviewQ.data;
  const snapshots: ProjectionSnapshot[] = [summaryQ.data, tokensQ.data, decisionsQ.data, savingsQ.data, headlineSnapshot]
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
      scope={evidenceScopeLine(headline.runs)}
      headRight={headRight}
    >
      {/* OMN-21166 AC63: the four headline figures read as one segmented strip, as on the local pages. */}
      <div className="grid cols-4 ev-kpi-strip">
        <KPI label="Delegations" icon={<Activity size={15} aria-hidden="true" />} tone="blue" value={headline.runs} sub={headline.runsSub ?? undefined} />
        <KPI label="Quality pass" icon={<Award size={15} aria-hidden="true" />} tone="green" value={summary ? passRate(summary.qualityGatePassRate) : '—'} sub={withFixtureNotice('deterministic gate', fixtureNotice)} />
        <KPI label="Savings (modelled)" icon={<PiggyBank size={15} aria-hidden="true" />} tone="purple" value={headline.savings} accent sub="vs cloud baseline" />
        <KPI label="Tokens" icon={<Coins size={15} aria-hidden="true" />} tone="amber" value={headline.tokens} sub={summary ? withFixtureNotice(`avg ${formatDuration(summary.avgLatencyMs)} latency`, fixtureNotice) : undefined} />
      </div>

      {/* OMN-21166 Maple grid, as on the local pages: the selected run (8 of 12) beside its quality gate (4), then routing
          beside savings (6 and 6); token usage is one line when it is not served. */}
      <div className="maple-grid ev-maple-grid">
        <div className="maple-cell maple-cell--wide"><SelectedRun correlationId={latestCid} decision={decisions[0]} /></div>
        <div className="maple-cell"><QualityGate /></div>
        <div className="maple-cell maple-cell--half"><ModelRouting /></div>
        <div className="maple-cell maple-cell--half"><SavingsPanel money={headline.money} unavailable={headline.unavailable} /></div>
        <div className="maple-cell maple-cell--full"><TokenUsage /></div>
      </div>

      {decisionsQ.isLoading ? (
        <Panel title="RECENT DELEGATIONS"><EvEmpty title="Loading…" /></Panel>
      ) : decisions.length === 0 ? (
        <Panel title="RECENT DELEGATIONS">
          <EvEmpty title="No delegation decisions" reason={plainUnservedReason(decisionsQ.data?.degradedReason)} note="No delegation decisions recorded yet." />
        </Panel>
      ) : (
        <RecentDelegations decisions={decisions} />
      )}
    </EvPageShell>
  );
}
