import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { claimOidcLoginState, storeOidcLoginState } from './session.js';

export const OIDC_CALLBACK_PATH = '/auth/callback';
const PKCE_TTL_MS = 10 * 60 * 1000;
const ONEX_API_AUDIENCE = 'onex-api';

export interface PendingLogin {
  state: string;
  nonce: string;
  verifier: string;
  returnPath: string;
  expiresAt: number;
}

type CallbackStage = 'state_claim' | 'token_exchange' | 'token_verify' | 'session_rotate';
type TokenShapeFacts = Record<string, boolean>;
class OidcValidationError extends Error {
  constructor(message: string, readonly facts: TokenShapeFacts) { super(message); }
}
function callbackRefusal(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (message === 'oidc_token_exchange_failed') return 'token_exchange_rejected';
  if (message === 'invalid_oidc_binding') return 'token_binding_rejected';
  if (message === 'invalid_oidc_nonce') return 'nonce_rejected';
  if (message === 'invalid_oidc_token_type') return 'token_type_rejected';
  if (message === 'invalid_oidc_claims') return 'token_required_claims_rejected';
  return 'callback_refused';
}
function reportCallbackRefusal(stage: CallbackStage, error: unknown): void {
  const facts = error instanceof OidcValidationError ? error.facts : undefined;
  console.error(JSON.stringify({ event: 'oidc_callback_refused', stage, refusal: callbackRefusal(error), ...(facts ? { facts } : {}) }));
}

declare module 'express-session' {
  interface SessionData {
    oidcPkce?: PendingLogin;
    'keycloak-token'?: string;
  }
}

interface BffOptions {
  /** Contract-owned public origin; never infer an OAuth callback from Host. */
  externalOrigin?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: (size: number) => string;
  verifyTokens?: (raw: Record<string, unknown>, pending: PendingLogin) => Promise<void>;
  stateStore?: {
    store(sessionId: string, state: string, value: PendingLogin, ttlMs: number): Promise<void>;
    claim(sessionId: string, state: string): Promise<unknown | null>;
  };
}

function issuer(): string {
  return (process.env.KEYCLOAK_ISSUER ?? '').replace(/\/$/, '');
}

function clientId(): string {
  return process.env.KEYCLOAK_CLIENT_ID ?? 'omnidash';
}

function clientSecret(): string {
  return process.env.KEYCLOAK_CLIENT_SECRET ?? '';
}

function opaqueRandom(size: number): string {
  return randomBytes(size).toString('base64url');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function safeReturnPath(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, 'https://omnidash.invalid');
    return url.origin === 'https://omnidash.invalid' ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): string | null {
  const host = req.get('host');
  if (!host || host.includes('/') || host.includes('\\')) return null;
  try {
    const url = new URL(`${req.protocol}://${host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.origin !== value.replace(/\/$/, '') || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function callbackUrl(externalOrigin: string): string {
  return new URL(OIDC_CALLBACK_PATH, externalOrigin).toString();
}

function sessionRegenerate(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

function sessionSave(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function isPendingLogin(value: unknown): value is PendingLogin {
  if (typeof value !== 'object' || value === null) return false;
  const pending = value as Partial<PendingLogin>;
  return typeof pending.state === 'string' && typeof pending.nonce === 'string'
    && typeof pending.verifier === 'string' && typeof pending.returnPath === 'string'
    && typeof pending.expiresAt === 'number';
}

function authorizationUrl(callback: string, pending: PendingLogin): string {
  const url = new URL(`${issuer()}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('response_type', 'code');
  // `tenant` is the contract-owned default client scope that mints tenant_id.
  url.searchParams.set('scope', 'openid tenant');
  url.searchParams.set('state', pending.state);
  url.searchParams.set('nonce', pending.nonce);
  url.searchParams.set('code_challenge', pkceChallenge(pending.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function verifyReturnedTokens(
  raw: Record<string, unknown>,
  pending: PendingLogin,
  jwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${issuer()}/protocol/openid-connect/certs`)),
): Promise<void> {
  const accessToken = raw.access_token;
  const idToken = raw.id_token;
  if (typeof accessToken !== 'string' || typeof idToken !== 'string') throw new Error('missing_oidc_tokens');
  const realmIssuer = issuer();
  if (!realmIssuer) throw new Error('missing_oidc_issuer');
  const [access, id] = await Promise.all([
    jwtVerify(accessToken, jwks, { issuer: realmIssuer, audience: ONEX_API_AUDIENCE }),
    jwtVerify(idToken, jwks, { issuer: realmIssuer, audience: clientId() }),
  ]);
  // Keycloak puts the JWT media type in the protected header and the token
  // class in the signed payload (`typ`), which is what its Node adapter checks.
  if (access.protectedHeader.typ !== 'JWT' || id.protectedHeader.typ !== 'JWT'
    || access.payload.typ !== 'Bearer' || id.payload.typ !== 'ID') {
    throw new OidcValidationError('invalid_oidc_token_type', {
      access_header_jwt: access.protectedHeader.typ === 'JWT', id_header_jwt: id.protectedHeader.typ === 'JWT',
      access_payload_bearer: access.payload.typ === 'Bearer', id_payload_id: id.payload.typ === 'ID',
    });
  }
  const validTimesAndSubject = (payload: { exp?: unknown; iat?: unknown; sub?: unknown }) =>
    typeof payload.exp === 'number' && typeof payload.iat === 'number'
    && typeof payload.sub === 'string' && payload.sub.length > 0;
  if (!validTimesAndSubject(access.payload) || !validTimesAndSubject(id.payload)) {
    throw new OidcValidationError('invalid_oidc_claims', {
      access_exp_numeric: typeof access.payload.exp === 'number', access_iat_numeric: typeof access.payload.iat === 'number', access_sub_present: typeof access.payload.sub === 'string' && access.payload.sub.length > 0,
      id_exp_numeric: typeof id.payload.exp === 'number', id_iat_numeric: typeof id.payload.iat === 'number', id_sub_present: typeof id.payload.sub === 'string' && id.payload.sub.length > 0,
    });
  }
  if (id.payload.nonce !== pending.nonce || access.payload.sub !== id.payload.sub
    || access.payload.azp !== clientId() || id.payload.azp !== clientId()) {
    throw new Error('invalid_oidc_binding');
  }
}

async function exchangeCode(
  callback: string,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const secret = clientSecret();
  if (!issuer() || !secret) throw new Error('missing_oidc_configuration');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    code,
    redirect_uri: callback,
    code_verifier: verifier,
  });
  const response = await fetchImpl(`${issuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId()}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('oidc_token_exchange_failed');
  const json: unknown = await response.json();
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('invalid_oidc_token_response');
  return json as Record<string, unknown>;
}

/**
 * PKCE browser-login compatibility layer for keycloak-connect 26.1.1.
 * The adapter remains mounted afterwards: it validates/refreshes the persisted
 * grant and owns logout/backchannel logout exactly as before.
 */
export function createOidcBff(options: BffOptions = {}) {
  const now = options.now ?? Date.now;
  const random = options.random ?? opaqueRandom;
  const fetchImpl = options.fetchImpl ?? fetch;
  const verifyTokens = options.verifyTokens ?? verifyReturnedTokens;
  const externalOrigin = configuredOrigin(options.externalOrigin);
  const stateStore = options.stateStore ?? { store: storeOidcLoginState, claim: claimOidcLoginState };

  async function begin(req: Request, res: Response): Promise<void> {
    const returnPath = safeReturnPath(req.originalUrl || req.url);
    if (!returnPath || !issuer() || !clientSecret() || !externalOrigin) {
      res.status(500).json({ error: 'oidc_login_unavailable' });
      return;
    }
    if (requestOrigin(req) !== externalOrigin) {
      res.status(400).json({ error: 'invalid_oidc_origin' });
      return;
    }
    try {
      // Rotate before creating login state so a pre-authentication fixed SID
      // cannot become the authenticated session.
      await sessionRegenerate(req);
      const pending: PendingLogin = {
        state: random(32), nonce: random(32), verifier: random(48), returnPath,
        expiresAt: now() + PKCE_TTL_MS,
      };
      req.session.oidcPkce = pending;
      await sessionSave(req);
      await stateStore.store(req.session.id, pending.state, pending, PKCE_TTL_MS);
      res.redirect(authorizationUrl(callbackUrl(externalOrigin), pending));
    } catch {
      res.status(500).json({ error: 'oidc_login_unavailable' });
    }
  }

  async function callback(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.path !== OIDC_CALLBACK_PATH) return next();
    if (!externalOrigin || requestOrigin(req) !== externalOrigin) {
      res.status(400).json({ error: 'invalid_oidc_callback' });
      return;
    }
    const sessionPending = req.session.oidcPkce;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    // Clear the cookie-session copy before exchange. The Redis record below is
    // the authoritative one-use transaction and is claimed with GETDEL.
    delete req.session.oidcPkce;
    if (!sessionPending || sessionPending.expiresAt < now() || !code || state !== sessionPending.state) {
      res.status(400).json({ error: 'invalid_oidc_callback' });
      return;
    }
    let stage: CallbackStage = 'state_claim';
    try {
      await sessionSave(req);
      const claimed = await stateStore.claim(req.session.id, state);
      if (!isPendingLogin(claimed) || claimed.expiresAt < now() || claimed.state !== state
        || claimed.verifier !== sessionPending.verifier || claimed.nonce !== sessionPending.nonce) {
        throw new Error('invalid_or_replayed_oidc_state');
      }
      const pending = claimed;
      stage = 'token_exchange';
      const tokenResponse = await exchangeCode(callbackUrl(externalOrigin), code, pending.verifier, fetchImpl);
      stage = 'token_verify';
      await verifyTokens(tokenResponse, pending);
      // Rotate again at authentication and persist only tokens that passed
      // signature, issuer, audience, type, and nonce validation.
      stage = 'session_rotate';
      await sessionRegenerate(req);
      req.session['keycloak-token'] = JSON.stringify(tokenResponse);
      await sessionSave(req);
      res.redirect(pending.returnPath);
    } catch (error) {
      reportCallbackRefusal(stage, error);
      res.status(400).json({ error: 'invalid_oidc_callback' });
    }
  }

  return { begin, callback };
}
