import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { JWTPayload } from 'jose';
import { createWorkflowReadRouter } from '../workflow-read-router.js';
import type { WorkflowReadConfig } from '../data-source-contract.js';

const TENANT_ID = '01234567-89ab-4cde-8f01-23456789abcd';
const PRINCIPAL = 't-0123456789ab4cde8f0123456789abcd';
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
    workflow_id: 'workflow-1', correlation_id: 'correlation-1', envelope_id: 'envelope-1',
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
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards only the session user token and fixed contract workflow, not browser Authorization', async () => {
    const { app, fetchImpl } = appFor(claims);
    const response = await request(app).post('/api/workflow-reads')
      .set('Authorization', 'Bearer browser-attacker-token')
      .send({ payload: { cursor_mode: 'latest' }, correlation_id: 'correlation-1' });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ workflow_id: 'workflow-1', correlation_id: 'correlation-1' });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe('https://gateway.example.test/v1/workflows');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer server-held-token' });
    expect(JSON.parse(init?.body as string)).toEqual({
      workflow_type: 'delegation-execution-graph-read',
      payload: { cursor_mode: 'latest' },
      correlation_id: 'correlation-1',
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
});
