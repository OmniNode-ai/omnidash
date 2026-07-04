// @vitest-environment node
// OMN-10875: onboarding HTTP surface — disabled 503, own-token verification
// (tenant claim NOT required), idempotent provision, input validation.
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { JWTPayload } from 'jose';
import { createOnboardingRouter } from './onboarding-routes.js';
import { createTenantProvisioner, type Queryable } from './tenant-provisioning.js';
import type { KeycloakAdminClient } from './keycloak-admin.js';

function planKeycloak(): KeycloakAdminClient {
  return {
    applyMode: 'plan',
    applyTenantAttributes: (subject, attrs) =>
      Promise.resolve({
        applied: false,
        plan: [
          {
            kind: 'keycloak_admin' as const,
            method: 'PUT' as const,
            path: `/users/${subject}`,
            description: `tenant ${attrs.tenantId}`,
          },
        ],
      }),
  };
}

function fakeDb(): Queryable {
  const tenants: Record<string, unknown>[] = [];
  return {
    async query(text: string, params: unknown[] = []) {
      if (text.startsWith('SELECT')) {
        return { rows: tenants.filter((t) => t.created_by_subject === params[0]) };
      }
      const [tenantId, slug, principalId, displayName, subject, email] = params as string[];
      if (!tenants.some((t) => t.created_by_subject === subject)) {
        tenants.push({
          tenant_id: tenantId,
          tenant_slug: slug,
          principal_id: principalId,
          display_name: displayName,
          status: 'active',
          created_by_subject: subject,
          created_by_email: email,
          created_at: new Date('2026-07-03T00:00:00Z'),
        });
      }
      return { rows: [] };
    },
  };
}

function buildApp(options?: {
  enabled?: boolean;
  verifier?: (token: string) => Promise<JWTPayload>;
}) {
  const app = express();
  app.use(express.json());
  const enabled = options?.enabled ?? true;
  if (!enabled) {
    app.use(createOnboardingRouter({ enabled: false }));
    return app;
  }
  const provisioner = createTenantProvisioner({ db: fakeDb(), keycloak: planKeycloak() });
  const verifier =
    options?.verifier
    ?? ((token: string) =>
      token === 'good'
        ? Promise.resolve({ sub: 'sub-1', email: 'alice@example.com' } as JWTPayload)
        : Promise.reject(new Error('bad token')));
  app.use(createOnboardingRouter({ enabled: true, verifier, provisioner }));
  return app;
}

describe('disabled onboarding', () => {
  it('returns 503 on every onboarding endpoint', async () => {
    const app = buildApp({ enabled: false });
    const post = await request(app).post('/api/onboarding/provision');
    const get = await request(app).get('/api/onboarding/me');
    expect(post.status).toBe(503);
    expect(get.status).toBe(503);
    expect(post.body.error).toMatch(/disabled/);
  });

  it('fails fast when enabled without verifier/provisioner', () => {
    expect(() => createOnboardingRouter({ enabled: true })).toThrow(/verifier and a provisioner/);
  });
});

describe('POST /api/onboarding/provision', () => {
  it('401s without a bearer token', async () => {
    const res = await request(buildApp()).post('/api/onboarding/provision');
    expect(res.status).toBe(401);
  });

  it('401s on an invalid token without leaking verifier detail', async () => {
    const res = await request(buildApp())
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid bearer token');
  });

  it('401s on a verified token with no subject', async () => {
    const app = buildApp({ verifier: () => Promise.resolve({} as JWTPayload) });
    const res = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/subject/);
  });

  it('provisions a tenant for a token WITHOUT a tenant claim (the onboarding case)', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({ requested_slug: 'Acme Corp', display_name: 'Acme' });
    expect(res.status).toBe(201);
    expect(res.body.outcome).toBe('created');
    expect(res.body.tenant.tenant_slug).toBe('acme-corp');
    expect(res.body.tenant.principal_id).toMatch(/^principal:/);
    // Plan mode: live realm untouched, steps surfaced for the operator.
    expect(res.body.keycloak.applied).toBe(false);
    expect(res.body.keycloak.plan.length).toBeGreaterThan(0);
    expect(res.body.credentials).toMatchObject({ status: 'deferred', ticket: 'OMN-12911' });
  });

  it('is idempotent — the second call returns 200/existing with the same tenant', async () => {
    const app = buildApp();
    const first = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({ requested_slug: 'acme' });
    const second = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({ requested_slug: 'acme' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.outcome).toBe('existing');
    expect(second.body.tenant.tenant_id).toBe(first.body.tenant.tenant_id);
  });

  it('400s on oversized or non-string inputs', async () => {
    const app = buildApp();
    const badSlug = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({ requested_slug: 'x'.repeat(65) });
    const badName = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({ display_name: 42 });
    expect(badSlug.status).toBe(400);
    expect(badName.status).toBe(400);
  });

  it('500s without leaking detail when provisioning fails', async () => {
    const app = express();
    app.use(express.json());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    app.use(
      createOnboardingRouter({
        enabled: true,
        verifier: () => Promise.resolve({ sub: 'sub-err' } as JWTPayload),
        provisioner: {
          provision: () => Promise.reject(new Error('db exploded with secrets')),
          lookup: () => Promise.resolve(null),
        },
      }),
    );
    const res = await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secrets');
    consoleError.mockRestore();
  });
});

describe('GET /api/onboarding/me', () => {
  it('reports provisioned=false before and true after provisioning', async () => {
    const app = buildApp();
    const before = await request(app)
      .get('/api/onboarding/me')
      .set('Authorization', 'Bearer good');
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ subject: 'sub-1', provisioned: false, tenant: null });

    await request(app)
      .post('/api/onboarding/provision')
      .set('Authorization', 'Bearer good')
      .send({});
    const after = await request(app)
      .get('/api/onboarding/me')
      .set('Authorization', 'Bearer good');
    expect(after.body.provisioned).toBe(true);
    expect(after.body.tenant.tenant_id).toMatch(/^t_/);
  });

  it('401s without a token', async () => {
    const res = await request(buildApp()).get('/api/onboarding/me');
    expect(res.status).toBe(401);
  });
});
