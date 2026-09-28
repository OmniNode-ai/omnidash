import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, lstatSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createClient } from 'redis';
import { createRemoteJWKSet, jwtVerify } from 'jose';

type PrivateEnv = Record<string, string>;
type Identity = { subject: string; tenant_id: string; principal_id: string };
type ProofPhase = 'inputs' | 'browser-launch' | 'dashboard-navigation' | 'authorization-redirect' | 'form-submit' | 'callback' | 'redis-read' | 'token-verify';
type Snapshot = {
  location: 'dashboard' | 'issuer' | 'callback' | 'other';
  login_form_visible: boolean;
  issuer_navigation_status: '2xx' | '4xx' | '5xx' | 'none';
  issuer_document_ready: 'loading' | 'interactive' | 'complete' | 'none';
  issuer_surface: 'login' | 'error' | 'loading' | 'none';
};
class ProofFailure extends Error {
  constructor(readonly phase: ProofPhase, readonly snapshot: Snapshot | null, readonly cause: unknown) { super('proof_failure'); }
}
function safeRefusal(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  const message = error instanceof Error ? error.message : '';
  if (/net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_TIMED_OUT)/.test(message)) return 'network_unavailable';
  return error instanceof Error && ['private_input_required', 'invalid_private_input', 'private_bundle_required', 'isolated_auth_required', 'private_auth_input_required', 'isolated_redis_required', 'receipt_exists', 'pkce_missing', 'missing_session_cookie', 'invalid_session_cookie', 'missing_redis_session', 'missing_server_token', 'identity_mismatch'].includes(error.message) ? error.message : 'proof_refused';
}
export function safeDiagnostic(error: unknown): { stage: ProofPhase; refusal: string; snapshot?: Snapshot } {
  if (error instanceof ProofFailure) return { stage: error.phase, refusal: safeRefusal(error.cause), ...(error.snapshot ? { snapshot: error.snapshot } : {}) };
  return { stage: 'inputs', refusal: safeRefusal(error) };
}

export function privateFile(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) throw new Error('private_input_required');
}
export function envFile(path: string): PrivateEnv {
  privateFile(path);
  const values: PrivateEnv = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || match[1] in values || /[\r\0]/.test(match[2])) throw new Error('invalid_private_input');
    values[match[1]] = match[2];
  }
  return values;
}
export function unsign(value: string, secret: string): string | null {
  const split = value.lastIndexOf('.');
  if (split < 1) return null;
  const raw = value.slice(0, split);
  const expected = createHmac('sha256', secret).update(raw).digest('base64').replace(/=+$/, '');
  const supplied = value.slice(split + 1);
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ? raw : null;
}
export function cookieSessionId(cookies: Array<{ name: string; value: string }>, secret: string): string {
  const encoded = cookies.find((cookie) => cookie.name === 'connect.sid')?.value;
  let value: string | undefined;
  try { value = encoded ? decodeURIComponent(encoded) : undefined; } catch { throw new Error('invalid_session_cookie'); }
  if (!value?.startsWith('s:')) throw new Error('missing_session_cookie');
  const sessionId = unsign(value.slice(2), secret);
  if (!sessionId) throw new Error('invalid_session_cookie');
  return sessionId;
}

export async function proveBrowserLogin(bundle: string, launchEnvPath: string): Promise<Record<string, boolean>> {
  let phase: ProofPhase = 'inputs';
  const root = resolve(bundle);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o777) !== 0o700) throw new Error('private_bundle_required');
  const credentials = envFile(join(root, 'credentials.env'));
  const launch = envFile(launchEnvPath);
  const identityPath = join(root, 'identity.json');
  privateFile(identityPath);
  const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as Identity;
  if (!identity.subject || !identity.tenant_id || !identity.principal_id || Object.keys(identity).length !== 3
    || launch.KEYCLOAK_ISSUER !== 'http://auth.localhost:28080/realms/omninode') throw new Error('isolated_auth_required');
  const username = credentials.SIM_PREFLIGHT_DEMO_USERNAME;
  const password = credentials.SIM_PREFLIGHT_DEMO_PASSWORD;
  if (!username || !password || !launch.SESSION_SECRET || !launch.SESSION_STORE_URL) throw new Error('private_auth_input_required');
  if (launch.SESSION_STORE_URL.replace(/:[^:@/]+@/, ':<redacted>@') !== 'redis://:<redacted>@127.0.0.1:65379/0') throw new Error('isolated_redis_required');
  const receipt = join(root, 'verified-user-token.txt');
  if (existsSync(receipt)) throw new Error('receipt_exists');

  phase = 'browser-launch';
  const browser = await chromium.launch({ headless: true });
  let snapshot: Snapshot | null = null;
  let page: Page | null = null;
  let issuerNavigationStatus: Snapshot['issuer_navigation_status'] = 'none';
  try {
    page = await browser.newPage();
    page.on('response', (response) => {
      if (!response.request().isNavigationRequest()) return;
      try {
        if (new URL(response.url()).origin !== 'http://auth.localhost:28080') return;
        const status = response.status();
        issuerNavigationStatus = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 200 && status < 300 ? '2xx' : 'none';
      } catch { /* response URL is never emitted */ }
    });
    phase = 'dashboard-navigation';
    // Commit proves the dashboard connection without waiting for every issuer
    // asset across the relay. The issuer redirect is asserted separately.
    await page.goto('http://localhost:3000/', { waitUntil: 'commit' });
    phase = 'authorization-redirect';
    await page.waitForURL((url) => url.origin === 'http://auth.localhost:28080', { timeout: 15_000 });
    const auth = new URL(page.url());
    const pkce = auth.origin === 'http://auth.localhost:28080' && auth.pathname === '/realms/omninode/protocol/openid-connect/auth'
      && auth.searchParams.get('client_id') === 'omnidash' && auth.searchParams.get('redirect_uri') === 'http://localhost:3000/auth/callback'
      && auth.searchParams.get('scope') === 'openid tenant' && auth.searchParams.get('code_challenge_method') === 'S256'
      && Boolean(auth.searchParams.get('code_challenge')) && Boolean(auth.searchParams.get('state'))
      && Boolean(auth.searchParams.get('nonce'));
    if (!pkce) throw new Error('pkce_missing');
    phase = 'form-submit';
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(password);
    await page.locator('#kc-login').click();
    phase = 'callback';
    await page.waitForURL((url) => url.origin === 'http://localhost:3000' && url.pathname !== '/auth/callback', { timeout: 20_000 });
    const sessionId = cookieSessionId(await page.context().cookies('http://localhost:3000'), launch.SESSION_SECRET);
    phase = 'redis-read';
    const redis = createClient({ url: launch.SESSION_STORE_URL, socket: { connectTimeout: 5_000, reconnectStrategy: false } });
    redis.on('error', () => undefined);
    await redis.connect();
    try {
      const raw = await redis.get(`sess:${sessionId}`);
      if (!raw) throw new Error('missing_redis_session');
      const grant = JSON.parse(JSON.parse(raw)['keycloak-token']) as { access_token?: string };
      if (!grant.access_token) throw new Error('missing_server_token');
      phase = 'token-verify';
      const issuer = launch.KEYCLOAK_ISSUER;
      const keys = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
      const verified = await jwtVerify(grant.access_token, keys, { issuer, audience: 'onex-api' });
      if (verified.payload.sub !== identity.subject || verified.payload.tenant_id !== identity.tenant_id) throw new Error('identity_mismatch');
      writeFileSync(receipt, grant.access_token, { mode: 0o600, flag: 'wx' });
    } finally { await redis.quit(); }
    return { pkce: true, dashboard: true, session_cookie: true, redis_session: true, verified_user_token: true };
  } catch (error) {
    // Snapshot deliberately exposes only a location class and form visibility.
    try {
      const url = page ? new URL(page.url()) : null;
      const location: Snapshot['location'] = !url ? 'other'
        : url.origin === 'http://localhost:3000' ? (url.pathname === '/auth/callback' ? 'callback' : 'dashboard')
          : url.origin === 'http://auth.localhost:28080' ? 'issuer' : 'other';
      const login = page ? await page.locator('#kc-login').isVisible().catch(() => false) : false;
      const error = page ? await page.locator('#kc-error-message').isVisible().catch(() => false) : false;
      const ready = page ? await page.evaluate(() => document.readyState).catch(() => 'none') : 'none';
      const issuer_document_ready: Snapshot['issuer_document_ready'] = ready === 'loading' || ready === 'interactive' || ready === 'complete' ? ready : 'none';
      snapshot = {
        location, login_form_visible: login, issuer_navigation_status: issuerNavigationStatus, issuer_document_ready,
        issuer_surface: login ? 'login' : error ? 'error' : location === 'issuer' && issuer_document_ready === 'loading' ? 'loading' : 'none',
      };
    } catch { snapshot = { location: 'other', login_form_visible: false, issuer_navigation_status: 'none', issuer_document_ready: 'none', issuer_surface: 'none' }; }
    throw new ProofFailure(phase, snapshot, error);
  } finally { await browser.close(); }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  proveBrowserLogin(process.argv[2] ?? '', process.argv[3] ?? '').then(
    (result) => console.log(JSON.stringify(result)),
    (error: unknown) => {
      console.error(JSON.stringify(safeDiagnostic(error)));
      process.exitCode = 1;
    },
  );
}
