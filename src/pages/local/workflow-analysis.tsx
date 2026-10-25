import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { RunTimingChart } from './charts';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import { modelIdentityStyle } from '@/components/dashboard/model-identity';
import { formatUsd } from '@/components/dashboard/usage/UsageByModelDayWidget';
import type { BoundProjectionSnapshot } from '@/layout/local-page-loader';
import { plainFailureMessage } from './plain-text';

type Run = Record<string, unknown>;
const recorded = (value: unknown) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

/** OMN-21166: a run's recorded cost written as money like every other cost on the dashboard; a missing one is named. */
export function recordedUsd(value: unknown): string {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return 'Not recorded';
  return Number.isFinite(Number(value)) ? formatUsd(value) : String(value);
}
function measured(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Relative bar lengths only; the labels remain the exact served values. No
 * score, verdict, token total or missing value is inferred from another field. */
function Comparison({ title, kind, values }: {
  title: string; kind: 'tokens' | 'quality'; values: Array<{ label: string; value: unknown }>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const measurements = values.map(item => measured(item.value)).filter((value): value is number => value !== null);
  const maximum = Math.max(1, ...measurements);
  return <figure className={`local-chart workflow-analysis-card workflow-analysis-card--${kind}`} aria-label={title}>
    <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept={kind === 'tokens' ? 'token-flow' : 'quality-comparison'} label={title} size={16} />{title}</h3>
    <div className="workflow-comparison-bars">
      {values.map((item, index) => {
        const value = measured(item.value);
        return <button type="button" key={item.label} aria-pressed={selected === index}
          onClick={() => setSelected(index)} className="workflow-comparison-row" data-field-tone={fieldTone(item.label)} data-field-unavailable={value === null}
          style={{ '--bar-width': `${value === null ? 0 : value / maximum * 100}%` } as CSSProperties}>
          <span className="workflow-comparison-track" aria-hidden="true"><span /></span>
          <span>{item.label}</span><strong>{value === null ? 'Not recorded' : kind === 'tokens' ? formatFullCount(item.value) : recorded(item.value)}</strong>
        </button>;
      })}
    </div>
    {selected !== null && <p className="local-dashboard-caption" role="status">{values[selected]!.label}: {kind === 'tokens' ? (measured(values[selected]!.value) === null ? 'Not recorded' : formatFullCount(values[selected]!.value)) : recorded(values[selected]!.value)}</p>}
  </figure>;
}

export function WorkflowDecisionCharts({ decision, children }: { decision: Run; children: ReactNode }) {
  return <div className="workflow-analysis-grid">
    <div className="workflow-analysis-card workflow-analysis-card--timing">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="timing" size={16} />Run timing</h3>
      {children}
    </div>
    <Comparison title="Token flow" kind="tokens" values={[
      { label: 'Input tokens', value: decision.tokens_input }, { label: 'Output tokens', value: decision.tokens_output },
    ]} />
    <Comparison title="Quality score and threshold" kind="quality" values={[
      { label: 'Actual score', value: decision.actual_score }, { label: 'Required threshold', value: decision.required_bar },
    ]} />
  </div>;
}

/** OMN-21166 part 10 AC56: a served flag reads Yes or No; anything else that is not 1/0/true/false stays as served. */
function yesNo(value: unknown): unknown {
  if (value === 1 || value === true || value === '1' || value === 'true') return 'Yes';
  if (value === 0 || value === false || value === '0' || value === 'false') return 'No';
  return value;
}

/** OMN-21166 part 10 AC56: a writer recorded as an unresolved SQL placeholder (<sql:CURRENT_USER>) was not recorded. */
function writerOf(value: unknown): unknown {
  return typeof value === 'string' && /^<sql:[^>]*>$/.test(value.trim()) ? 'Not recorded' : value;
}

export function WorkflowRecordDetails({ decision, steps }: { decision: Run | undefined; steps: Run[] }) {
  const id = useId();
  const durations = steps.map((step, index) => ({ key: `stage-${index}`, label: recorded(step.step_kind).replaceAll('_', ' '), value: step.duration_ms }));
  return <div className="workflow-record-grid">
    {decision && <section className="workflow-analysis-card workflow-analysis-card--record" aria-labelledby={id}>
      <h3 id={id} className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="run-details" size={16} />Recorded run details</h3>
      <dl className="local-dashboard-fields">
        {[
          // OMN-19920 AC5: the run's receipt identity. receipt.json records the correlation id as receipt_id.
          ['Receipt id', decision.correlation_id],
          ['Created at', decision.created_at], ['Written at', decision.written_at],
          ['Recorded cost (USD)', decision.cost_usd], ['Data source', decision.data_source],
          ['Terminal OK', yesNo(decision.terminal_ok)], ['Session', decision.session_id],
          ...[
            ['Tokens to compliance', decision.tokens_to_compliance],
            ['Routed model', decision.routed_model], ['Answering backend', decision.answering_backend],
            ['Score source', decision.score_source], ['Recorded by', writerOf(decision.writer_identity)],
          ].filter(([, value]) => value !== null && value !== undefined && value !== ''),
        ].map(([label, value]) => <div key={String(label)} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}><dt><FieldIcon label={label} value={value} />{String(label)}</dt><dd>{(label === 'Created at' || label === 'Written at') && typeof value === 'string' && Number.isFinite(Date.parse(value))
          ? <time dateTime={value} title={value}>{new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC</time>
          : label === 'Recorded cost (USD)' ? recordedUsd(value) : label === 'Tokens to compliance' ? formatDashboardCount(value) : recorded(value)}</dd></div>)}
      </dl>
    </section>}
    {durations.some(item => measured(item.value) !== null) && <section className="workflow-analysis-card workflow-analysis-card--stages" aria-label="Stage timing analysis">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="stage-timing" size={16} />Execution stage durations</h3>
      <RunTimingChart timings={durations} title="Execution stage durations" accentToken="--workflow-stages-accent" />
    </section>}
  </div>;
}

/** An answer longer than this many lines or characters is folded, whole, under a summary that says how long it is. */
const ANSWER_FOLD_LINES = 12;
const ANSWER_FOLD_CHARS = 1200;

function AnswerText({ text }: { text: string }) {
  // Text only: React escapes it, so markup in an answer is shown as the characters it is and creates no element
  // (AC6). Never dangerouslySetInnerHTML, never a markdown renderer.
  const lines = text.split('\n').length;
  const block = <pre className="workflow-run-answer-text">{text}</pre>;
  if (lines <= ANSWER_FOLD_LINES && text.length <= ANSWER_FOLD_CHARS) return block;
  return <details className="workflow-run-answer-fold">
    <summary>{`Show the answer (${formatDashboardCount(lines)} lines, ${formatDashboardCount(text.length)} characters)`}</summary>
    {block}
  </details>;
}

/**
 * OMN-19920: the run's answer, the response_text of its delegation_events row as correlation-trace.v1 serves it for
 * this correlation id. Each state says what it is: not read yet, not served, read failed, served with no answer, or
 * answered for another run (refused, never shown under this run's id). What the user reads names no exposure, topic
 * or field (OMN-21166 AC39); those stay in this comment and the contract.
 */
export function RunAnswer({ read, runId }: { read: BoundProjectionSnapshot | undefined; runId: string }) {
  const id = useId();
  const state = (text: string, error = false) => <p className={error ? 'local-dashboard-error' : 'local-dashboard-empty'}>{text}</p>;
  let body: ReactNode;
  if (!read || read.runId !== runId) {
    body = state('Reading the answer…');
  } else if (read.failure && !read.lastGoodAt) {
    const failed = read.failure.kind === 'error' || read.failure.kind === 'timeout';
    body = state(plainFailureMessage(read.failure, { topic: read.topic, subject: 'The answer' }), failed);
  } else {
    const rows = read.rows.filter((row): row is Run => typeof row === 'object' && row !== null && !Array.isArray(row));
    const answers = rows.filter((row) => row.response_text !== null && row.response_text !== undefined && row.response_text !== '');
    body = rows.some((row) => row.correlation_id !== runId)
      ? state('The answer read belongs to another run, so it is not shown.', true)
      : answers.length === 0 ? state('No answer recorded for this run')
      : answers.map((row, index) => <div key={index}>
        <AnswerText text={String(row.response_text)} />
        <p className="local-dashboard-caption">{`Data source: ${recorded(row.data_source)}`}</p>
      </div>);
  }
  return <section className="workflow-analysis-card workflow-analysis-card--answer" aria-labelledby={id}>
    <h3 id={id} className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="answer" size={16} />Answer</h3>
    {body}
  </section>;
}

export function FlowConnector() {
  return <span className="workflow-flow-connector" aria-hidden="true" />;
}

/** A relationship visual from decision fields, explicitly separate from an
 * execution trace. It never invents a stage, duration, or live progress. */
export function WorkflowRoutingFlow({ decision, outcome }: { decision: Run; outcome: string }) {
  return <section aria-label="Recorded routing flow">
    <figure className="local-chart workflow-routing-flow">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="routing-flow" size={16} />Recorded routing flow</h3>
      <div className="workflow-routing-nodes">
        {[
          { label: 'Task', value: decision.task_type },
          { label: 'Backend', value: decision.backend_id },
          { label: 'Model', value: decision.model_name },
          { label: 'Outcome', value: outcome },
        ].map(({ label, value }, index) => <div className="workflow-flow-node" key={label} data-flow-kind={label.toLowerCase()} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}
          style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined}>
          <FieldIcon label={label} value={value} size={18} /><span>{label}</span><strong>{recorded(value)}</strong>
          {index < 3 && <FlowConnector />}
        </div>)}
      </div>
      <figcaption>Execution stages appear when a trace is recorded.</figcaption>
    </figure>
  </section>;
}
