// OMN-24615 AC8: the one run duration every page shows, as the backend's metering summary serves it
// (summary_json.run_duration): execution_ms, the time the handler spent on the run from pickup to its terminal event.
// latency_ms is the model call, shown only on the run detail as Model call time.
export const RUN_DURATION = {
  column: 'execution_ms',
  label: 'Duration',
  definition: 'Milliseconds the handler spent on the run, from pickup to its terminal event. Absent means not measured.',
} as const;

export const MODEL_CALL_TIME_LABEL = 'Model call time';

/** The run's served duration, read from the one column the backend names. */
export function runDurationOf(run: Readonly<Record<string, unknown>> | null | undefined): unknown {
  return run?.[RUN_DURATION.column];
}
