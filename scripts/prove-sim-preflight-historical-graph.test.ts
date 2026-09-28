import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acknowledgedWorkflowId, exactCountsMatch, graphCounts, hasRecordedEvidence, hasRequiredPkce, parseExpectedCount } from './prove-sim-preflight-historical-graph.js';

describe('historical graph proof response parser', () => {
  it('derives rendered node and edge counts only from an authorized graph response shape', () => {
    const correlationId = '6d36e5be-8e86-4f06-a472-9da05c1f4c87';
    const workflowId = '713c5958-e08d-475d-a1f4-a0f44be06a7b';
    const terminal = { workflow_id: workflowId, workflow_type: 'delegation-execution-graph-read', status: 'completed', refusal: null };
    expect(acknowledgedWorkflowId({ workflow_id: workflowId, correlation_id: correlationId }, correlationId)).toBe(workflowId);
    expect(acknowledgedWorkflowId({ workflow_id: workflowId, correlation_id: '4c15477b-cc2e-448a-ae1e-df716379dee2' }, correlationId)).toBeNull();
    expect(graphCounts({ ...terminal, result: { replay: { correlation_id: correlationId, nodes: [{}, {}], edges: [{}] } } }, correlationId, workflowId)).toEqual({ nodes: 2, edges: 1 });
    expect(graphCounts({ ...terminal, result: { replay: { correlation_id: correlationId, nodes: 'no', edges: [] } } }, correlationId, workflowId)).toBeNull();
    expect(graphCounts({ ...terminal, result: { replay: { correlation_id: '4c15477b-cc2e-448a-ae1e-df716379dee2', nodes: [{}], edges: [] } } }, correlationId, workflowId)).toBeNull();
    expect(graphCounts({ ...terminal, workflow_id: correlationId, result: { replay: { correlation_id: correlationId, nodes: [{}], edges: [] } } }, correlationId, workflowId)).toBeNull();
    expect(graphCounts({ ...terminal, status: 'failed', result: { replay: { correlation_id: correlationId, nodes: [{}], edges: [] } } }, correlationId, workflowId)).toBeNull();
    expect(graphCounts({ ...terminal, refusal: { code: 'refused' }, result: { replay: { correlation_id: correlationId, nodes: [{}], edges: [] } } }, correlationId, workflowId)).toBeNull();
  });

  it('refuses an empty graph rather than presenting it as a recorded-run proof', () => {
    expect(hasRecordedEvidence({ nodes: 0, edges: 0 })).toBe(false);
    expect(hasRecordedEvidence({ nodes: 5, edges: 4 })).toBe(true);
  });

  it('requires explicit exact expected counts for the approved chain', () => {
    expect(parseExpectedCount('5')).toBe(5);
    expect(parseExpectedCount('04')).toBeNull();
    expect(parseExpectedCount('-1')).toBeNull();
    expect(exactCountsMatch({ nodes: 5, edges: 4 }, { nodes: 5, edges: 4 })).toBe(true);
    expect(exactCountsMatch({ nodes: 0, edges: 0 }, { nodes: 5, edges: 4 })).toBe(false);
  });

  it('requires the pinned PKCE authorization contract before entering credentials', () => {
    const auth = new URL('http://auth.localhost:28080/realms/omninode/protocol/openid-connect/auth?client_id=omnidash&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&scope=openid+tenant&code_challenge_method=S256&code_challenge=challenge&state=state&nonce=nonce');
    expect(hasRequiredPkce(auth)).toBe(true);
    auth.searchParams.set('redirect_uri', 'http://attacker.invalid/callback');
    expect(hasRequiredPkce(auth)).toBe(false);
  });

  it('waits for graph and summary rendering before inspecting DOM proof counts', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/prove-sim-preflight-historical-graph.ts'), 'utf8');
    const readiness = source.indexOf('await Promise.all([summary.waitFor(), graph.waitFor()]);');
    const visibility = source.indexOf('await summary.isVisible()');
    const nodeCount = source.indexOf("graph.locator('.execution-graph-node').count()");
    expect(readiness).toBeGreaterThanOrEqual(0);
    expect(readiness).toBeLessThan(visibility);
    expect(readiness).toBeLessThan(nodeCount);
  });
});
