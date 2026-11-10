import { formatDashboardCount, formatFullCount } from '@/lib/format';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ComparisonTrack } from '@/theme/design-system/charts';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import { formatDashboardUsd as formatUsd } from '@/lib/format';
import type { BoundProjectionSnapshot } from '@/layout/local-page-loader';
import { plainFailureMessage } from './plain-text';
import { useModelIdentityStyle } from '@/components/dashboard/model-tiers';
import { readableTime } from '@/lib/format';
import { ChevronRight } from '@/theme/design-system/icons';
import { EmptyState, Fact, FactList } from '@/theme/design-system/components';

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
          <ComparisonTrack />
          <span>{item.label}</span><strong>{value === null ? 'Not recorded' : kind === 'tokens' ? formatFullCount(item.value) : recorded(item.value)}</strong>
        </button>;
      })}
    </div>
    {selected !== null && <p className="local-dashboard-caption" role="status">{values[selected]!.label}: {kind === 'tokens' ? (measured(values[selected]!.value) === null ? 'Not recorded' : formatFullCount(values[selected]!.value)) : recorded(values[selected]!.value)}</p>}
  </figure>;
}

export function WorkflowDecisionCharts({ decision, children, show = 'all' }: {
  decision: Run; children: ReactNode;
  /** OMN-21166 Maple grid: the page shows the timing card; the token and score comparisons repeat the summary fields,
   *  so they sit under "More run details". */
  show?: 'all' | 'timing' | 'comparisons';
}) {
  // OMN-21166 part 13: no timing card when the run summary left its one-bar chart out.
  return <div className="workflow-analysis-grid">
    {show !== 'comparisons' && children !== null && children !== undefined && <div className="workflow-analysis-card workflow-analysis-card--timing">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="timing" size={16} />Run timing</h3>
      {children}
    </div>}
    {show !== 'timing' && <><Comparison title="Token flow" kind="tokens" values={[
      { label: 'Input tokens', value: decision.tokens_input }, { label: 'Output tokens', value: decision.tokens_output },
    ]} />
    <Comparison title="Quality score and threshold" kind="quality" values={[
      { label: 'Actual score', value: decision.actual_score }, { label: 'Required threshold', value: decision.required_bar },
    ]} /></>}
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

/** OMN-22168: the recorded fields of a run. The stage-duration chart that sat beside them repeated the Run timeline's step
 *  durations and is removed (Lakshman 2026-11-05, "remove duplicates"); `steps` is kept for the callers' signature. */
/** Facts a run with none of them leaves out (a run with no lineage names no retry); every other fact says Not recorded. */
const OPTIONAL_FACTS = new Set(['Tokens to compliance', 'Routed model', 'Answering backend', 'Score source', 'Recorded by', 'Retry of', 'Lineage']);
const RECORD_GROUPS: ReadonlyArray<{ name: string; concept: string; facts: (decision: Run) => Array<[string, unknown]> }> = [
  // OMN-19920 AC5: the run's receipt identity. receipt.json records the correlation id as receipt_id.
  { name: 'Identity', concept: 'identity', facts: decision => [['Receipt id', decision.correlation_id], ['Session', decision.session_id],
    // OMN-21166 AC66: a retried run names the run it retried and how; a run with no lineage leaves both out.
    ['Retry of', decision.parent_correlation_id], ['Lineage', decision.lineage_kind]] },
  { name: 'Recorded times', concept: 'age', facts: decision => [['Created at', decision.created_at], ['Written at', decision.written_at],
    ['Terminal OK', yesNo(decision.terminal_ok)]] },
  { name: 'Route and cost', concept: 'cost', facts: decision => [['Routed model', decision.routed_model], ['Answering backend', decision.answering_backend],
    ['Recorded cost (USD)', decision.cost_usd], ['Tokens to compliance', decision.tokens_to_compliance]] },
  { name: 'Source', concept: 'basis', facts: decision => [['Data source', decision.data_source], ['Score source', decision.score_source],
    ['Recorded by', writerOf(decision.writer_identity)]] },
];

export function WorkflowRecordDetails({ decision }: { decision: Run | undefined; steps?: Run[] }) {
  const id = useId();
  return <div className="workflow-record-grid">
    {decision && <section className="workflow-analysis-card workflow-analysis-card--record" aria-labelledby={id}>
      <h3 id={id} className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="run-details" size={16} />Recorded run details</h3>
      {/* The run's record as four cards in their own colours, as the run's cards above (Lakshman 2026-11-05, "like three
          cards colorful"): who and which run, when it was recorded, its route and cost, and where the record came from. */}
      <div className="workflow-record-groups">
        {RECORD_GROUPS.map(group => {
          const facts = group.facts(decision).filter(([label, value]) => !OPTIONAL_FACTS.has(String(label)) || (value !== null && value !== undefined && value !== ''));
          if (facts.length === 0) return null;
          return <section key={group.name} className="workflow-record-group" data-field-tone={group.concept} aria-label={group.name}>
            {/* Colour only: a glyph here would repeat the glyph of a fact inside the card (Lakshman 2026-11-05, "icons unique"). */}
            <h4 className="local-dashboard-caption">{group.name}</h4>
            <FactList>
              {facts.map(([label, value]) => <Fact key={String(label)} term={<><FieldIcon label={label} value={value} />{String(label)}</>} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}>{(label === 'Created at' || label === 'Written at') && typeof value === 'string' && Number.isFinite(Date.parse(value))
          // The time as every page writes it ("Nov 5, 14:58:46 UTC"), the served value its title; a measured zero cost the
          // run table's muted "$0" (Lakshman 2026-11-05).
          ? <time dateTime={value} title={value}>{readableTime(String(value)) ?? `${new Date(value).toISOString().slice(0, 19).replace('T', ' ')} UTC`}</time>
          : label === 'Recorded cost (USD)' ? (recordedUsd(value) === formatUsd(0)
            ? <span className="local-cost-free" title={recordedUsd(value)}>{recordedUsd(value).replace(/\.0+$/, '')}</span> : recordedUsd(value)) : label === 'Tokens to compliance' ? formatDashboardCount(value) : recorded(value)}</Fact>)}
            </FactList>
          </section>;
        })}
      </div>
    </section>}
  </div>;
}

/** An answer longer than this many lines or characters is folded, whole, under a summary that says how long it is. */
const ANSWER_FOLD_LINES = 12;
const ANSWER_FOLD_CHARS = 1200;

function AnswerText({ text, noun = 'answer' }: { text: string; noun?: 'answer' | 'prompt' }) {
  // Text only: React escapes it, so markup in an answer is shown as the characters it is and creates no element
  // (AC6). Never dangerouslySetInnerHTML, never a markdown renderer.
  const lines = text.split('\n').length;
  const block = <pre className="workflow-run-answer-text">{text}</pre>;
  if (lines <= ANSWER_FOLD_LINES && text.length <= ANSWER_FOLD_CHARS) return block;
  return <details className="workflow-run-answer-fold">
    {/* A styled disclosure instead of the browser's triangle: a chevron that turns when the answer is open. */}
    <summary><ChevronRight size={14} aria-hidden="true" className="workflow-run-answer-chevron" />{`Show the ${noun} (${formatDashboardCount(lines)} lines, ${formatDashboardCount(text.length)} characters)`}</summary>
    {block}
  </details>;
}

/**
 * OMN-19920: the run's answer, the response_text of its delegation_events row as correlation-trace.v1 serves it for
 * this correlation id. Each state says what it is: not read yet, not served, read failed, served with no answer, or
 * answered for another run (refused, never shown under this run's id). What the user reads names no exposure, topic
 * or field (OMN-21166 AC39); those stay in this comment and the contract.
 */
/** The run's prompt or answer from its correlation-trace.v1 row, in each read state, for the run asked and no other. */
function traceTextBody(read: BoundProjectionSnapshot | undefined, runId: string, noun: 'answer' | 'prompt'): ReactNode {
  const state = (text: string, error = false) => (error ? <p className="local-dashboard-error">{text}</p> : <EmptyState status={false}>{text}</EmptyState>);
  const field = noun === 'answer' ? 'response_text' : 'prompt_text';
  if (!read || read.runId !== runId) return state(`Reading the ${noun}…`);
  if (read.failure && !read.lastGoodAt) {
    const failed = read.failure.kind === 'error' || read.failure.kind === 'timeout';
    return state(plainFailureMessage(read.failure, { topic: read.topic, subject: `The ${noun}` }), failed);
  }
  const rows = read.rows.filter((row): row is Run => typeof row === 'object' && row !== null && !Array.isArray(row));
  const texts = rows.filter((row) => row[field] !== null && row[field] !== undefined && row[field] !== '');
  if (rows.some((row) => row.correlation_id !== runId)) return state(`The ${noun} read belongs to another run, so it is not shown.`, true);
  if (texts.length === 0) return state(`No ${noun} recorded for this run`);
  return texts.map((row, index) => <div key={index}>
    <AnswerText text={String(row[field])} noun={noun} />
    {/* Part 15 AC96: a real answer needs no source line; any other source (fixtures, an unrecorded one) is named. */}
    {row.data_source !== 'real' && <p className="local-dashboard-caption">{`Data source: ${recorded(row.data_source)}`}</p>}
  </div>);
}

/**
 * OMN-22168 (Lakshman 2026-11-05, "instead of Answer i want prompt or trace after each request in meaningful and logical
 * way"): the prompt under the run timeline's Request step and the answer under the step that returned it, each a named
 * region with its glyph, folded when long. The same read states as the answer card.
 */
export function RunTraceText({ read, runId, kind }: { read: BoundProjectionSnapshot | undefined; runId: string; kind: 'prompt' | 'answer' }) {
  const id = useId();
  const title = kind === 'prompt' ? 'Prompt' : 'Answer';
  return <section className="workflow-step-text" data-trace-text={kind} aria-labelledby={id}>
    <p id={id} className="workflow-step-text-title" data-field-tone={kind}><ConceptIcon concept={kind} label={title} size={14} />{title}</p>
    {traceTextBody(read, runId, kind)}
  </section>;
}

export function RunAnswer({ read, runId }: { read: BoundProjectionSnapshot | undefined; runId: string }) {
  const id = useId();
  const body = traceTextBody(read, runId, 'answer');
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
  const modelIdentityStyle = useModelIdentityStyle();
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
