import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authMiddleware, requireAdmin } from '../auth-middleware.js';

// Mock jose so tests never make real HTTP calls to Keycloak.
vi.mock('jose', () => {
  return {
    createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
    jwtVerify: vi.fn(),
  };
});

import { jwtVerify } from 'jose';
const mockJwtVerify = vi.mocked(jwtVerify);

function buildApp(extraMiddleware?: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  if (extraMiddleware) app.use(extraMiddleware);
  app.get('/protected', (req, res) => {
    res.json({ tenant: req.tenant });
  });
  return app;
}

const validPayload = {
  sub: 'user-123',
  tenant_id: 'tenant-abc',
  tenant_slug: 'acme',
  realm_access: { roles: ['user'] },
  resource_access: { omnidash: { roles: ['viewer'] } },
  iss: 'https://auth.omninode.ai/realms/omninode',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
  process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
});

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 401 when token is invalid or expired', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('JWTExpired'));
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  it('returns 403 when token is valid but missing tenant_id', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { ...validPayload, tenant_id: undefined },
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/tenant_id/);
  });

  it('attaches req.tenant and calls next on a valid token', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: validPayload,
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.tenant).toMatchObject({
      tenant_id: 'tenant-abc',
      tenant_slug: 'acme',
      sub: 'user-123',
    });
  });

  it('merges realm_access and resource_access roles', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: validPayload,
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');
    expect(res.body.tenant.roles).toContain('user');
    expect(res.body.tenant.roles).toContain('viewer');
  });

  it('handles token with no resource_access for omnidash client gracefully', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { ...validPayload, resource_access: {} },
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildApp();
    const res = await request(app).get('/protected').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.tenant.roles).toContain('user');
  });
});

describe('requireAdmin', () => {
  function buildAdminApp() {
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.get('/admin', requireAdmin, (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('returns 403 when tenant has no admin role', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: validPayload,
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildAdminApp();
    const res = await request(app).get('/admin').set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/admin/i);
  });

  it('allows through when tenant has admin role', async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { ...validPayload, realm_access: { roles: ['user', 'admin'] } },
      protectedHeader: { alg: 'RS256' },
    } as never);
    const app = buildAdminApp();
    const res = await request(app).get('/admin').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
