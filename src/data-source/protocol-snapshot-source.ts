/** `idle` is the API's word for a fresh cache whose source has simply gone quiet. */
export type ProjectionDataFreshness = 'fresh' | 'idle' | 'stale' | 'degraded' | 'unknown';

export interface ProjectionSnapshot<T = unknown> {
  rows: T[];
  rowCount: number;
  dataFreshness: ProjectionDataFreshness;
  latestEventAt: string | null;
  readAt: string;
}

export interface ProtocolSnapshotSource {
  readAll(topic: string): AsyncIterable<unknown>;
  readSnapshot?(
    topic: string,
    params?: Readonly<Record<string, string>>,
  ): Promise<ProjectionSnapshot>;
  onChange?(topic: string, callback: () => void): () => void;
}
