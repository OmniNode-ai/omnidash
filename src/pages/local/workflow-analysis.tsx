import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Award, Bot, Coins, FileClock, FileText, Server, Timer, Waypoints } from 'lucide-react';
import { RunTimingChart } from './charts';
import { FieldIcon } from '@/components/dashboard/FieldIcon';
import { fieldTone, isUnavailableField } from '@/components/dashboard/field-identity';

type Run = Record<string, unknown>;
const recorded = (value: unknown) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
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
  const Icon = kind === 'tokens' ? Coins : Award;
  const measurements = values.map(item => measured(item.value)).filter((value): value is number => value !== null);
  const maximum = Math.max(1, ...measurements);
  return <figure className={`local-chart workflow-analysis-card workflow-analysis-card--${kind}`} aria-label={title}>
    <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><Icon size={16} aria-hidden="true" />{title}</h3>
    <div className="workflow-comparison-bars">
      {values.map((item, index) => {
        const value = measured(item.value);
        return <button type="button" key={item.label} aria-pressed={selected === index}
          onClick={() => setSelected(index)} className="workflow-comparison-row" data-field-tone={fieldTone(item.label)} data-field-unavailable={value === null}
          style={{ '--bar-width': `${value === null ? 0 : value / maximum * 100}%` } as CSSProperties}>
          <span className="workflow-comparison-track" aria-hidden="true"><span /></span>
          <span>{item.label}</span><strong>{value === null ? 'Not recorded' : recorded(item.value)}</strong>
        </button>;
      })}
    </div>
    {selected !== null && <p className="local-dashboard-caption" role="status">{values[selected]!.label}: {recorded(values[selected]!.value)}</p>}
    <figcaption>{kind === 'tokens' ? 'Recorded input and output tokens.' : 'Score and threshold as served; verdict above.'}</figcaption>
  </figure>;
}

export function WorkflowDecisionCharts({ decision, children }: { decision: Run; children: ReactNode }) {
  return <div className="workflow-analysis-grid">
    <div className="workflow-analysis-card workflow-analysis-card--timing">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><Timer size={16} aria-hidden="true" />Run timing</h3>
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

export function WorkflowRecordDetails({ decision, steps }: { decision: Run | undefined; steps: Run[] }) {
  const id = useId();
  const durations = steps.map((step, index) => ({ key: `stage-${index}`, label: recorded(step.step_kind).replaceAll('_', ' '), value: step.duration_ms }));
  return <div className="workflow-record-grid">
    {decision && <section className="workflow-analysis-card workflow-analysis-card--record" aria-labelledby={id}>
      <h3 id={id} className="local-dashboard-caption" data-page-heading tabIndex={-1}><FileClock size={16} aria-hidden="true" />Recorded run details</h3>
      <dl className="local-dashboard-fields">
        {[
          ['Created at', decision.created_at], ['Written at', decision.written_at],
          ['Recorded cost (USD)', decision.cost_usd], ['Data source', decision.data_source],
          ['Terminal OK', decision.terminal_ok], ['Session', decision.session_id],
          ...[
            ['Tokens to compliance', decision.tokens_to_compliance],
            ['Routed model', decision.routed_model], ['Answering backend', decision.answering_backend],
            ['Score source', decision.score_source], ['Recorded by', decision.writer_identity],
          ].filter(([, value]) => value !== null && value !== undefined && value !== ''),
        ].map(([label, value]) => <div key={String(label)} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}><dt><FieldIcon label={label} value={value} />{String(label)}</dt><dd>{(label === 'Created at' || label === 'Written at') && typeof value === 'string' && Number.isFinite(Date.parse(value))
          ? <time dateTime={value} title={value}>{new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC</time>
          : recorded(value)}</dd></div>)}
      </dl>
    </section>}
    {durations.some(item => measured(item.value) !== null) && <section className="workflow-analysis-card workflow-analysis-card--stages" aria-label="Stage timing analysis">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><Timer size={16} aria-hidden="true" />Execution stage durations</h3>
      <RunTimingChart timings={durations} title="Execution stage durations" accentToken="--workflow-stages-accent" />
    </section>}
  </div>;
}

export function FlowConnector() {
  return <span className="workflow-flow-connector" aria-hidden="true"><span className="workflow-flow-particle" /></span>;
}

/** A relationship visual from decision fields, explicitly separate from an
 * execution trace. It never invents a stage, duration, or live progress. */
export function WorkflowRoutingFlow({ decision, outcome }: { decision: Run; outcome: string }) {
  return <section aria-label="Recorded routing flow">
    <figure className="local-chart workflow-routing-flow">
      <h3 className="local-dashboard-caption" data-page-heading tabIndex={-1}><Waypoints size={16} aria-hidden="true" />Recorded routing flow</h3>
      <div className="workflow-routing-nodes">
        {[
          { label: 'Task', value: decision.task_type, Icon: FileText },
          { label: 'Backend', value: decision.backend_id, Icon: Server },
          { label: 'Model', value: decision.model_name, Icon: Bot },
          { label: 'Outcome', value: outcome, Icon: Award },
        ].map(({ label, value, Icon }, index) => <div className="workflow-flow-node" key={label} data-flow-kind={label.toLowerCase()} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span><strong>{recorded(value)}</strong>
          {index < 3 && <FlowConnector />}
        </div>)}
      </div>
      <figcaption>Recorded decision fields; motion illustrates their relationship. Execution stages are shown only when a trace is served.</figcaption>
    </figure>
  </section>;
}
