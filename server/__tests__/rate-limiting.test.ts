import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// OMN-17188 / CodeQL js/missing-rate-limiting alerts #7 and #8.
//
// #7 (high): `server/index.ts` mounts the single authoritative auth/tenant
// boundary -- session lookup plus `jose` JWT verification -- with no rate limit,
// on a public-facing host. That is an unthrottled credential-stuffing and
// session-probing oracle in front of the session store tracked by OMN-16702.
// #8 (high): the static `dist/` middleware and SPA history-fallback `sendFile`
// below it were likewise unthrottled.
//
// Two tiers of proof: the source-level assertions pin the mount ORDER (a limiter
// mounted after the boundary would protect nothing), and the behavioural tests
// prove the `skipSuccessfulRequests` semantics the auth-boundary fix depends on
// are real rather than assumed.

const serverEntry = readFileSync(resolve(process.cwd(), 'server/index.ts'), 'utf8');

describe('rate limiting is mounted on the served Express app (OMN-17188)', () => {
  it('imports a real rate-limiting middleware', () => {
    expect(serverEntry).toContain("import rateLimit from 'express-rate-limit'");
  });

  it('mounts a limiter BEFORE the auth boundary, not after it', () => {
    const firstLimiter = serverEntry.indexOf('rateLimit({');
    const authBoundary = serverEntry.indexOf('return authMiddleware(req, res, next);');
    expect(firstLimiter).toBeGreaterThan(-1);
    expect(authBoundary).toBeGreaterThan(-1);
    // A limiter mounted downstream of the boundary would let every
    // credential-stuffing attempt reach JWT verification first.
    expect(firstLimiter).toBeLessThan(authBoundary);
  });

  it('mounts the general limiter AFTER the health probe so k8s probes are never throttled', () => {
    const healthProbe = serverEntry.indexOf("app.get('/api/health-probe'");
    const firstLimiter = serverEntry.indexOf('rateLimit({');
    expect(healthProbe).toBeGreaterThan(-1);
    // Throttling liveness/readiness would restart a healthy pod under load.
    expect(healthProbe).toBeLessThan(firstLimiter);
  });

  it('counts only failed requests against the auth-boundary budget', () => {
    // Without this, a legitimate user with many open polling panels would be
    // throttled out of their own dashboard.
    expect(serverEntry).toContain('skipSuccessfulRequests: true');
  });

  it('keeps trust proxy narrow so each client gets its own bucket', () => {
    // With `trust proxy` unset, every request would present the ingress IP and
    // all tenants would share a single bucket; with `true`, a client could spoof
    // X-Forwarded-For and mint unlimited buckets. Exactly one hop is correct.
    expect(serverEntry).toContain("app.set('trust proxy', 1)");
  });
});

describe('rate limiter behaviour (OMN-17188)', () => {
  it('refuses requests past the limit with 429', async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false }));
    app.get('/protected', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).get('/protected');
      expect(ok.status).toBe(200);
    }
    const refused = await request(app).get('/protected');
    expect(refused.status).toBe(429);
  });

  it('does not spend the budget on successful auth, only on failures', async () => {
    // This is the exact configuration guarding the auth boundary: an
    // authenticated user polling projections must never exhaust the bucket,
    // while an attacker replaying bad credentials must.
    const app = express();
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 2,
        skipSuccessfulRequests: true,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
      }),
    );
    app.get('/authed', (_req, res) => res.json({ ok: true }));
    app.get('/denied', (_req, res) => res.status(401).json({ error: 'unauthorized' }));

    // Ten successful requests: the legitimate-user path stays open.
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).get('/authed')).status).toBe(200);
    }
    expect((await request(app).get('/authed')).status).toBe(200);

    // Failures do accumulate, and the third is refused rather than evaluated.
    expect((await request(app).get('/denied')).status).toBe(401);
    expect((await request(app).get('/denied')).status).toBe(401);
    expect((await request(app).get('/denied')).status).toBe(429);
  });
});
