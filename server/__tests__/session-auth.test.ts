import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jose before importing keycloak module
vi.mock('jose', () => ({
  decodeJwt: vi.fn(),
}));

// Mock keycloak-connect so tests don't need a real Keycloak server
vi.mock('keycloak-connect', () => ({
  default: vi.fn().mockImplementation(() => ({
    middleware: vi.fn().mockReturnValue([]),
    protect: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
    redirectToLogin: vi.fn().mockReturnValue(false),
  })),
}));

import { decodeJwt } from 'jose';
import { tenantFromSession } from '../keycloak.js';
import type { Request } from 'express';

const mockDecodeJwt = decodeJwt as ReturnType<typeof vi.fn>;

function makeReq(sessionOverrides: Record<string, unknown> = {}): Request {
  return { session: sessionOverrides } as unknown as Request;
}

function validGrant(claims: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'header.payload.sig',
    ...claims,
  });
}

describe('tenantFromSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when req.session is absent', () => {
    const req = {} as Request;
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when keycloak-token is not in session', () => {
    const req = makeReq({});
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when keycloak-token is not a string', () => {
    const req = makeReq({ 'keycloak-token': 123 });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when the grant JSON has no access_token', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1', tenant_id: 'tenant-a' });
    const req = makeReq({ 'keycloak-token': JSON.stringify({ refresh_token: 'x' }) });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when the decoded token is missing tenant_id', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1' });
    const req = makeReq({ 'keycloak-token': validGrant() });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when exp claim is absent', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1', tenant_id: 'tenant-abc' });
    const req = makeReq({ 'keycloak-token': validGrant() });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when exp claim is non-numeric', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1', tenant_id: 'tenant-abc', exp: 'never' });
    const req = makeReq({ 'keycloak-token': validGrant() });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns null when token is expired', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1', tenant_id: 'tenant-abc', exp: Math.floor(Date.now() / 1000) - 60 });
    const req = makeReq({ 'keycloak-token': validGrant() });
    expect(tenantFromSession(req)).toBeNull();
  });

  it('returns TenantContext when session has a valid grant with tenant_id', () => {
    mockDecodeJwt.mockReturnValue({
      sub: 'user-1',
      tenant_id: 'tenant-abc',
      tenant_slug: 'acme',
      realm_access: { roles: ['user'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = makeReq({ 'keycloak-token': validGrant() });

    const result = tenantFromSession(req);

    expect(result).toEqual({
      tenant_id: 'tenant-abc',
      tenant_slug: 'acme',
      sub: 'user-1',
      roles: ['user'],
    });
  });

  it('merges realm and resource_access roles from the session token', () => {
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    mockDecodeJwt.mockReturnValue({
      sub: 'user-1',
      tenant_id: 'tenant-abc',
      tenant_slug: 'acme',
      realm_access: { roles: ['user', 'admin'] },
      resource_access: { omnidash: { roles: ['dashboard-admin'] } },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = makeReq({ 'keycloak-token': validGrant() });

    const result = tenantFromSession(req);

    expect(result?.roles).toEqual(expect.arrayContaining(['user', 'admin', 'dashboard-admin']));
  });

  it('defaults tenant_slug to empty string when claim is absent', () => {
    mockDecodeJwt.mockReturnValue({ sub: 'user-1', tenant_id: 'tenant-abc', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = makeReq({ 'keycloak-token': validGrant() });

    const result = tenantFromSession(req);

    expect(result?.tenant_slug).toBe('');
  });

  it('returns null and does not throw when decodeJwt throws', () => {
    mockDecodeJwt.mockImplementation(() => { throw new Error('bad jwt'); });
    const req = makeReq({ 'keycloak-token': validGrant() });

    expect(tenantFromSession(req)).toBeNull();
  });
});

// ── authMiddleware session path ────────────────────────────────────────────
describe('authMiddleware — session path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('attaches req.tenant from session and skips Bearer check', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';

    mockDecodeJwt.mockReturnValue({
      sub: 'user-session',
      tenant_id: 'tenant-session',
      tenant_slug: 'session-slug',
      realm_access: { roles: ['user'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const { authMiddleware } = await import('../auth-middleware.js');

    const req = makeReq({ 'keycloak-token': validGrant() });
    // No Authorization header — should still work via session
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as import('express').Response;
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.tenant).toMatchObject({
      tenant_id: 'tenant-session',
      tenant_slug: 'session-slug',
      sub: 'user-session',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('falls back to 401 when session is absent and no Bearer header', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    mockDecodeJwt.mockReturnValue(null);

    const { authMiddleware } = await import('../auth-middleware.js');

    const req = { session: {}, headers: {} } as unknown as Request;
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }), json } as unknown as import('express').Response;
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
