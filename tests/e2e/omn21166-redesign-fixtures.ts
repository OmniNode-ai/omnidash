import { chartRows, prefix } from './omn21166-chart-fixtures';

// OMN-21166 part 29 (revision 6) journey fixtures, built on the shared chart fixture without changing it.
// The shared fixture serves day windows only; Usage's headline cards need the all-time metering row, which also gives
// Overview's money cards their full basis (pricing version, runs not counted).
const METERING = prefix + 'metering-summary.v1';
export const withAllTime = { ...chartRows, [METERING]: [...(chartRows[METERING] as object[]), {
  tenant_id: 'chart-fixture-tenant', window_kind: 'all', window_start: '', as_of: '2026-10-17T10:00:00Z', baseline_model: 'baseline-a',
  baseline_state: 'resolved', pricing_manifest_version: '1.0.0', spend_usd: '0.010000', counterfactual_usd: '0.090000', savings_usd: '0.040000',
  runs_total: 3, runs_measured: 2, runs_unknown_tokens: 1, runs_unknown_spend: 0, tokens_in: 252, tokens_out: 72 }] };

// AC194 to AC196: six served decisions over three UTC days (Oct 15 to 17) with every edge the analysis must keep apart:
// a measured $0 cost (model-b), a missing cost, a missing verdict, a missing latency and a run with no recorded model.
// Expected by hand: model-a 3 runs, $0.006 over 2 measured, pass 2 of 3, p50 300 ms, p95 500 ms (nearest rank);
// model-b 2 runs, $0.00 over 2 measured, pass 1 of 1, latency 200 ms; Not recorded 1 run, cost not measured, pass 0 of 1.
// All six: pass 3 of 5, p95 500 ms. Sparkline days Oct 4 to Oct 14 fall before the coverage and read not covered.
const DECISIONS = prefix + 'delegation.decisions.v1';
const decision = (id: string, at: string, model: string | null, cost: string | null, savings: string | null, passed: boolean | null, latency: number | null) => ({
  correlation_id: id, created_at: at, written_at: at, model_name: model, cost_usd: cost, modelled_savings_usd: savings,
  quality_gate_passed: passed, latency_ms: latency, tokens_input: 100, tokens_output: 20, backend_id: model === null ? null : 'local',
  task_type: 'summarization', cost_tier_name: 'local', savings_baseline_model: 'baseline-a', savings_pricing_manifest_version: '1.0.0', data_source: 'fixture',
});
export const analysisDecisions = [
  decision('an-1', '2026-10-17T10:00:00Z', 'model-a', '0.002000', '0.010000', true, 100),
  decision('an-2', '2026-10-16T10:00:00Z', 'model-a', '0.004000', '0.020000', true, 300),
  decision('an-3', '2026-10-15T10:00:00Z', 'model-a', null, null, false, 500),
  decision('an-4', '2026-10-17T09:00:00Z', 'model-b', '0.000000', '0.000000', true, 200),
  decision('an-5', '2026-10-16T09:00:00Z', 'model-b', '0.000000', '0.000000', null, null),
  decision('an-6', '2026-10-15T09:00:00Z', null, null, null, false, 50),
];
export const withAnalysis = { ...withAllTime, [DECISIONS]: analysisDecisions };

// AC197: run an-1's steps on one time axis, 730 ms from the request's start to the second attempt's end. The quality
// gate has no duration and the terminal step no start, so neither may be drawn as a bar.
const RUN_TRACE = prefix + 'run-trace.v1';
const step = (sequence: number, kind: string, start: string | null, duration: number | null, extra: Record<string, unknown> = {}) => ({
  correlation_id: 'an-1', step_sequence: sequence, step_kind: kind, outcome: 'succeeded', started_at: start, duration_ms: duration, ...extra,
});
export const traceSteps = [
  step(1, 'request', '2026-10-17T10:00:00.000Z', 10),
  step(2, 'routing_decision', '2026-10-17T10:00:00.010Z', 20, { reason: 'fixture route', candidates: ['local'], confidence: 0.9 }),
  step(3, 'provider_call', '2026-10-17T10:00:00.030Z', 400, { attempt_number: 1, outcome: 'failed' }),
  step(4, 'provider_call', '2026-10-17T10:00:00.430Z', 300, { attempt_number: 2 }),
  step(5, 'quality_gate', '2026-10-17T10:00:00.730Z', null),
  step(6, 'terminal', null, 0),
];
export const withTrace = { ...withAnalysis, [RUN_TRACE]: traceSteps };

// OMN-21166 part 30 (revision 7) AC202 to AC206: ten served decisions over Oct 14 to 17 with the edges the decision views
// must keep apart. Expected by hand (pass rate over runs with a verdict):
//   model-a x summarization 6 runs, 5 of 6 passed (83.3%), not a small sample;
//   model-a x code_generation 2 runs, 1 of 2 (50.0%), a small sample (fewer than 5 verdicts);
//   model-b x summarization 1 run with no verdict; model-b x code_generation no runs;
//   no recorded model (and no tier, requested model or backend) x summarization 1 run, 0 of 1.
//   Days: Oct 4 to 13 not covered, Oct 14 runs but no verdicts, Oct 15 1 of 3 (33.3%), Oct 16 3 of 3, Oct 17 2 of 3.
//   Routing: one run asked for model-big, ran on model-a, stopped at the output limit after 2 escalations.
const rev7 = (id: string, at: string, model: string | null, task: string, passed: boolean | null, extra: Record<string, unknown> = {}) => ({
  correlation_id: id, created_at: at, written_at: at, model_name: model, requested_model: model, task_type: task,
  cost_tier_name: model === null ? null : 'local', backend_id: model === null ? null : 'local', finish_reason: 'stop', escalation_count: 0,
  quality_gate_passed: passed, latency_ms: 200, cost_usd: model === null ? null : '0.000000', tokens_input: 100, tokens_output: 20, data_source: 'fixture',
  ...extra,
});
export const rev7Decisions = [
  rev7('r7-1', '2026-10-15T08:00:00Z', 'model-a', 'summarization', true),
  rev7('r7-2', '2026-10-15T09:00:00Z', 'model-a', 'summarization', false, { latency_ms: 900 }),
  rev7('r7-3', '2026-10-16T08:00:00Z', 'model-a', 'summarization', true),
  rev7('r7-4', '2026-10-16T09:00:00Z', 'model-a', 'summarization', true),
  rev7('r7-5', '2026-10-17T08:00:00Z', 'model-a', 'summarization', true),
  rev7('r7-6', '2026-10-17T09:00:00Z', 'model-a', 'summarization', true),
  rev7('r7-7', '2026-10-16T10:00:00Z', 'model-a', 'code_generation', true),
  rev7('r7-8', '2026-10-17T10:00:00Z', 'model-a', 'code_generation', false, { requested_model: 'model-big', finish_reason: 'length', escalation_count: 2 }),
  rev7('r7-9', '2026-10-14T10:00:00Z', 'model-b', 'summarization', null),
  rev7('r7-10', '2026-10-15T10:00:00Z', null, 'summarization', false),
];
export const withRev7 = { ...withAllTime, [DECISIONS]: rev7Decisions };
// AC204: seven models with one run each on Oct 17 and three runs with no recorded model: ranked by runs, Not recorded (3)
// is drawn first by name, then m1 to m4 (ties by name), and m5 to m7 are Other (Codex MSG 2793fa16).
export const withSevenModels = { ...withAllTime, [DECISIONS]: [
  ...['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].map((model, index) => rev7(`r7-m${index}`, '2026-10-17T08:00:00Z', model, 'summarization', true)),
  ...[0, 1, 2].map(index => rev7(`r7-nr${index}`, '2026-10-17T09:00:00Z', null, 'summarization', false)),
] };
