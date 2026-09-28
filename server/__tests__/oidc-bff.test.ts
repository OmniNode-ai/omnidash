// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createOidcBff, OIDC_CALLBACK_PATH, pkceChallenge, safeReturnPath, verifyReturnedTokens } from '../oidc-bff.js';

const EXTERNAL_ORIGIN = 'https://dev.dash.omninode.ai';

function session() {
  const value: Record<string, unknown> = {};
  return Object.assign(value, {
    regenerate: vi.fn((callback: (error?: Error) => void) => callback()),
    save: vi.fn((callback: (error?: Error) => void) => callback()),
  });
}

function stateStore() {
  const records = new Map<string, unknown>();
  const key = (sessionId: string, state: string) => `${sessionId}:${state}`;
  return {
    store: vi.fn(async (sessionId: string, state: string, value: unknown, _ttlMs: number) => {
      records.set(key(sessionId, state), value);
    }),
    claim: vi.fn(async (sessionId: string, state: string) => {
      const value = records.get(key(sessionId, state)) ?? null;
      records.delete(key(sessionId, state));
      return value;
    }),
  };
}

function request(overrides: Record<string, unknown> = {}): Request {
  return {
    path: '/', url: '/', originalUrl: '/', protocol: 'https', query: {},
    session: Object.assign(session(), { id: 'session-1' }), get: (name: string) => name === 'host' ? 'dev.dash.omninode.ai' : undefined,
    ...overrides,
  } as unknown as Request;
}

function response(): Response & { redirect: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const result = {
    redirect: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  result.status.mockReturnValue(result);
  return result as unknown as Response & typeof result;
}

async function signedTokenFixture() {
  const realmIssuer = 'https://auth.omninode.ai/realms/omninode';
  vi.stubEnv('KEYCLOAK_ISSUER', realmIssuer);
  vi.stubEnv('KEYCLOAK_CLIENT_ID', 'omnidash');
  const trusted = await generateKeyPair('RS256');
  const untrusted = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(trusted.publicKey);
  publicJwk.kid = 'test-key';
  const sign = (
    privateKey: typeof trusted.privateKey,
    claims: Record<string, unknown>,
    audience: string,
    { issuer = realmIssuer, expiration = '1h', subject = 'user-1' }: { issuer?: string; expiration?: string; subject?: string } = {},
  ) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(privateKey);
  return {
    realmIssuer,
    trusted,
    untrusted,
    sign,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    pending: { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 },
  };
}

describe('OIDC BFF PKCE compatibility layer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses a SHA-256 base64url PKCE challenge', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it.each(['/', '/dashboards/sea?view=live', '/safe#panel'])('allows same-origin return path %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each(['https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid'])('rejects unsafe return path %s', (path) => {
    expect(safeReturnPath(path)).toBeNull();
  });

  it('creates a confidential S256 login transaction in a regenerated session', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    const req = request({ originalUrl: '/dashboards/sea?view=live' });
    const res = response();
    const states = stateStore();
    const bff = createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: states, random: (size) => `random-${size}` });

    await bff.begin(req, res);

    expect(req.session.regenerate).toHaveBeenCalledOnce();
    expect(req.session.save).toHaveBeenCalledOnce();
    const url = new URL(res.redirect.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://auth.omninode.ai');
    expect(url.searchParams.get('client_id')).toBe('omnidash');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid tenant');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge('random-48'));
    expect(url.searchParams.get('redirect_uri')).toBe('https://dev.dash.omninode.ai/auth/callback');
    expect(req.session.oidcPkce).toMatchObject({ returnPath: '/dashboards/sea?view=live' });
    expect(states.store).toHaveBeenCalledOnce();
  });

  it('rejects a Host authority with userinfo instead of treating its origin as trusted', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    const req = request({ get: (name: string) => name === 'host' ? 'attacker@dev.dash.omninode.ai' : undefined });
    const res = response();
    await createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: stateStore() }).begin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('rejects a callback Host authority with userinfo before token exchange', async () => {
    const fetchImpl = vi.fn();
    const req = request({
      path: OIDC_CALLBACK_PATH, query: { state: 'state', code: 'code' },
      get: (name: string) => name === 'host' ? 'attacker@dev.dash.omninode.ai' : undefined,
    });
    req.session.oidcPkce = { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 };
    const res = response();
    await createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: stateStore(), fetchImpl }).callback(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exchanges a one-use state with verifier, validates it, and rotates the authenticated session', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'access', id_token: 'id', refresh_token: 'refresh', token_type: 'Bearer',
    }), { status: 200 }));
    const verifyTokens = vi.fn().mockResolvedValue(undefined);
    const req = request({
      path: OIDC_CALLBACK_PATH,
      query: { state: 'state', code: 'code' },
    });
    req.session.oidcPkce = {
      state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/dashboards/sea', expiresAt: Date.now() + 1_000,
    };
    const res = response();
    const states = stateStore();
    await states.store(req.session.id, 'state', req.session.oidcPkce, 1_000);
    const bff = createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: states, fetchImpl, verifyTokens });

    await bff.callback(req, res, vi.fn());

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://auth.omninode.ai/realms/omninode/protocol/openid-connect/token');
    expect(init.headers).toMatchObject({ Authorization: 'Basic b21uaWRhc2g6dGVzdC1zZWNyZXQ=' });
    const body = new URLSearchParams(init.body as string | URLSearchParams);
    expect(body.get('code')).toBe('code');
    expect(body.get('code_verifier')).toBe('verifier');
    expect(body.get('redirect_uri')).toBe('https://dev.dash.omninode.ai/auth/callback');
    expect(verifyTokens).toHaveBeenCalledOnce();
    expect(req.session.regenerate).toHaveBeenCalledOnce();
    expect(req.session.save).toHaveBeenCalledTimes(2);
    expect(req.session['keycloak-token']).toContain('"access_token":"access"');
    expect(res.redirect).toHaveBeenCalledWith('/dashboards/sea');
  });

  it.each([
    [{ state: 'wrong', code: 'code' }, 'state mismatch'],
    [{ state: 'state' }, 'missing code'],
  ])('rejects callback with %s without contacting Keycloak', async (query, _reason) => {
    const fetchImpl = vi.fn();
    const req = request({ path: OIDC_CALLBACK_PATH, query });
    req.session.oidcPkce = {
      state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000,
    };
    const res = response();
    await createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: stateStore(), fetchImpl }).callback(req, res, vi.fn());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(req.session.oidcPkce).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects expired state before exchange', async () => {
    const fetchImpl = vi.fn();
    const req = request({ path: OIDC_CALLBACK_PATH, query: { state: 'state', code: 'code' } });
    req.session.oidcPkce = {
      state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() - 1,
    };
    const res = response();
    await createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: stateStore(), fetchImpl }).callback(req, res, vi.fn());
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('atomically claims state so concurrent callbacks exchange only one code', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    const pending = { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 };
    const states = stateStore();
    await states.store('session-1', 'state', pending, 1_000);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access', id_token: 'id' }), { status: 200 }));
    const bff = createOidcBff({
      externalOrigin: EXTERNAL_ORIGIN, stateStore: states, fetchImpl, verifyTokens: vi.fn().mockResolvedValue(undefined),
    });
    const first = request({ path: OIDC_CALLBACK_PATH, query: { state: 'state', code: 'code' } });
    const second = request({ path: OIDC_CALLBACK_PATH, query: { state: 'state', code: 'code' } });
    first.session.oidcPkce = pending;
    second.session.oidcPkce = pending;
    const firstResponse = response();
    const secondResponse = response();

    await Promise.all([bff.callback(first, firstResponse, vi.fn()), bff.callback(second, secondResponse, vi.fn())]);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(states.claim).toHaveBeenCalledTimes(2);
    expect([firstResponse, secondResponse].filter((candidate) => candidate.redirect.mock.calls.length === 1)).toHaveLength(1);
  });

  it('logs only a fixed token-shape refusal code', async () => {
    process.env.KEYCLOAK_ISSUER = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    const pending = { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 };
    const states = stateStore();
    await states.store('session-1', 'state', pending, 1_000);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const req = request({ path: OIDC_CALLBACK_PATH, query: { state: 'state', code: 'code' } });
    req.session.oidcPkce = pending;
    await createOidcBff({ externalOrigin: EXTERNAL_ORIGIN, stateStore: states,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'a', id_token: 'i' }), { status: 200 })),
      verifyTokens: vi.fn().mockRejectedValue(new Error('invalid_oidc_claims')),
    }).callback(req, response(), vi.fn());
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'oidc_callback_refused', stage: 'token_verify', refusal: 'token_required_claims_rejected' }));
    log.mockRestore();
  });

  it('verifies real Keycloak-shaped signed access and ID tokens', async () => {
    const realmIssuer = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_ISSUER = realmIssuer;
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    const sign = (claims: Record<string, unknown>, audience: string) => new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })
      .setIssuer(realmIssuer)
      .setAudience(audience)
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const pending = { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 };
    await expect(verifyReturnedTokens({
      access_token: await sign({ typ: 'Bearer', azp: 'omnidash' }, 'onex-api'),
      id_token: await sign({ typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, 'omnidash'),
    }, pending, createLocalJWKSet({ keys: [publicJwk] }))).resolves.toBeUndefined();
  });

  it('rejects a real signed token without the required confidential-client binding', async () => {
    const realmIssuer = 'https://auth.omninode.ai/realms/omninode';
    process.env.KEYCLOAK_ISSUER = realmIssuer;
    process.env.KEYCLOAK_CLIENT_ID = 'omnidash';
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-key';
    const sign = (claims: Record<string, unknown>, audience: string) => new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })
      .setIssuer(realmIssuer).setAudience(audience).setSubject('user-1').setIssuedAt().setExpirationTime('1h').sign(privateKey);
    const pending = { state: 'state', nonce: 'nonce', verifier: 'verifier', returnPath: '/', expiresAt: Date.now() + 1_000 };
    await expect(verifyReturnedTokens({
      access_token: await sign({ typ: 'Bearer', azp: 'wrong-client' }, 'onex-api'),
      id_token: await sign({ typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, 'omnidash'),
    }, pending, createLocalJWKSet({ keys: [publicJwk] }))).rejects.toThrow('invalid_oidc_binding');
  });

  it.each(['access', 'ID'] as const)('rejects a real %s token with an invalid signature', async (kind) => {
    const fixture = await signedTokenFixture();
    const accessToken = await fixture.sign(
      kind === 'access' ? fixture.untrusted.privateKey : fixture.trusted.privateKey,
      { typ: 'Bearer', azp: 'omnidash' }, 'onex-api',
    );
    const idToken = await fixture.sign(
      kind === 'ID' ? fixture.untrusted.privateKey : fixture.trusted.privateKey,
      { typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, 'omnidash',
    );
    await expect(verifyReturnedTokens({
      access_token: accessToken,
      id_token: idToken,
    }, fixture.pending, fixture.jwks)).rejects.toThrow();
  });

  it.each(['access', 'ID'] as const)('rejects a real %s token from a different issuer', async (kind) => {
    const fixture = await signedTokenFixture();
    const accessToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'Bearer', azp: 'omnidash' }, 'onex-api',
      kind === 'access' ? { issuer: `${fixture.realmIssuer}-other` } : {},
    );
    const idToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, 'omnidash',
      kind === 'ID' ? { issuer: `${fixture.realmIssuer}-other` } : {},
    );
    await expect(verifyReturnedTokens({
      access_token: accessToken,
      id_token: idToken,
    }, fixture.pending, fixture.jwks)).rejects.toThrow();
  });

  it.each(['access', 'ID'] as const)('rejects a real expired %s token', async (kind) => {
    const fixture = await signedTokenFixture();
    const accessToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'Bearer', azp: 'omnidash' }, 'onex-api',
      kind === 'access' ? { expiration: '-1h' } : {},
    );
    const idToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, 'omnidash',
      kind === 'ID' ? { expiration: '-1h' } : {},
    );
    await expect(verifyReturnedTokens({
      access_token: accessToken,
      id_token: idToken,
    }, fixture.pending, fixture.jwks)).rejects.toThrow();
  });

  it.each(['access', 'ID'] as const)('rejects a real %s token for a different audience', async (kind) => {
    const fixture = await signedTokenFixture();
    const accessToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'Bearer', azp: 'omnidash' }, kind === 'access' ? 'another-api' : 'onex-api',
    );
    const idToken = await fixture.sign(
      fixture.trusted.privateKey, { typ: 'ID', azp: 'omnidash', nonce: 'nonce' }, kind === 'ID' ? 'another-client' : 'omnidash',
    );
    await expect(verifyReturnedTokens({
      access_token: accessToken,
      id_token: idToken,
    }, fixture.pending, fixture.jwks)).rejects.toThrow();
  });

  it('rejects real signed tokens with a mismatched ID nonce', async () => {
    const fixture = await signedTokenFixture();
    await expect(verifyReturnedTokens({
      access_token: await fixture.sign(fixture.trusted.privateKey, { typ: 'Bearer', azp: 'omnidash' }, 'onex-api'),
      id_token: await fixture.sign(fixture.trusted.privateKey, { typ: 'ID', azp: 'omnidash', nonce: 'other-nonce' }, 'omnidash'),
    }, fixture.pending, fixture.jwks)).rejects.toThrow('invalid_oidc_binding');
  });

  it('rejects real signed tokens with mismatched access and ID subjects', async () => {
    const fixture = await signedTokenFixture();
    await expect(verifyReturnedTokens({
      access_token: await fixture.sign(fixture.trusted.privateKey, { typ: 'Bearer', azp: 'omnidash' }, 'onex-api'),
      id_token: await fixture.sign(
        fixture.trusted.privateKey,
        { typ: 'ID', azp: 'omnidash', nonce: 'nonce' },
        'omnidash',
        { subject: 'other-user' },
      ),
    }, fixture.pending, fixture.jwks)).rejects.toThrow('invalid_oidc_binding');
  });
});
