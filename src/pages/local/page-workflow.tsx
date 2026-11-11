// OMN-23330 AC24: part of the local pages, split out of LocalDashboardPage.tsx (3,926 lines) with no change to what
// any page draws. The Workflow page: one run, its summary, neighbours and timeline.
import { formatDashboardCount } from '@/theme/format';
import { readableTime } from '@/theme/format';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'wouter';
import { normaliseRunId, workflowHref } from '@/navigation/workflow-url-state';
import { RunTimingChart, runTimingBars } from '@/theme/design-system/charts';
import { breakableName } from '@/theme/design-system/charts';
import { Badge, EmptyState, Fact, FactList, StatusChip } from '@/theme/design-system/components';
import { failureCauseLabel, plainFailureMessage, taskLabel, tierLabel } from '@/pages/local/plain-text';
import { ConceptIcon, FieldIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';
import { RunAnswer, RunTraceText, WorkflowDecisionCharts, WorkflowRecordDetails, WorkflowRoutingFlow } from '@/pages/local/workflow-analysis';
import { rowsForLocalBinding, DELEGATION_DECISIONS_TOPIC, RUN_TRACE_TOPIC, CORRELATION_TRACE_TOPIC, type BoundProjectionSnapshot, type LocalPageDocument } from '@/layout/local-page-loader';
import { useModelIdentityStyle } from '@/components/dashboard/model-tiers';
import { CopyButton, type Row, asRecords, causeTextOf, duration, isMissing, modelOrUnknown, newestFirst, recorded, recordedCount, recordedTokens, statusOf, tierOf, tokensTitle } from '@/pages/local/page-shared';
import { NoRunsYet } from '@/pages/local/page-runs';

/** A served flag as a word. The stores serve it as 1 and 0 or as true and false; anything else is shown as served. */
function yesOrNo(value: unknown): string {
  if (isMissing(value)) return recorded(value);
  if (value === true || value === 1) return 'yes';
  if (value === false || value === 0) return 'no';
  return String(value);
}

/**
 * The decision row of the run shown: its verdict, and the backend, host and tier that accepted it (OMN-20225). Every
 * value is one served field of that run's own row; a run with no served decision says so and borrows no other run's.
 */
export function RunSummary({ decision, showAnalysis = false }: { decision: Row | undefined; showAnalysis?: boolean }) {
  const modelIdentityStyle = useModelIdentityStyle();
  const sectionId = useId();
  if (!decision) return <EmptyState>No decision is served for this run</EmptyState>;
  const status = statusOf(decision);
  const fields: Array<[string, string]> = [
    ...(status === 'failed' ? [['Cause', causeTextOf(decision)] as [string, string]] : []),
    ['Quality score', recorded(decision.actual_score)],
    ['Task type', isMissing(decision.task_type) ? recorded(decision.task_type) : taskLabel(decision.task_type)],
    ['Model', modelOrUnknown(decision.model_name)],
    ['Backend', recorded(decision.backend_id)],
    ['Host', recorded(decision.host)],
    ['Route tier', tierOf(decision)],
    // OMN-21015: more of what the run's own row serves, each as served. A served zero is a figure and is shown; a
    // fact the row does not carry says Not recorded.
    ['Required bar', recorded(decision.required_bar)],
    ['Tokens in', recordedTokens(decision.tokens_input)],
    ['Tokens out', recordedTokens(decision.tokens_output)],
    ['Finish reason', recorded(decision.finish_reason)],
    ['Truncated', yesOrNo(decision.truncated)],
    ['Escalations', recordedCount(decision.escalation_count)],
    // The model the caller asked for, beside the model that answered; and the two timings the row serves beside its
    // duration. Each new one is the served column (omnimarket v0.4.309, OMN-19448): missing is Not recorded, never zero.
    ['Requested model', recorded(decision.requested_model)],
    // The three timings stand together and last, in the order their bars are drawn in under the tiles.
    ['Queue wait', duration(decision.queue_wait_ms)],
    ['Execution', duration(decision.execution_ms)],
    ['Duration', duration(decision.latency_ms)],
  ];
  const timings = [
    { key: 'queue_wait_ms', label: 'Queue wait', value: decision.queue_wait_ms },
    { key: 'execution_ms', label: 'Execution', value: decision.execution_ms },
    { key: 'latency_ms', label: 'Duration', value: decision.latency_ms },
  ];
  // OMN-21166 part 13: a chart whose one drawable bar is the total duration repeats the Duration tile, so it is left
  // out; the chart's own rule decides what is drawable, and the tiles still say Not recorded for the rest.
  const drawable = runTimingBars(timings).bars;
  const onlyTotal = drawable.length === 1 && drawable[0]!.label === 'Duration';
  const timingChart = onlyTotal ? null : <RunTimingChart timings={timings} compact={showAnalysis} />;
  return (
    <section aria-label="Run summary" className="local-dashboard-run-summary">
      <div className="local-run-summary-groups">
        {[
          { name: 'Run outcome', concept: 'run-outcome', labels: ['Cause', 'Quality score', 'Required bar', 'Task type'], help: 'Final status and quality result from this run’s decision record.' },
          { name: 'Routing and model', concept: 'routing-model', labels: ['Model', 'Requested model', 'Backend', 'Host', 'Route tier'], help: 'The requested model and recorded answering route. Not recorded means the run supplied no value.' },
          { name: 'Tokens and completion', concept: 'tokens-completion', labels: ['Tokens in', 'Tokens out', 'Finish reason', 'Truncated', 'Escalations'], help: 'Token counts and completion details recorded for this run.' },
          { name: 'Timing', concept: 'timing', labels: ['Queue wait', 'Execution', 'Duration'], help: 'Recorded decision timings. Duration here is the latency field; timeline steps carry separate durations.' },
        ].map(({ name, concept, labels, help }, index) => <section key={name} className="local-run-summary-group" data-field-tone={concept} tabIndex={0} aria-labelledby={`${sectionId}-${index}`} aria-describedby={`${sectionId}-${index}-help`}>
          <h3 className="local-dashboard-caption" id={`${sectionId}-${index}`}><ConceptIcon concept={concept} label={name} size={16} />{name}</h3>
          <FactList>
            {index === 0 && <Fact term={<><FieldIcon label="Status" value={status} />Status</>} data-field-tone={fieldTone('Status', status)}><OutcomePill value={status} /></Fact>}
            {fields.filter(([label]) => labels.includes(label)).map(([label, value]) => <Fact key={label} term={<><FieldIcon label={label} value={value} />{label}</>} data-summary-field={label} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)} style={fieldTone(label, value) === 'model' && !isUnavailableField(value) ? modelIdentityStyle(value) : undefined} valueTitle={label === 'Tokens in' ? tokensTitle(decision.tokens_input, 'in') : label === 'Tokens out' ? tokensTitle(decision.tokens_output, 'out') : undefined}>{label === 'Cause' && value.length > 120
              ? <details className="local-run-failure-details"><summary title={value}>Show failure reason</summary><p>{value}</p></details>
              // A model id breaks at its joins ("thinkingmachines/" then "inkling:free"), never mid-word (phone check 2026-11-05).
              : fieldTone(label, value) === 'model' && !isUnavailableField(value) ? breakableName(value) : value}</Fact>)}
          </FactList>
          <p className="local-run-summary-help" role="tooltip" id={`${sectionId}-${index}-help`}>{help}</p>
        </section>)}
      </div>
      {/* The same three timings as bars, under the labels their tiles carry. */}
      {showAnalysis ? (timingChart && <WorkflowDecisionCharts decision={decision} show="timing">{timingChart}</WorkflowDecisionCharts>) : timingChart}
    </section>
  );
}

/**
 * OMN-21015: from one run to the next. A run that is among the served runs links to the run before it and the run
 * after it in the list's newest-first order, so the runs are walked without going back to the list. Only a run with a
 * recorded id is a neighbour, since only it has a path to open; a run that is not among the served runs (a pasted id)
 * has no place between them and gets no links.
 */
export function RunNeighbours({ decisions, runId }: { decisions: readonly unknown[]; runId: string }) {
  const ids = newestFirst(decisions)
    .map((run) => run.correlation_id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  const at = ids.indexOf(runId);
  if (at < 0) return null;
  const newer = ids[at - 1];
  const older = ids[at + 1];
  if (newer === undefined && older === undefined) return null;
  return (
    // It stands in the run's title line, beside the id it leads away from, so it is a span with the navigation role.
    <span className="local-run-neighbours" role="navigation" aria-label="Neighbouring runs">
      {newer !== undefined && <Link href={workflowHref(newer)} title={newer} data-direction="newer">Newer run</Link>}
      {older !== undefined && <Link href={workflowHref(older)} title={older} data-direction="older">Older run</Link>}
    </span>
  );
}

/** The step kinds run-trace.v1 serves today; any other kind is shown as served, never dropped. */
const STEP_CONCEPTS: Record<string, string> = {
  request: 'step-request', routing_decision: 'step-routing', provider_call: 'step-provider-call', quality_gate: 'step-quality', terminal: 'step-terminal',
};
const RUN_STEP_LABELS: Record<string, string> = {
  request: 'Request',
  routing_decision: 'Routing decision',
  provider_call: 'Provider call',
  quality_gate: 'Quality gate',
  terminal: 'Terminal',
};

/**
 * WF-1 and WF-2: one run's steps, exactly as run-trace.v1 serves them (OMN-19987). The order is the exposure's, the
 * step sequence the delegate orchestrator assigned, so this renders rows in the order given and sorts nothing. The
 * step that failed a run is the one the terminal row names in failing_step_sequence; it is looked up, never inferred.
 */
export function RunTimeline({ steps, run, stepText }: {
  steps: readonly unknown[];
  /** The run's prompt, drawn under its Request step, and its answer, under the step that returned it (OMN-22168). */
  stepText?: { prompt?: ReactNode; answer?: ReactNode };
  /** The run's backend and model, shown in the run summary above; a step repeats them only where it differs (part 18 AC126). */
  run?: { backend_id?: unknown; model_name?: unknown; escalation_count?: unknown };
}) {
  const rows = asRecords(steps);
  if (rows.length === 0) {
    // With no steps the prompt and answer still read, under the timeline's empty state.
    return <><EmptyState>No steps recorded for this run</EmptyState>{stepText?.prompt}{stepText?.answer}</>;
  }
  const named = rows.find((row) => !isMissing(row.failing_step_sequence))?.failing_step_sequence;
  // Part 29 AC197: the steps on one time axis, from the earliest recorded start to the latest recorded end. A step is a
  // bar only when it carries both started_at and duration_ms; otherwise it is an unpositioned row reading not recorded,
  // so no duration or offset is ever invented.
  const timed = rows.map((row) => {
    const start = typeof row.started_at === 'string' ? Date.parse(row.started_at) : Number.NaN;
    const length = isMissing(row.duration_ms) ? Number.NaN : Number(row.duration_ms);
    return Number.isFinite(start) && Number.isFinite(length) && length >= 0 ? { start, end: start + length } : null;
  });
  const known = timed.filter((entry): entry is { start: number; end: number } => entry !== null);
  const origin = known.length > 0 ? Math.min(...known.map(entry => entry.start)) : 0;
  const span = known.length > 0 ? Math.max(1, Math.max(...known.map(entry => entry.end)) - origin) : 1;
  const escalations = run && !isMissing(run.escalation_count) ? Number(run.escalation_count) : 0;
  const attemptSteps = rows.some(row => !isMissing(row.attempt_number));
  // The prompt follows the Request (else the first step). The answer is the run's last response, so it follows the last
  // provider call whatever its outcome (else the last step): checked live 2026-11-05 on a failed run, whose recorded answer
  // was the final call's HTTP 404 message, not the text of the earlier call that succeeded.
  const kindOf = (row: Row) => String(row.step_kind ?? '');
  const firstRequest = rows.findIndex(row => kindOf(row) === 'request');
  const promptAt = firstRequest >= 0 ? firstRequest : 0;
  const lastCall = rows.map(kindOf).lastIndexOf('provider_call');
  const answerAt = lastCall >= 0 ? lastCall : rows.length - 1;
  return (
    <>
    {escalations > 0 && !attemptSteps && <p className="local-dashboard-caption" data-escalation-text>
      {`${escalations} ${escalations === 1 ? 'escalation' : 'escalations'} recorded; their attempts are not in this trace`}</p>}
    <ol className="local-dashboard-steps">
      {rows.map((row, index) => {
        const kind = String(row.step_kind ?? '');
        const failing = !isMissing(named) && row.step_sequence === named;
        const candidates = Array.isArray(row.candidates) ? row.candidates.map(String) : [];
        // OMN-21304 AC3: a routing decision's reason, candidates and confidence are what the step is for, so when the
        // row records none of them they are named as not recorded rather than vanish; a measured confidence of 0 stays a
        // value. Other steps keep leaving an absent detail out. OMN-23330 AC13 (the operator's 2026-11-09 review): a step
        // says "not recorded" once, naming every missing fact, where it said it up to six times (its duration, its start,
        // under its bar and in each routing chip).
        const routing = kind === 'routing_decision';
        const missingFacts = [
          ...(isMissing(row.started_at) ? ['start'] : []),
          ...(isMissing(row.duration_ms) ? ['duration'] : []),
          ...(routing && isMissing(row.reason) ? ['reason'] : []),
          ...(routing && candidates.length === 0 ? ['candidates'] : []),
          ...(routing && isMissing(row.confidence) ? ['confidence'] : []),
        ];
        // Each served detail under its own name; a detail the row does not carry is left out, never shown empty.
        const details: Array<[string, string]> = [
          ...(routing && !isMissing(row.confidence) ? [['confidence', String(row.confidence)] as [string, string]] : []),
          ...(isMissing(row.failure_cause) ? [] : [['cause', failureCauseLabel(row.failure_cause)] as [string, string]]),
          ...(isMissing(row.backend_id) || (run && String(row.backend_id) === String(run.backend_id)) ? [] : [['backend', String(row.backend_id)] as [string, string]]),
          ...(isMissing(row.model_id) || (run && String(row.model_id) === String(run.model_name)) ? [] : [['model', String(row.model_id)] as [string, string]]),
          ...(isMissing(row.attempt_number) ? [] : [['attempt', String(row.attempt_number)] as [string, string]]),
          // OMN-21166 AC54: candidate tiers read as words; the served keys stay in the data.
          ...(candidates.length === 0 ? [] : [['candidates', candidates.map(tierLabel).join(', ')] as [string, string]]),
        ];
        return (
          <li
            id={`run-step-${index + 1}`}
            key={`${String(row.step_sequence)}-${index}`}
            data-failing-step={failing ? 'true' : undefined}
            data-outcome={isMissing(row.outcome) ? undefined : String(row.outcome)}
          >
            {/* Each step kind has its own glyph and colour (Lakshman 2026-11-05, "modern, attractive"); the dot keeps the
                step's outcome colour. */}
            {/* The kind's colour is on its glyph and title only; the outcome pill keeps its own status colour (Lakshman
                2026-11-05, "succeeded colour should be green in all"). */}
            <div className="local-run-step-head">
              <ConceptIcon concept={STEP_CONCEPTS[kind] ?? 'step-other'} label={RUN_STEP_LABELS[kind] ?? recorded(row.step_kind)} size={15} />
              <strong data-field-tone={STEP_CONCEPTS[kind] ?? 'step-other'}>{RUN_STEP_LABELS[kind] ?? recorded(row.step_kind)}</strong>
              <OutcomePill value={row.outcome} />
              {failing && <Badge>Failed here</Badge>}
              {!isMissing(row.duration_ms) && <span className="local-run-step-duration" data-measured="true">
                <span>Duration</span> {duration(row.duration_ms)}
              </span>}
            </div>
            {!isMissing(row.started_at) && <ServedTime value={row.started_at} />}
            {(() => {
              const at = timed[index];
              return <div className="local-run-waterfall" data-waterfall data-positioned={at ? 'true' : 'false'}>
                {/* A measured 0 ms step is an instant marker at its start, never a widened bar (Codex MSG a9bd908d). */}
                {at ? <span data-waterfall-bar data-instant={at.end === at.start ? 'true' : undefined}
                  data-field-tone={String(row.outcome) === 'failed' ? undefined : STEP_CONCEPTS[kind] ?? 'step-other'} title={`${duration(row.duration_ms)} from ${duration(at.start - origin)}`}
                  style={{ '--wf-left': `${((at.start - origin) / span) * 100}%`, '--wf-width': `${((at.end - at.start) / span) * 100}%` } as CSSProperties} />
                  : <span className="local-run-waterfall-missing" aria-hidden="true" />}
              </div>;
            })()}
            {missingFacts.length > 0 && <p className="local-run-step-missing local-dashboard-caption" data-not-recorded>
              {`Not recorded: ${missingFacts.join(', ')}`}</p>}
            {details.length > 0 && (
              <div className="local-run-chips">
                {details.map(([name, value]) => (
                  <Badge look="run-fact" key={name}><span>{name}:</span> {value}</Badge>
                ))}
              </div>
            )}
            {!isMissing(row.reason) && <p className="local-run-step-reason">{String(row.reason)}</p>}
            {index === promptAt && stepText?.prompt}
            {index === answerAt && stepText?.answer}
          </li>
        );
      })}
    </ol>
    </>
  );
}

/** A served outcome or verdict as a pill, coloured by its own value; a value never served reads Not recorded. */
export function OutcomePill({ value }: { value: unknown }) {
  return (
    <StatusChip outcome={isMissing(value) ? undefined : String(value)}>{recorded(value)}</StatusChip>
  );
}

/**
 * A step's served timestamp, written for reading as the run tables write theirs (OMN-21166 R-A): nothing is moved to
 * another zone, and the exact served text is the element's datetime and title. Any other text is shown as served.
 */
function ServedTime({ value }: { value: unknown }) {
  if (isMissing(value)) return <span className="local-run-step-time">{recorded(value)}</span>;
  const text = String(value);
  const readable = readableTime(text);
  return <time className="local-run-step-time" dateTime={text} title={text}>{readable ?? text}</time>;
}

/** WF-3: open a run by a pasted correlation id, or go back to the newest run. */
function RunPicker({ requested, onOpen }: { requested: string | null; onOpen: (runId: string | null) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(requested ?? '');
  return (
    // The Runs search's pill (Lakshman 2026-11-05, "lets work on workflow page"): a search glyph inside the field, its
    // label kept for assistive tech, the open button a pill beside it.
    <form
      className="local-dashboard-filters workflow-run-search"
      onSubmit={(event) => {
        event.preventDefault();
        onOpen(normaliseRunId(draft));
      }}
    >
      <label htmlFor={`${id}-run`} className="local-visually-hidden">Correlation id</label>
      <span className="workflow-run-search-field"><input
        id={`${id}-run`}
        type="text"
        value={draft}
        placeholder="Paste a correlation id to open that run"
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
      /></span>
      <button type="submit">Open run</button>
      {requested !== null && <button type="button" onClick={() => onOpen(null)}>Newest run</button>}
    </form>
  );
}

interface WorkflowRunProps {
  component: LocalPageDocument['components'][number];
  snapshots: readonly BoundProjectionSnapshot[];
  /** The run the address or the picker names; null shows the newest run. */
  requested: string | null;
  onOpen: (runId: string | null) => void;
}

/**
 * WF-1 to WF-3 (OMN-19987, OMN-21015 AC9, OMN-19920): one run, the one asked for or the newest, with its decision row,
 * its answer from correlation-trace.v1 and its steps from run-trace.v1. The loader read the steps for exactly the run named on their snapshot (runId), so this
 * shows that run or says why it cannot: it never falls back to another run, and steps answered for another run are
 * refused rather than shown under this run's id.
 */
export function WorkflowRun({ component, snapshots, requested, onOpen }: WorkflowRunProps) {
  const decisionsRead = snapshots.find((snapshot) => snapshot.topic === DELEGATION_DECISIONS_TOPIC);
  const decisionsBinding = (component.data_bindings ?? [])
    .findIndex((binding) => binding.projection_topic === DELEGATION_DECISIONS_TOPIC);
  const decisions = decisionsBinding < 0 ? [] : asRecords(rowsForLocalBinding(component, snapshots, decisionsBinding));
  const stepsRead = snapshots.find((snapshot) => snapshot.topic === RUN_TRACE_TOPIC);
  const runId = stepsRead?.runId ?? null;
  // The decisions exposure gates nothing here (a pasted id needs no decision row), so its not-served state is named.
  const decisionsNotServed = decisionsRead?.failure?.kind === 'not-served' && !decisionsRead.lastGoodAt
    ? <EmptyState>{plainFailureMessage(decisionsRead.failure, { topic: decisionsRead.topic })}</EmptyState>
    : null;
  if (runId === null) {
    return (
      <>
        <RunPicker key={requested ?? ''} requested={requested} onOpen={onOpen} />
        {decisionsNotServed}
        {/* A failed decisions read is named by the panel's read state; it is not an empty store. */}
        {decisionsRead?.failure ? null
          : decisions.length === 0 ? <NoRunsYet />
          : <EmptyState>The newest run has no correlation id recorded</EmptyState>}
      </>
    );
  }
  const rows = asRecords(stepsRead?.rows ?? []);
  // A failed or unserved steps read with no last good rows is named by the panel's read state, never as "no steps".
  const stepsUnread = Boolean(stepsRead?.failure) && !stepsRead?.lastGoodAt;
  const foreign = rows.some((row) => row.correlation_id !== runId);
  return (
    <div>
      <RunPicker key={requested ?? ''} requested={requested} onOpen={onOpen} />
      <p className="local-dashboard-subtitle local-run-title">
        Run <code>{runId}</code>
        {requested === null && <span className="local-run-tag">newest run</span>}
        <CopyButton text={runId} label="Copy the run id" />
        <RunNeighbours decisions={decisions} runId={runId} />
      </p>
      {decisionsNotServed}
      {!foreign && rows.length === 0 && (() => {
        const decision = decisions.find(row => row.correlation_id === runId);
        return decision ? <WorkflowRoutingFlow decision={decision} outcome={statusOf(decision)} /> : null;
      })()}
      {!decisionsNotServed && <RunSummary decision={decisions.find((row) => row.correlation_id === runId)} showAnalysis />}
      {stepsUnread ? null : foreign ? (
        <p className="local-dashboard-error" role="alert">run-trace.v1 answered steps of another run; none are shown</p>
      ) : null}
      {/* OMN-19920: the run's answer, read for this run only; the page binds it only where its contract declares it.
          Part 18 AC125: the row of step boxes is gone (the timeline below shows the same steps, with time and detail). */}
      {/* The answer card only when the timeline cannot carry the prompt and answer (its steps unread or another run's). */}
      {(component.data_bindings ?? []).some((binding) => binding.projection_topic === CORRELATION_TRACE_TOPIC) && (stepsUnread || foreign) && (
        <RunAnswer read={snapshots.find((snapshot) => snapshot.topic === CORRELATION_TRACE_TOPIC)} runId={runId} />
      )}
      {stepsUnread || foreign ? null : (
        <>
          {/* A titled card as every other part of the run (Lakshman 2026-11-05). */}
          <section className="local-run-timeline workflow-analysis-card workflow-run-timeline-card" aria-label="Run timeline">
            <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><ConceptIcon concept="stage-timing" label="Run timeline" size={16} />Run timeline</h3>
            <RunTimeline steps={rows} run={decisions.find((row) => row.correlation_id === runId)}
              stepText={(component.data_bindings ?? []).some((binding) => binding.projection_topic === CORRELATION_TRACE_TOPIC) ? {
                prompt: <RunTraceText kind="prompt" read={snapshots.find((snapshot) => snapshot.topic === CORRELATION_TRACE_TOPIC)} runId={runId} />,
                answer: <RunTraceText kind="answer" read={snapshots.find((snapshot) => snapshot.topic === CORRELATION_TRACE_TOPIC)} runId={runId} />,
              } : undefined} />
          </section>
          {stepsRead?.truncated && (
            <EmptyState>
              {`Not the whole run: run-trace.v1 answered a truncated page of ${formatDashboardCount(rows.length)} steps`}
            </EmptyState>
          )}
        </>
      )}
      {/* Lakshman 2026-11-05 ("remove duplicates" on Workflow): the token and score comparisons repeated the Tokens and Run
          outcome fields above, and the stage chart repeated the Run timeline's step durations (their own comments said so),
          so they are gone; the recorded fields, shown nowhere else, stay. */}
      <div className="local-more local-more--open" data-section="Recorded run details">
        <WorkflowRecordDetails decision={decisions.find((row) => row.correlation_id === runId)} steps={[]} />
      </div>
    </div>
  );
}

/** AK-1: the tenant id from a served row. Part 18 AC130: no exposure serves when the identity was minted, so that row is
 * not drawn (it could only ever read Not recorded). */
export function LocalIdentity({ row }: { row: Record<string, unknown> | null }) {
  return (
    <FactList>
      <Fact term={<><FieldIcon label="Tenant" />Tenant</>} data-field-tone={fieldTone('Tenant')} data-field-unavailable={isUnavailableField(row?.tenant_id)} valueClassName="local-identity-value"><span>{recorded(row?.tenant_id)}</span>{typeof row?.tenant_id === 'string' && row.tenant_id.trim() !== '' && <CopyButton text={row.tenant_id} label="Copy the tenant identity" />}</Fact>
    </FactList>
  );
}
