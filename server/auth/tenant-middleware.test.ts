// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { JWTPayload } from 'jose';
import type { AuthConfig } from '../data-source-contract.js';
import { createTenantMiddleware } from './tenant-middleware.js';
import { getActiveTenantId, getTenantContext } from './tenant-context.js';

const requiredConfig: AuthConfig = {
  tenantMode: 'required',
  issuerUrl: 'https://auth.example.test/realms/omninode',
  audience: '',
  tenantClaim: 'tenant_id',
};

function buildApp(config: AuthConfig, verifier?: (token: string) => Promise<JWTPayload>) {
  const app = express();
  app.use(createTenantMiddleware({ config, verifier }));
  app.get('/whoami', (_req, res) => {
    res.json({ tenantId: getActiveTenantId(), subject: getTenantContext()?.subject ?? null });
  });
  return app;
}

describe('createTenantMiddleware — disabled mode', () => {
  it('passes through with no tenant context', async () => {
    const app = buildApp({ ...requiredConfig, tenantMode: 'disabled' });
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenantId: null, subject: null });
  });
});

describe('createTenantMiddleware — required mode', () => {
  it('rejects requests without a bearer token with 401', async () => {
    const verifier = vi.fn();
    const app = buildApp(requiredConfig, verifier);
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing bearer token/);
    expect(verifier).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer token with 401', async () => {
    const app = buildApp(requiredConfig, vi.fn());
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('rejects a token the verifier refuses with 401 and no detail leak', async () => {
    const verifier = vi.fn().mockRejectedValue(new Error('signature verification failed'));
    const app = buildApp(requiredConfig, verifier);
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid bearer token');
    expect(JSON.stringify(res.body)).not.toContain('signature');
  });

  it('rejects a verified token without the tenant claim with 403 (fail closed)', async () => {
    const verifier = vi.fn().mockResolvedValue({ sub: 'user-1' });
    const app = buildApp(requiredConfig, verifier);
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/tenant claim 'tenant_id'/);
  });

  it('threads the verified tenant into the request context', async () => {
    const verifier = vi.fn().mockResolvedValue({ sub: 'user-1', tenant_id: 'tenant-a' });
    const app = buildApp(requiredConfig, verifier);
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenantId: 'tenant-a', subject: 'user-1' });
    expect(verifier).toHaveBeenCalledWith('ok');
  });

  it('honors a configurable tenant claim name', async () => {
    const verifier = vi.fn().mockResolvedValue({ org_id: 'org-9' });
    const app = buildApp({ ...requiredConfig, tenantClaim: 'org_id' }, verifier);
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('org-9');
  });

  it('lets CORS preflight OPTIONS through without a token', async () => {
    const app = buildApp(requiredConfig, vi.fn());
    const res = await request(app).options('/whoami');
    expect(res.status).not.toBe(401);
  });
});
