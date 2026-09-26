/** Frontend wire shape for the core-owned ModelExecutionGraph response. */
export interface ModelSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (string | number)[] | null;
  build: readonly string[] | null;
}

export interface ModelExecutionGraphSourceRef {
  topic: string;
  partition: number;
  kafka_offset: number;
  ingest_epoch: 1 | null;
  ingest_seq: number | null;
}

export interface ModelExecutionGraphNode {
  id: string;
  kind: 'hop' | 'reroute_evidence';
  topic: string;
  partition: number;
  kafka_offset: number;
  parent_envelope_id: string | null;
  replay_green: boolean | null;
  verifier_verdict: string | null;
  source_ref: ModelExecutionGraphSourceRef;
}

export interface ModelExecutionGraphEndpoint {
  kind: 'node' | 'verdict' | 'session_anchor';
  node_id: string | null;
  verdict_id: string | null;
  session_id: string | null;
}

export interface ModelExecutionGraphEdge {
  id: string;
  from_id: ModelExecutionGraphEndpoint;
  to_id: ModelExecutionGraphEndpoint;
  kind: 'caused' | 'rerouted' | 'verified' | 'anchored';
  evidence_ref: ModelExecutionGraphSourceRef;
}

export interface ModelExecutionGraphVerdict {
  id: string;
  delegation_correlation_id: string;
  status: 'pending' | 'verified' | 'failed' | 'skipped' | 'unresolved';
  outcome: 'done' | 'refused';
  outcome_refusal: string | null;
  source_ref: ModelExecutionGraphSourceRef;
}

export interface ModelExecutionGraphReplayPolicy {
  traversal: 'parent_topological';
  tie_break: readonly [
    'declared_hop_position',
    'topic_partition_kafka_offset',
    'envelope_id',
  ];
  node_identity: 'envelope_id';
  redelivery: 'same_id_exact_redelivery_lowest_source_position';
  conflicting_identity: 'same_id_conflicting_parent_or_semantic_body_refuse';
  cross_topic_duplicate: 'same_id_across_topics_refuse';
}

export interface ModelExecutionGraphSourceCursor {
  topic: string;
  partition: number;
  ingest_epoch: 1;
  max_ingest_seq: number;
}

export interface ModelExecutionGraphAnchor {
  kind: 'session' | 'none';
  session_id: string | null;
  evidence_ref: ModelExecutionGraphSourceRef | null;
  state: 'resolved' | 'unresolved';
}

export interface ModelExecutionGraphUnresolved {
  subject_id: string;
  reason: 'missing_parent' | 'parent_outside_cursor' | 'missing_anchor' | 'missing_verdict';
  source_ref: ModelExecutionGraphSourceRef;
}

export interface ModelExecutionGraphStoredGrade {
  node_id: string;
  hop_index: number;
  replay_green: boolean | null;
  verifier_verdict: string | null;
}

export interface ModelExecutionGraphStoredVerdict {
  ticket_id: string;
  correlation_id: string;
  completed_at: string;
  status: string;
  outcome: string;
  projection_cursor: number;
}

export interface ModelExecutionGraphReplay {
  fold_version: ModelSemVer;
  topology_version: { contract_version: ModelSemVer; topology_sha256: string };
  grader_version: ModelSemVer;
  verdict_reducer_version: ModelSemVer;
  policy: ModelExecutionGraphReplayPolicy;
  source_cursors: readonly ModelExecutionGraphSourceCursor[];
  correlation_id: string;
  anchor: ModelExecutionGraphAnchor;
  nodes: readonly ModelExecutionGraphNode[];
  edges: readonly ModelExecutionGraphEdge[];
  order: readonly string[];
  verdicts: readonly ModelExecutionGraphVerdict[];
  unresolved: readonly ModelExecutionGraphUnresolved[];
  withheld_count: number;
  refusal:
    | 'correlation_not_found'
    | 'correlation_ambiguous'
    | 'multiple_chain_heads'
    | 'envelope_id_collision'
    | 'parent_cycle'
    | 'unsupported_version'
    | 'invalid_evidence'
    | null;
}

export interface ModelExecutionGraph {
  schema_version: 1;
  replay: ModelExecutionGraphReplay;
  labels: readonly {
    node_id: string;
    event_timestamp: string | null;
    ledger_written_at: string | null;
  }[];
  annotations: {
    read_at: string;
    authorization_tenant_id: string;
    authorization_ownership_source: 'delegation_events';
    authorization_checked_over: 'full_correlation';
    stored_chain: readonly ModelExecutionGraphStoredGrade[];
    stored_verdicts: readonly ModelExecutionGraphStoredVerdict[];
  };
}

export function endpointNodeId(endpoint: ModelExecutionGraphEndpoint): string | null {
  return endpoint.kind === 'node' ? endpoint.node_id : null;
}

export function replayLabel(node: ModelExecutionGraphNode): string {
  if (node.replay_green === true) return 'Replay passed';
  if (node.replay_green === false) return 'Replay failed';
  return node.kind === 'reroute_evidence' ? 'Evidence only' : 'Replay unknown';
}
