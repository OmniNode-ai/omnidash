import { describe, expect, it } from 'vitest';
import { acknowledgedWorkflowId, canonicalJson, completedReplay, hasTerminalHttpSuccess, isCorrelationNotFound, latestReadFacts, ProofFailure, safeDiagnostic, sameReplay } from './prove-sim-preflight-bounded-graph-read.js';

const correlationId = '6d36e5be-8e86-4f06-a472-9da05c1f4c87';
const workflowId = '713c5958-e08d-475d-a1f4-a0f44be06a7b';
const terminal = {
  workflow_id: workflowId, workflow_type: 'delegation-execution-graph-read', status: 'completed', refusal: null,
  result: { replay: {
    correlation_id: correlationId, nodes: [{ id: 'n1' }], edges: [],
    source_cursors: [{ topic: 'onex.evt.example.v1', partition: 0, max_ingest_watermark: 9 }],
  } },
};

describe('bounded graph proof guards', () => {
  it('accepts only a completed, correlation-bound replay with valid bounded cursors', () => {
    expect(acknowledgedWorkflowId({ workflow_id: workflowId, correlation_id: correlationId }, correlationId)).toBe(workflowId);
    expect(completedReplay(terminal, correlationId, workflowId)?.replay.source_cursors).toEqual(terminal.result.replay.source_cursors);
    expect(completedReplay({ ...terminal, status: 'failed' }, correlationId, workflowId)).toBeNull();
    expect(completedReplay({ ...terminal, workflow_id: correlationId }, correlationId, workflowId)).toBeNull();
    expect(completedReplay({ ...terminal, correlation_id: workflowId }, correlationId, workflowId)?.replay.correlation_id).toBe(correlationId);
    expect(completedReplay({ ...terminal, result: { replay: { ...terminal.result.replay, source_cursors: [] } } }, correlationId, workflowId)).toBeNull();
    expect(completedReplay({ ...terminal, result: { replay: { ...terminal.result.replay, source_cursors: [terminal.result.replay.source_cursors[0], terminal.result.replay.source_cursors[0]] } } }, correlationId, workflowId)).toBeNull();
  });

  it('compares replay values canonically rather than accepting object identity', () => {
    expect(canonicalJson({ b: 2, a: [true, null] })).toBe(canonicalJson({ a: [true, null], b: 2 }));
    expect(canonicalJson({ nodes: 5, edges: 4 })).not.toBe(canonicalJson({ nodes: 4, edges: 5 }));
    const replay = completedReplay(terminal, correlationId, workflowId)!.replay;
    expect(sameReplay(replay, { ...replay, fold_version: { major: 1, minor: 0, patch: 0 } })).toBe(false);
  });

  it('requires the typed not-found refusal for an unknown correlation', () => {
    expect(isCorrelationNotFound({ workflow_id: workflowId, workflow_type: 'delegation-execution-graph-read', status: 'failed', result: null, refusal: { code: 'not_found' } }, workflowId)).toBe(true);
    expect(isCorrelationNotFound({ workflow_id: workflowId, workflow_type: 'delegation-execution-graph-read', status: 'failed', result: null, refusal: { code: 'ownership_denied' } }, workflowId)).toBe(false);
  });

  it('emits only fixed diagnostic fields', () => {
    expect(safeDiagnostic(new Error('pkce_missing'))).toEqual({ stage: 'inputs', refusal: 'pkce_missing' });
    expect(safeDiagnostic(new Error('sensitive upstream detail'))).toEqual({ stage: 'inputs', refusal: 'proof_refused' });
  });

  it('reports only safe latest-read shape facts when graph validation fails', () => {
    const facts = latestReadFacts({
      acknowledgement: { workflow_id: workflowId, correlation_id: correlationId }, submitStatus: 202, resultStatus: 200,
      terminal: { ...terminal, result: { replay: { ...terminal.result.replay, nodes: [{}, {}], edges: [{}] } } },
    }, correlationId);
    expect(facts).toEqual({
      acknowledgement_valid: true, submit_status: 202, result_status: 200, terminal_status: 'completed', refusal_code: 'none',
      binding_valid: true, graph_nodes: 2, graph_edges: 1,
    });
    expect(safeDiagnostic(new ProofFailure('latest_read', new Error('latest_graph_invalid'), facts))).toEqual({
      stage: 'latest_read', refusal: 'latest_graph_invalid', latest_read: facts,
    });
    expect(latestReadFacts({ acknowledgement: null, terminal: null, submitStatus: 503, resultStatus: null }, correlationId)).toEqual({
      acknowledgement_valid: false, submit_status: 503, result_status: null, terminal_status: 'none', refusal_code: 'none',
      binding_valid: false, graph_nodes: null, graph_edges: null,
    });
    expect(hasTerminalHttpSuccess({ acknowledgement: {}, terminal: {}, submitStatus: 202, resultStatus: 200 })).toBe(true);
    expect(hasTerminalHttpSuccess({ acknowledgement: {}, terminal: {}, submitStatus: 202, resultStatus: 409 })).toBe(false);
  });
});
