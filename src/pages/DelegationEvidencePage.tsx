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
import { formatUsd } from '@/components/dashboard/usage/UsageByModelDayWidget';
import { isUnavailableField } from '@/components/dashboard/field-identity';
import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { RankedBars } from '@/components/dashboard/RankedBars';
import {
  Badge,
  CodeBlock,
  DataTable,
  EvEmpty,
  FreshnessChip,

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
import { formatDuration } from '@/components/format/duration';
import { percent as sharePercent } from '@/pages/local/shares';
import { taskLabel } from '@/pages/local/plain-text';
import { readableTime } from '@/components/format/readable-time';
import { modelIdentityStyle } from '@/components/dashboard/model-identity';

/**
 * OMN-21166 AC72 pass 1: a rate on Evidence reads to one decimal, as Overview writes the same served rate (91.6%, not
 * 92%), and a rate above zero never reads 0%.
 */
const passRate = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? '—' : sharePercent(value);

const recordedMoney = (value: unknown) => isUnavailableField(value) || !Number.isFinite(Number(value))
  ? 'Not recorded' : formatUsd(value);

function decisionModelledSaving(decision: DelegationDecisionRow | undefined): string {
  if (!decision) return 'Not measured';
  const figure = runModelledCell(decision as unknown as Record<string, unknown>);
  if (figure.startsWith('Not measured')) return figure;
  return `${figure} · modelled · ${pricingLabel(decision.savings_pricing_manifest_version) ?? 'pricing Not measured'}`;
}

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
          { k: 'Savings (modelled)', v: decisionModelledSaving(decision) },
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
  // Live review 2026-10-26 ("all bar graph follow this style"): the hatched ranked bars of the local pages, every
  // served model (none cut to a top few), its count and share on hover.
  return (
    <Panel title="MODEL ROUTING" sub={`${formatDashboardCount(agg.total_delegations)} delegations by selected model (aggregate)`}>
      <RankedBars label="Delegations by model" unit="Delegations · measured" order="desc" layout="vertical"
        items={[...byModel.entries()].map(([model, count]) => ({
          key: model, name: model, value: count, basis: 'measured' as const, color: modelColor(model),
          display: `${formatDashboardCount(count)} · ${sharePercent(count / agg.total_delegations)}`,
        }))} />
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
  const passed = servedNumber(q.total_passed);
  const failed = servedNumber(q.total_failed);
  const total = passed !== null && failed !== null ? passed + failed : null;
  const categories = Array.isArray(q.failure_categories)
    ? [...q.failure_categories].sort((a, b) => (servedNumber(b.count) ?? 0) - (servedNumber(a.count) ?? 0)) : null;
  const largestCategory = categories?.reduce((max, category) => Math.max(max, servedNumber(category.count) ?? 0), 0) ?? 0;
  return (
    <Panel title="QUALITY GATE" sub="All quality checks served · deterministic checks">
      <div className="ev-qg-stats">
        <span className="stat-inline"><span className="big c-amber" style={{ color: 'var(--field-pass)' }}>{servedNumber(q.overall_pass_rate) === null ? 'Not served' : passRate(q.overall_pass_rate)}</span><span className="note">pass rate</span></span>
        <span className="stat-inline" data-field-tone="pass"><span className="big c-green" style={{ color: 'var(--field-pass)' }}>{passed === null ? 'Not served' : formatDashboardCount(passed)}</span><span className="note">pass</span></span>
        <span className="stat-inline" data-field-tone="fail"><span className="big c-red" style={{ color: 'var(--field-fail)' }}>{failed === null ? 'Not served' : formatDashboardCount(failed)}</span><span className="note">fail</span></span>
        <span className="stat-inline"><span className="big">{servedNumber(q.escalation_rate) === null ? 'Not served' : passRate(q.escalation_rate)}</span><span className="note">escalation rate</span></span>
      </div>
      <div className="bar-track ev-qg-bar">
        <div className="bar-fill m-green" data-field-tone="pass" data-semantic-concept="field:pass" data-semantic-label="Passed checks" style={{ background: 'var(--field-pass)', width: total && passed !== null ? `${(passed / total) * 100}%` : '0%' }} />
        <div className="bar-fill m-red" data-field-tone="fail" data-semantic-concept="field:fail" data-semantic-label="Failed checks" style={{ background: 'var(--field-fail)', width: total && failed !== null ? `${(failed / total) * 100}%` : '0%' }} />
      </div>
      {/* OMN-21166 Maple grid: the headline in view; the checks by type, cost to comply and escalation reasons are one
          click away, so the panel sits beside the selected run without running the length of the page. */}
      <details className="local-more ev-more">
      <summary>More quality detail</summary>
      <AcceptanceChecks q={q} />
      <div className="divider" />
      <div className="section-label">Failure categories</div>
      {categories === null ? <p className="note">Not served</p> : categories.length === 0 ? <p className="note">0 failure categories</p> : (
        <ol className="ev-quality-categories" aria-label="Failure categories ranked">
          {categories.map((category, index) => {
            const reason = escalationReason(category.category);
            const count = servedNumber(category.count);
            return <li data-quality-category key={`${String(category.category)}-${index}`}>
              <span className="mono" title={reason.title}>{reason.text}</span>
              <span className="ev-quality-track"><span style={{ width: count !== null && largestCategory > 0 ? `${count / largestCategory * 100}%` : '0%' }} /></span>
              <span className="mono">{count === null ? 'Not served' : formatDashboardCount(count)}</span>
            </li>;
          })}
        </ol>
      )}
      </details>
    </Panel>
  );
}

/** A served check name in words ("score vs required bar"); the served key stays in the data attribute. */
const checkName = (value: unknown) => (isUnavailableField(value) ? 'Not served' : String(value).replace(/_+/g, ' '));
const servedNumber = (value: unknown): number | null =>
  isUnavailableField(value) || !Number.isFinite(Number(value)) ? null : Number(value);
const wholeTokens = (value: unknown) => {
  const n = servedNumber(value);
  return n === null ? 'Not served' : formatFullCount(Math.round(n));
};
const attempts = (value: unknown) => {
  const n = servedNumber(value);
  return n === null ? 'Not served' : n.toFixed(1);
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
      {q.by_check_type == null ? <p className="note">Checks by type: Not served</p> : checks.length === 0 ? <p className="note">0 check types</p> : (
        <ul className="ev-acceptance-checks" aria-label="Checks by type">
          {checks.map((check, index) => (
            <li key={`${String(check.check_type)}-${index}`} data-check-type={String(check.check_type ?? '')}>
              <span>{checkName(check.check_type)}</span>
              <span data-field-tone="pass">{servedNumber(check.passed) === null ? 'Not served' : formatDashboardCount(check.passed)} passed</span>
              <span data-field-tone="fail">{servedNumber(check.failed) === null ? 'Not served' : formatDashboardCount(check.failed)} failed</span>
              <span>{servedNumber(check.pass_rate) === null ? 'Not served' : passRate(check.pass_rate)}</span>
            </li>
          ))}
        </ul>
      )}
      <KV items={[
        { k: 'Median tokens to comply', v: wholeTokens(q.median_tokens_to_compliance) },
        { k: 'Average tokens to comply', v: wholeTokens(q.avg_tokens_to_compliance) },
        { k: 'Average attempts', v: attempts(q.avg_compliance_attempts) },
      ]} />
      {q.tokens_to_compliance_by_model == null ? <p className="note">Tokens to comply by model: Not served</p> : byModel.length === 0 ? <p className="note">0 models</p> : (
        <ul className="ev-acceptance-models" aria-label="Tokens to comply by model">
          {byModel.map((model, index) => (
            <li key={`${String(model.model_name)}-${index}`}>
              <span className="mono local-model-identity" style={modelIdentityStyle(String(model.model_name ?? ''))}>{isUnavailableField(model.model_name) ? 'Unknown model' : String(model.model_name)}</span>
              <span>{wholeTokens(model.avg_tokens)} tokens</span>
              <span>{attempts(model.avg_attempts)} attempts</span>
              <span>{servedNumber(model.sample_count) === null ? 'Not served' : `${formatDashboardCount(model.sample_count)} runs`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The same served outcome precedence as Runs: an explicitly failed terminal is failed even when its gate did not run.
function isFailedDecision(row: DelegationDecisionRow): boolean {
  const fields = row as unknown as Record<string, unknown>;
  return fields.terminal_ok === false || fields.terminal_ok === 0
    || fields.quality_gate_passed === false || fields.quality_gate_passed === 0;
}

function triageName(value: unknown, kind: 'model' | 'task'): string {
  if (value === null || value === undefined || value === '' || (kind === 'model' && value === 'delegate-skill')) {
    return kind === 'model' ? 'unknown' : 'Not recorded';
  }
  return String(value);
}

function TriageRows({ rows, denominator, kind }: {
  rows: ReadonlyArray<{ name: string; count: number | null; href: string }>;
  denominator: number | null;
  kind: 'category' | 'check' | 'model' | 'task';
}) {
  if (rows.length === 0) return <p className="note">No failures in this population.</p>;
  return <ol className="ev-triage-rows" aria-label={`Failures by ${kind}`}>
    {rows.map(row => <li data-triage-row key={`${kind}-${row.name}`}>
      <a href={row.href} aria-label={`View failed runs for ${row.name}`}>{row.name}</a>
      <span className="mono">{row.count === null ? 'Not served' : formatDashboardCount(row.count)} · {row.count === null || denominator === null || denominator === 0
        ? 'Share not served' : sharePercent(row.count / denominator)}</span>
    </li>)}
  </ol>;
}

/** AC205/AC205a: quality categories describe all-time checks; model and task groups describe only the served sample. */
function FailureTriage({ decisions, available }: { decisions: readonly DelegationDecisionRow[]; available: boolean }) {
  const qualityQ = useDelegationQualityGate();
  const quality = qualityQ.data?.rows[0];
  const failed = decisions.filter(isFailedDecision);
  const sampleLine = available
    ? `${formatDashboardCount(failed.length)} failed of ${formatDashboardCount(decisions.length)} latest served runs`
    : 'Latest served runs: Not measured';
  const grouped = (kind: 'model' | 'task') => {
    const groups = new Map<string, number>();
    for (const row of failed) {
      const name = triageName(kind === 'model' ? row.model_name : row.task_type, kind);
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }
    return [...groups.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({
      name: kind === 'task' && name !== 'Not recorded' ? taskLabel(name) : name,
      count,
      href: `/runs?status=failed&${kind}=${encodeURIComponent(name)}`,
    }));
  };
  const categories = Array.isArray(quality?.failure_categories) ? quality.failure_categories.map(item => ({
    name: (() => { const text = escalationReason(item.category).text; return text.charAt(0).toUpperCase() + text.slice(1); })(),
    count: servedNumber(item.count), href: '/runs?status=failed',
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name)) : null;
  const checks = Array.isArray(quality?.by_check_type) ? quality.by_check_type.map(item => ({
    name: checkName(item.check_type), count: servedNumber(item.failed), total: servedNumber(item.total),
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1) || a.name.localeCompare(b.name)) : null;
  const failedChecks = servedNumber(quality?.total_failed);
  return <Panel title="FAILURE TRIAGE" sub="Where quality failed">
    <DashboardTabs label="Failure triage" param="triage" tabs={[
      { id: 'category', label: 'By category', panel: () => <div className="ev-triage-panel">
        {qualityQ.isLoading ? <EvEmpty title="Loading quality checks…" /> : !quality
          ? <EvEmpty title="No quality-gate rows" reason={plainUnservedReason(qualityQ.data?.degradedReason ?? (qualityQ.error ? 'The runtime could not answer' : null))} />
          : <>
            <p className="note">All-time quality checks · {failedChecks === null ? 'Failed checks not served' : `${formatDashboardCount(failedChecks)} failed checks`}</p>
            <p className="note">Served runs do not record their failure category; a category opens every failed run.</p>
            <div className="section-label">Failure categories</div>
            {categories === null ? <p className="note">Categories not served</p> : <TriageRows rows={categories} denominator={failedChecks} kind="category" />}
            <div className="section-label">Checks by type</div>
            {checks === null ? <p className="note">Check types not served</p> : checks.length === 0 ? <p className="note">No failed checks by type.</p> :
              <ol className="ev-triage-rows" aria-label="Failures by check type">{checks.map(item => <li data-triage-row key={item.name}>
                <span>{item.name}</span><span className="mono">{item.count === null ? 'Not served' : formatDashboardCount(item.count)} · {item.count === null || item.total === null || item.total === 0
                  ? 'Share not served' : sharePercent(item.count / item.total)} of this check type</span>
              </li>)}</ol>}
          </>}
      </div> },
      { id: 'model', label: 'By model', panel: () => <div className="ev-triage-panel">
        <p className="note">{sampleLine}</p>
        {available ? <TriageRows rows={grouped('model')} denominator={failed.length} kind="model" />
          : <EvEmpty title="Failed runs not measured" note="The latest decisions could not be read." />}
      </div> },
      { id: 'task', label: 'By task', panel: () => <div className="ev-triage-panel">
        <p className="note">{sampleLine}</p>
        {available ? <TriageRows rows={grouped('task')} denominator={failed.length} kind="task" />
          : <EvEmpty title="Failed runs not measured" note="The latest decisions could not be read." />}
      </div> },
    ]} />
  </Panel>;
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
  unknownTokens?: unknown; unknownSpend?: unknown; mixedPricing?: boolean;
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
  // Live review 2026-10-26: the three money figures are hatched ranked bars, each in its concept's colour; which are
  // modelled and which measured is said in the unit line and in each bar's name.
  const moneyBar = (key: string, name: string, value: unknown, basis: 'measured' | 'estimated', color: string) => ({
    key, name, basis, color, value: finite(value) ? Number(value) : null, display: finite(value) ? formatUsd(value) : 'Not measured',
  });
  const baselineModel = !isUnavailableField(money?.baselineModel) ? money?.baselineModel : s?.baseline_model;
  const pricing = money?.mixedPricing ? 'mixed basis'
    : pricingLabel(!isUnavailableField(money?.pricing) ? money?.pricing : s?.pricing_manifest_version);
  return (
    <Panel
      title="SAVINGS vs CLOUD BASELINE"
      sub={baselineModel ? `Modelled vs ${String(baselineModel)}` : 'Baseline model not recorded'}
      right={pricing ? <span className="src-tag">{pricing}</span> : undefined}
    >
      <span className="stat-inline ev-savings-hero" data-field-tone="savings">
        <span className="big c-amber" style={{ color: money && finite(money.saved) ? 'var(--field-savings)' : 'var(--field-unavailable)' }}>{money ? servedUsd(money.saved) : unavailable}</span>
        <span className="note">cumulative savings (modelled) over {money ? servedCount(money.measuredRuns) : 'Not measured'} measured runs</span>
      </span>
      {/* The money source names the runs it leaves out where it serves them; the savings population cannot fill it. */}
      <p className="note">{money?.basis ?? 'Unpriced runs not recorded'}</p>
      <RankedBars label="Cost against the cloud baseline" unit="USD · baseline and saving modelled, local cost measured" order="desc" layout="vertical"
        items={[
          moneyBar('baseline', 'Cloud baseline cost', cloud, 'estimated', 'var(--field-baseline)'),
          moneyBar('cost', 'Local / delegated cost', money?.local, 'measured', 'var(--field-cost)'),
          moneyBar('savings', 'Saved', money?.saved, 'estimated', 'var(--field-savings)'),
        ]} />
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
  return (
    <Panel title="TOKEN USAGE" sub={`${formatDashboardCount(t.total_tokens)} total · ${formatUsd(t.total_estimated_cost_usd)}`}>
      <div className="ev-token-summary">
        <div data-field-tone="tokens-in"><div className="note">Prompt</div><div className="mono ev-token-num">{formatFullCount(t.total_prompt_tokens)}</div></div>
        <div data-field-tone="tokens-out"><div className="note">Completion</div><div className="mono ev-token-num">{formatFullCount(t.total_completion_tokens)}</div></div>
        <div data-field-tone="cost"><div className="note">Est. cost</div><div className="mono ev-token-num c-amber">{formatUsd(t.total_estimated_cost_usd)}</div></div>
      </div>
      {/* Part 16 AC97 (review fix): the hatched ranked bars of every other chart, whole model names, and whether each
          count is measured or estimated said in the bar's name. */}
      <RankedBars label="Tokens per model" unit="Tokens · each bar says whether its count is measured or estimated" order="desc" layout="vertical"
        items={models.map(m => ({
          key: m.model_id, name: m.model_name, value: m.total_tokens, color: modelColor(m.model_id),
          basis: m.token_provenance === 'measured' ? 'measured' as const : 'estimated' as const,
          display: `${formatFullCount(m.total_tokens)} tokens`,
        }))} />
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
  // The all-time row can carry one current manifest version even when its cumulative totals span earlier daily
  // versions. Daily rows of this same baseline are the served evidence for a mixed basis; never infer one from runs.
  const versions = new Set(rows.filter((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate))
    .filter(candidate => candidate.window_kind === 'day' && candidate.baseline_model === row.baseline_model)
    .map(candidate => candidate.pricing_manifest_version)
    .filter(version => !isUnavailableField(version)).map(String));
  if (!isUnavailableField(row.pricing_manifest_version)) versions.add(String(row.pricing_manifest_version));
  const mixedPricing = versions.size > 1 || /^mixed(?:\s|$)/i.test(String(row.pricing_manifest_version ?? ''));
  const basis = meteringMoneyBasis(row);
  return {
    runs: servedCount(row.runs_measured),
    runsSub: captionText({ runs_total: row.runs_total, runs_unknown_tokens: row.runs_unknown_tokens, runs_unknown_spend: row.runs_unknown_spend }),
    savings: unresolved ? 'Baseline unresolved' : servedUsd(row.savings_usd),
    tokens: servedCount(meteringTokens(row).total),
    money: { cloud: unresolved ? null : row.counterfactual_usd, local: row.spend_usd, saved: unresolved ? null : row.savings_usd,
      baselineModel: row.baseline_model, pricing: row.pricing_manifest_version, measuredRuns: row.runs_measured,
      unknownTokens: row.runs_unknown_tokens, unknownSpend: row.runs_unknown_spend,
      mixedPricing,
      basis: captionText(mixedPricing
        ? { baseline_model: row.baseline_model, excluded_runs: basis.excluded_runs } : basis) },
    unavailable: 'Not measured',
  };
}

/** The claim and the money panel both receive the selected canonical metering row through EvidenceHeadline. */
function moneyBasis(money: HeadlineMoney | null): string {
  if (!money) return 'baseline Not measured · pricing Not measured';
  const baseline = isUnavailableField(money.baselineModel) ? 'baseline Not measured' : `vs ${String(money.baselineModel)}`;
  const pricing = money.mixedPricing ? 'mixed basis' : pricingLabel(money.pricing) ?? 'pricing Not measured';
  return `${baseline} · ${pricing}`;
}

function EvidenceClaim({ money, unavailable }: { money: HeadlineMoney | null; unavailable: string }) {
  const saved = money ? servedUsd(money.saved) : unavailable;
  const count = (value: unknown) => servedCount(value);
  return (
    <section className="ev-evidence-claim" aria-label="Evidence claim">
      <p className="ev-evidence-claim-sentence">
        {saved === 'Not measured' || saved.startsWith('Not measured:')
          ? <>Modelled savings: {saved}.</>
          : <>Savings were {saved}, modelled {moneyBasis(money)}.</>}
      </p>
      <dl className="ev-evidence-derivation" aria-label="Claim derivation">
        <div><dt>Measured runs</dt><dd>{count(money?.measuredRuns)} measured runs</dd></div>
        <div><dt>No token counts</dt><dd>{count(money?.unknownTokens)} with no token counts</dd></div>
        <div><dt>No spend recorded</dt><dd>{count(money?.unknownSpend)} with no spend recorded</dd></div>
        <div><dt>Actual spend</dt><dd>{money ? servedUsd(money.local) : unavailable}</dd></div>
        <div><dt>Baseline cost (modelled)</dt><dd>{money ? servedUsd(money.cloud) : unavailable}</dd></div>
      </dl>
    </section>
  );
}

/**
 * A served dollar figure exactly as served (amendment 30b, AC207a): thousands separated, every served decimal kept, none
 * added or rounded away. A number is written in its shortest exact form, so a parsed 4.743332 never prints float noise.
 */
function exactUsd(value: unknown): string {
  if (isUnavailableField(value)) return 'Not measured';
  const text = expandExponent(typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : typeof value === 'string' ? value.trim() : '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return 'Not measured';
  const [, sign, whole, fraction] = match;
  return `${sign ?? ''}$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}

/** The largest exponent written out; a served dollar figure beyond it is not a real amount (Codex MSG 9f72d7f9). */
const MAX_EXPONENT = 40;

/**
 * A decimal in exponent form (3e-7, as a small number prints) written out by moving the point, with no arithmetic. An
 * exponent past MAX_EXPONENT is left as it is, so the caller reads it as Not measured instead of building a huge string.
 */
function expandExponent(text: string): string {
  const match = /^(-)?(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (!match || Math.abs(Number(match[4])) > MAX_EXPONENT) return text;
  const [, sign = '', whole, fraction = '', power] = match;
  const digits = `${whole}${fraction}`;
  const point = whole!.length + Number(power);
  const body = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? `${digits}${'0'.repeat(point - digits.length)}`
    : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${sign}${body.replace(/^0+(?=\d)/, '')}`;
}

/** AC207: the equation reads one all-time metering row, never the latest decision sample. */
function SavingsBridge({ rows, loading }: { rows: readonly unknown[] | undefined; loading: boolean }) {
  const canonical = meteringHeadline(rows, loading);
  const money = canonical.money;
  return <Panel title="SAVINGS BRIDGE" sub="All-time metering">
    <section className="ev-savings-bridge" aria-label="Savings bridge">
      <p className="note">{moneyBasis(money)}</p>
      <div className="ev-savings-equation">
        <div><span className="section-label">Baseline cost (modelled)</span><strong>{money ? exactUsd(money.cloud) : canonical.unavailable}</strong></div>
        <span className="ev-savings-operator" aria-label="minus">−</span>
        <div><span className="section-label">Actual spend</span><strong>{money ? exactUsd(money.local) : canonical.unavailable}</strong></div>
        <span className="ev-savings-operator" aria-label="equals">=</span>
        <div><span className="section-label">Saving (modelled)</span><strong>{money ? exactUsd(money.saved) : canonical.unavailable}</strong></div>
      </div>
      <p className="note">Each figure is shown exactly as served, so baseline cost minus actual spend equals the saving; headline cards round to cents.</p>
    </section>
  </Panel>;
}

const sampleOrder = (a: DelegationDecisionRow, b: DelegationDecisionRow) =>
  (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);

function downloadDecisionSample(rows: readonly DelegationDecisionRow[], format: 'csv' | 'json') {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row as unknown as Record<string, unknown>)))];
  const csvCell = (value: unknown) => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const body = format === 'json' ? JSON.stringify(rows, null, 2)
    : [keys.map(csvCell).join(','), ...rows.map(row => keys.map(key => csvCell((row as unknown as Record<string, unknown>)[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `delegation-decisions-latest-${rows.length}-sample.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DecisionSampleExport({ decisions, available }: { decisions: readonly DelegationDecisionRow[]; available: boolean }) {
  const latest = [...decisions].sort(sampleOrder);
  return (
    <section className="ev-decision-export" aria-label="Decision sample export">
      <span>{available ? <>Latest {formatDashboardCount(latest.length)} served decisions · sample, not the runs behind headline totals</>
        : 'Decision sample: Not measured'}</span>
      <div className="ev-decision-export-actions">
        <button type="button" disabled={!available || latest.length === 0} onClick={() => downloadDecisionSample(latest, 'csv')}>Export CSV</button>
        <button type="button" disabled={!available || latest.length === 0} onClick={() => downloadDecisionSample(latest, 'json')}>Export JSON</button>
      </div>
    </section>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

/**
 * OMN-21166 AC79: the page's scope in one line: the window (all time, as the headline row is) and the same served
 * delegation count the Delegations figure shows. A count that is not a number stays in words.
 */
export function evidenceScopeLine(runs: ReactNode, basis: 'served' | 'measured' = 'served'): ReactNode {
  if (basis === 'measured') {
    if (typeof runs !== 'string') return <>All time · measured delegations: {runs}</>;
    if (!/^\d[\d,.]*[KMB]?$/.test(runs)) return `All time · measured delegations: ${runs}`;
    return `All time · ${runs} measured ${runs === '1' ? 'delegation' : 'delegations'}`;
  }
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
  // The bridge always reads the canonical metering row, including when legacy Overview totals own the headline.
  const meteringQ = useMeteringSummary(true);
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
      scope={evidenceScopeLine(headline.runs, source === 'metering' ? 'measured' : 'served')}
      headRight={headRight}
    >
      <EvidenceClaim money={headline.money} unavailable={headline.unavailable} />
      {/* OMN-21166 AC63: the four headline figures read as one segmented strip, as on the local pages. */}
      {/* OMN-21166 part 15 AC91: the four headline figures are Overview's cards; their captions are in the tooltips. */}
      <KpiStrip label="Delegation summary" items={[
        // Part 29 AC191: one fact per line, so the drawn caption is the short first one ('Of N runs') and the exclusions
        // stay in the page instead of being cut off.
        { label: 'Delegations', value: headline.runs, accent: 'var(--field-calls)', concept: 'calls', lines: headline.runsSub ? String(headline.runsSub).split(' \u00b7 ') : [] },
        { label: 'Quality pass', value: summary ? passRate(summary.qualityGatePassRate) : 'Not measured', unavailable: !summary,
          accent: 'var(--field-pass)', concept: 'pass', lines: [withFixtureNotice('deterministic gate', fixtureNotice)] },
        { label: 'Savings (modelled)', value: headline.savings, accent: 'var(--field-savings)', concept: 'savings', lines: [moneyBasis(headline.money)] },
        { label: 'Tokens', value: headline.tokens, accent: 'var(--field-tokens)', concept: 'tokens',
          lines: [summary ? withFixtureNotice(`avg ${formatDuration(summary.avgLatencyMs)} latency`, fixtureNotice) : null] },
      ]} />

      {/* OMN-21166 Maple grid, as on the local pages: the selected run (8 of 12) beside its quality gate (4); then each bar
          chart on its own full row, as on Overview (live review 2026-10-26), so no model name is cut; token usage is one
          line when it is not served. */}
      <div className="maple-grid ev-maple-grid">
        <div className="maple-cell maple-cell--wide"><SelectedRun correlationId={latestCid} decision={decisions[0]} /></div>
        <div className="maple-cell"><QualityGate /></div>
        <div className="maple-cell maple-cell--full"><FailureTriage decisions={decisions}
          available={!decisionsQ.isLoading && !!decisionsQ.data && !decisionsQ.data.degradedReason} /></div>
        <div className="maple-cell maple-cell--full"><ModelRouting /></div>
        <div className="maple-cell maple-cell--full"><SavingsPanel money={headline.money} unavailable={headline.unavailable} /></div>
        <div className="maple-cell maple-cell--full"><SavingsBridge rows={meteringQ.data?.rows} loading={meteringQ.isLoading} /></div>
        <div className="maple-cell maple-cell--full"><TokenUsage /></div>
      </div>

      <DecisionSampleExport decisions={decisions} available={!decisionsQ.isLoading && !!decisionsQ.data && !decisionsQ.data.degradedReason} />
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
