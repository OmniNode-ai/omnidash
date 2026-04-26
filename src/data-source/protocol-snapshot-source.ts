export interface ProtocolSnapshotSource {
  readAll(topic: string): AsyncIterable<unknown>;
  onChange?(topic: string, callback: () => void): () => void;
}
