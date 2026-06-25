export type EvalContextMode = 'baseline' | 'chunk' | 'full-claude-md';

/** One aggregated eval result: a (model, task, context_mode) cell averaged over its runs.
 *
 * pass_rate is nullable — the projection stores NULL when no pass/fail data is available
 * for a cell (honest absent-data sentinel, never a fake 0). The panel renders an em-dash
 * for null cells. (OMN-12998)
 */
export interface EvalResult {
  model: string;
  task: string;
  context_mode: EvalContextMode;
  /** mean pass rate 0–1 across `runs`; null when absent (render em-dash, not 0%) */
  pass_rate: number | null;
  /** mean output tokens across `runs` */
  output_tokens: number;
  runs: number;
}

export interface InstructionEvalConfig {
  maxRows?: number;
}

/** Context modes rendered as the three columns within each task group. */
export const CONTEXT_MODES: readonly EvalContextMode[] = ['baseline', 'chunk', 'full-claude-md'] as const;

export const CONTEXT_MODE_LABELS: Record<EvalContextMode, string> = {
  baseline: 'Baseline',
  chunk: 'Chunk',
  'full-claude-md': 'Full CLAUDE.md',
};

export type EvalSignal = 'helpful' | 'neutral' | 'harmful' | 'unknown';

/** Map a pass rate to a coarse red/yellow/green signal. */
export function classifyPassRate(passRate: number | null): EvalSignal {
  if (passRate == null) return 'unknown';
  if (passRate >= 0.75) return 'helpful';
  if (passRate <= 0.25) return 'harmful';
  return 'neutral';
}
