import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { JWTPayload } from 'jose';
import { createWorkflowReadRouter } from '../workflow-read-router.js';
import type { WorkflowReadConfig } from '../data-source-contract.js';

const TENANT_ID = '01234567-89ab-4cde-8f01-23456789abcd';
const PRINCIPAL = 't-0123456789ab4cde8f0123456789abcd';
const WORKFLOW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CORRELATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONFIG: WorkflowReadConfig = {
  enabled: true,
  gatewayUrl: 'https://gateway.example.test',
  issuerUrl: 'https://issuer.example.test/realms/test',
  audience: 'onex-api',
  workflowType: 'delegation-execution-graph-read',
};

function appFor(
  claims: JWTPayload,
  fetchImpl: typeof fetch = vi.fn(async () => new Response(JSON.stringify({
    workflow_id: WORKFLOW_ID, correlation_id: CORRELATION_ID, envelope_id: 'envelope-1',
  }), { status: 202 })) as typeof fetch,
  session = true,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = { tenant_id: TENANT_ID, tenant_slug: 'acme', sub: 'user-1', roles: [] };
    if (session) {
      Object.defineProperty(req, 'session', { value: {
        'keycloak-token': JSON.stringify({ access_token: 'server-held-token' }),
      } });
    }
    next();
  });
  const verifyToken = vi.fn(async () => claims);
  app.use(createWorkflowReadRouter(CONFIG, { verifyToken, fetchImpl }));
  return { app, verifyToken, fetchImpl };
}

describe('workflow read BFF', () => {
  const claims = { tenant_id: TENANT_ID, tenant_slug: 'acme', sub: 'user-1' };

  it('is closed by default and never calls the gateway', async () => {
    const fetchImpl = vi.fn();
    const app = express();
    app.use(createWorkflowReadRouter({ ...CONFIG, enabled: false }, { fetchImpl }));
    const response = await request(app).post('/api/workflow-reads').send({ payload: {} });
    expect(response.status).toBe(503);
    expect((await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`)).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards only the session user token and fixed contract workflow, not browser Authorization', async () => {
    const { app, fetchImpl } = appFor(claims);
    const response = await request(app).post('/api/workflow-reads')
      .set('Authorization', 'Bearer browser-attacker-token')
      .send({ payload: { cursor_mode: 'latest' }, correlation_id: CORRELATION_ID });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ workflow_id: WORKFLOW_ID, correlation_id: CORRELATION_ID });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe('https://gateway.example.test/v1/workflows');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer server-held-token' });
    expect(JSON.parse(init?.body as string)).toEqual({
      workflow_type: 'delegation-execution-graph-read',
      payload: { cursor_mode: 'latest' },
      correlation_id: CORRELATION_ID,
    });
  });

  it('requires a server session even if the browser supplies a bearer token', async () => {
    const { app, fetchImpl } = appFor(claims, undefined, false);
    const response = await request(app).post('/api/workflow-reads')
      .set('Authorization', 'Bearer browser-token').send({ payload: {} });
    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...claims, tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, 'wrong tenant'],
    [{ ...claims, sub: 'another-user' }, 'wrong user'],
    [{ ...claims, principal_id: 't-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, 'forged principal'],
    [{ ...claims, tenant_id: 'not-a-uuid' }, 'invalid tenant'],
  ])('refuses %s (%s) without calling gateway', async (candidate, _reason) => {
    const { app, fetchImpl } = appFor(candidate);
    const response = await request(app).post('/api/workflow-reads').send({ payload: {} });
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a matching canonical principal claim without trusting it as authority', async () => {
    const { app } = appFor({ ...claims, principal_id: PRINCIPAL });
    const response = await request(app).post('/api/workflow-reads').send({ payload: { cursor_mode: 'latest' } });
    expect(response.status).toBe(202);
  });

  it('rejects caller-supplied tenant/topic fields outside the declared payload', async () => {
    const { app, fetchImpl } = appFor(claims);
    const response = await request(app).post('/api/workflow-reads')
      .send({ payload: {}, tenant_id: TENANT_ID, topic: 'other-topic' });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads a verified result through the same session user token', async () => {
    const graph = { schema_version: 1, replay: { correlation_id: CORRELATION_ID } };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      workflow_id: WORKFLOW_ID,
      workflow_type: CONFIG.workflowType,
      status: 'completed',
      result: graph,
      refusal: null,
    }), { status: 200 })) as typeof fetch;
    const { app } = appFor(claims, fetchImpl);
    const response = await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`)
      .set('Authorization', 'Bearer browser-attacker-token');
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual(graph);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe(
      `https://gateway.example.test/v1/workflows/${WORKFLOW_ID}/result`,
    );
    expect(vi.mocked(fetchImpl).mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer server-held-token' });
  });

  it('requires matching session identity for result reads', async () => {
    const { app, fetchImpl } = appFor({ ...claims, tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const response = await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`);
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires a session for result reads, regardless of browser bearer', async () => {
    const { app, fetchImpl } = appFor(claims, undefined, false);
    const response = await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`)
      .set('Authorization', 'Bearer browser-token');
    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an invalid result identifier before gateway access', async () => {
    const { app, fetchImpl } = appFor(claims);
    const response = await request(app).get('/api/workflow-reads/not-a-uuid/result');
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [409, 409, 'workflow_result_pending'],
    [404, 404, 'workflow_not_found'],
    [503, 503, 'workflow_gateway_refused'],
  ])('maps gateway %i to %i without leaking details', async (upstreamStatus, expectedStatus, error) => {
    const fetchImpl = vi.fn(async () => new Response('private upstream detail', { status: upstreamStatus })) as typeof fetch;
    const { app } = appFor(claims, fetchImpl);
    const response = await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`);
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toEqual({ error });
  });

  it('rejects a result bound to a different workflow or workflow type', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      workflow_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      workflow_type: CONFIG.workflowType,
      status: 'completed', result: {}, refusal: null,
    }), { status: 200 })) as typeof fetch;
    const { app } = appFor(claims, fetchImpl);
    const response = await request(app).get(`/api/workflow-reads/${WORKFLOW_ID}/result`);
    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'invalid_workflow_gateway_response' });
  });
});
