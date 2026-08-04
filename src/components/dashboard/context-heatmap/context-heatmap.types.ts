export interface ContextHeatmapConfig {
  maxRows?: number;
}

/** Aggregated cell for one segment×model combination. */
export interface HeatmapCell {
  segmentId: string;
  modelId: string;
  passCount: number;
  totalCount: number;
  totalTokens: number;
  /** pass rate 0–1 */
  passRate: number;
  /** net effect: positive = tokens saved vs baseline, negative = more tokens */
  tokenDelta: number | null;
}

/** A known context segment with its display name and description. */
export interface ContextSegment {
  id: string;
  label: string;
  description: string;
}

export type HeatmapSignal = 'helpful' | 'harmful' | 'neutral' | 'unknown';

export function classifyCell(cell: HeatmapCell): HeatmapSignal {
  if (cell.totalCount === 0) return 'unknown';
  if (cell.passRate >= 0.75) return 'helpful';
  if (cell.passRate <= 0.25) return 'harmful';
  return 'neutral';
}
