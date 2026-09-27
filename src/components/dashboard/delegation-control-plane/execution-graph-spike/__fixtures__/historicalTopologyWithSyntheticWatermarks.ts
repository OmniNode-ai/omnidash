import type { ModelExecutionGraph } from '../render-model';
import historicalGraphJson from './realFiveHopGraph.json';

/**
 * The historical five-hop capture predates writer-assigned watermarks. Keep its
 * Kafka offsets intact as source evidence, but model a separate one-row-per-
 * partition ledger for fixture-only rendering. These bounds are synthetic and
 * must never be presented as captured replay provenance.
 */
export const historicalTopologyWithSyntheticWatermarks = {
  ...historicalGraphJson,
  replay: {
    ...historicalGraphJson.replay,
    source_cursors: historicalGraphJson.replay.source_cursors.map(({ topic, partition }) => ({
      topic,
      partition,
      max_ingest_watermark: 1,
    })),
  },
} as unknown as ModelExecutionGraph;
