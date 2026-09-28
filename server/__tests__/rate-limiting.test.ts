import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import {
  createAuthFailureRateLimiter,
  markAuthBoundaryPassed,
} from '../auth-failure-rate-limiter.js';

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
// prove the auth-boundary-specific accounting semantics are real rather than
// assumed.

const serverEntry = readFileSync(resolve(process.cwd(), 'server/index.ts'), 'utf8');

describe('rate limiting is mounted on the served Express app (OMN-17188)', () => {
  it('imports a real rate-limiting middleware', () => {
    expect(serverEntry).toContain("import rateLimit from 'express-rate-limit'");
  });

  it('mounts a limiter BEFORE the auth boundary, not after it', () => {
    const generalLimiter = serverEntry.indexOf('rateLimit({');
    const authFailureLimiter = serverEntry.indexOf('createAuthFailureRateLimiter(');
    const authBoundary = serverEntry.indexOf('return authMiddleware(req, res, () => {');
    expect(generalLimiter).toBeGreaterThan(-1);
    expect(authFailureLimiter).toBeGreaterThan(-1);
    expect(authBoundary).toBeGreaterThan(-1);
    // A limiter mounted downstream of the boundary would let every
    // credential-stuffing attempt reach JWT verification first.
    expect(generalLimiter).toBeLessThan(authBoundary);
    expect(authFailureLimiter).toBeLessThan(authBoundary);
  });

  it('mounts the general limiter AFTER the health probe so k8s probes are never throttled', () => {
    const healthProbe = serverEntry.indexOf("app.get('/api/health-probe'");
    const firstLimiter = serverEntry.indexOf('rateLimit({');
    expect(healthProbe).toBeGreaterThan(-1);
    // Throttling liveness/readiness would restart a healthy pod under load.
    expect(healthProbe).toBeLessThan(firstLimiter);
  });

  it('uses auth-boundary completion rather than downstream HTTP status', () => {
    expect(serverEntry).toContain('createAuthFailureRateLimiter(');
    expect(serverEntry).toContain('markAuthBoundaryPassed(res)');
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

  it('counts only auth-boundary failures, not authorized downstream errors', async () => {
    const app = express();
    app.use(
      createAuthFailureRateLimiter(60_000, 2, (path) => path === '/public'),
    );
    app.use((req, res, next) => {
      if (req.path === '/auth-failure') {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      markAuthBoundaryPassed(res);
      next();
    });
    app.get('/workflow-error', (_req, res) =>
      res.status(500).json({ error: 'workflow_failed' }),
    );
    app.get('/workflow-denied', (_req, res) =>
      res.status(403).json({ error: 'workflow_forbidden' }),
    );
    app.get('/public', (_req, res) =>
      res.status(500).json({ error: 'public_failure' }),
    );

    // Authorized failures, including a downstream 403, must not look like
    // bad credentials merely because their final HTTP status is non-2xx.
    for (let i = 0; i < 10; i += 1) {
      expect((await request(app).get('/workflow-error')).status).toBe(500);
      expect((await request(app).get('/workflow-denied')).status).toBe(403);
    }
    expect((await request(app).get('/public')).status).toBe(500);

    // Only a request rejected by the auth boundary accumulates and the third
    // is refused before it reaches the boundary.
    expect((await request(app).get('/auth-failure')).status).toBe(401);
    expect((await request(app).get('/auth-failure')).status).toBe(401);
    expect((await request(app).get('/auth-failure')).status).toBe(429);
  });
});
