import type { ModelExecutionGraph } from '../render-model';

/** PROVISIONAL TEST INPUT ONLY. Replace with the real core-fold fixture before visual sign-off. */
export const provisionalExecutionGraph: ModelExecutionGraph = {
  schema_version: 1,
  replay: {
    fold_version: { major: 1, minor: 0, patch: 0, prerelease: null, build: null },
    topology_version: {
      contract_version: { major: 1, minor: 0, patch: 0, prerelease: null, build: null },
      topology_sha256: 'a'.repeat(64),
    },
    grader_version: { major: 1, minor: 0, patch: 0, prerelease: null, build: null },
    verdict_reducer_version: { major: 1, minor: 0, patch: 0, prerelease: null, build: null },
    policy: {
      traversal: 'parent_topological',
      tie_break: ['declared_hop_position', 'topic_partition_kafka_offset', 'envelope_id'],
      node_identity: 'envelope_id',
      redelivery: 'same_id_exact_redelivery_lowest_source_position',
      conflicting_identity: 'same_id_conflicting_parent_or_semantic_body_refuse',
      cross_topic_duplicate: 'same_id_across_topics_refuse',
    },
    source_cursors: [{ topic: 'onex.evt.sample.v1', partition: 0, ingest_epoch: 1, max_ingest_seq: 2 }],
    correlation_id: 'corr-provisional-001',
    anchor: { kind: 'session', session_id: 'session-provisional', evidence_ref: null, state: 'resolved' },
    nodes: [
      {
        id: 'env-root', kind: 'hop', topic: 'onex.evt.sample.root.v1', partition: 0, kafka_offset: 18,
        parent_envelope_id: null, replay_green: true, verifier_verdict: 'passed',
        source_ref: { topic: 'onex.evt.sample.root.v1', partition: 0, kafka_offset: 18, ingest_epoch: 1, ingest_seq: 1 },
      },
      {
        id: 'env-child', kind: 'hop', topic: 'onex.evt.sample.child.v1', partition: 0, kafka_offset: 42,
        parent_envelope_id: 'env-root', replay_green: null, verifier_verdict: null,
        source_ref: { topic: 'onex.evt.sample.child.v1', partition: 0, kafka_offset: 42, ingest_epoch: 1, ingest_seq: 2 },
      },
    ],
    edges: [{
      id: 'edge-root-child', kind: 'caused',
      from_id: { kind: 'node', node_id: 'env-root', verdict_id: null, session_id: null },
      to_id: { kind: 'node', node_id: 'env-child', verdict_id: null, session_id: null },
      evidence_ref: { topic: 'onex.evt.sample.child.v1', partition: 0, kafka_offset: 42, ingest_epoch: 1, ingest_seq: 2 },
    }],
    order: ['env-root', 'env-child'],
    verdicts: [],
    unresolved: [],
    withheld_count: 0,
    refusal: null,
  },
  labels: [
    { node_id: 'env-root', event_timestamp: '2026-09-26T12:00:00Z', ledger_written_at: '2026-09-26T12:00:01Z' },
    { node_id: 'env-child', event_timestamp: '2026-09-26T12:00:02Z', ledger_written_at: '2026-09-26T12:00:03Z' },
  ],
  annotations: {
    read_at: '2026-09-26T12:00:05Z',
    authorization_tenant_id: '00000000-0000-4000-8000-000000000001',
    authorization_ownership_source: 'delegation_events',
    authorization_checked_over: 'full_correlation',
    stored_chain: [{ node_id: 'env-root', hop_index: 0, replay_green: true, verifier_verdict: 'passed' }],
    stored_verdicts: [],
  },
};
