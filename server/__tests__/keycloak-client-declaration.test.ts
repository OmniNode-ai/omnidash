/**
 * server/__tests__/keycloak-client-declaration.test.ts
 *
 * OMN-18080 — the committed `omnidash` Keycloak client declaration named a host
 * that does not exist.
 *
 * `deploy/keycloak/omnidash-client.json` is the source-controlled desired state
 * for the live `omnidash` client (applied by hand via kcadm per its own
 * runbook). Every host in it — `rootUrl`, `redirectUris`, `webOrigins`, and
 * `post.logout.redirect.uris` — was written `dash.dev.omninode.ai`, a
 * transposition of the real host `dev.dash.omninode.ai` that the rest of this
 * repo uses (`server/__tests__/cors.test.ts`,
 * `src/templates/omn17197-consumer-flow-surface.test.ts`, and the OMN-17197
 * decision that names exactly one surface).
 *
 * WHY IT MATTERED FOR LOGOUT SPECIFICALLY. The runtime side is already correct:
 * `server/index.ts` mounts `keycloak.middleware({ logout: '/logout' })`, and
 * keycloak-connect's logout middleware DOES send both parameters when a session
 * grant exists — it reads `request.kauth.grant.__raw.id_token` and calls
 * `keycloak.logoutUrl(redirectUrl, idTokenHint)`, which sets `id_token_hint` and
 * `post_logout_redirect_uri` together (node_modules/keycloak-connect
 * middleware/logout.js and keycloak.js). An anonymous probe of `/logout` sees a
 * bare end-session URL only because there is no grant to read a hint from. The
 * `redirectUrl` it computes is the REQUEST's own origin — so on
 * `dev.dash.omninode.ai` it would send a post-logout redirect to a host the
 * client had never registered, and Keycloak refuses an unregistered
 * post-logout URI. Correct code, dead registration.
 *
 * THE RED. Against `dev` before this change, every assertion below that names
 * `dev.dash.omninode.ai` fails: the file said `dash.dev.omninode.ai` in all
 * four places.
 *
 * NOT ASSERTED HERE, deliberately: that the live realm matches this file. The
 * client is applied by hand and is not part of the committed reconciler input
 * (`omninode_infra` k8s/onex-dev/jobs/desired-clients.json declares
 * `omnidash-spa`, not `omnidash`), so nothing mechanically ties the two. That
 * governance gap is real and is called out on the PR rather than papered over
 * with an assertion this repo cannot make.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT_PATH = join(REPO_ROOT, 'deploy', 'keycloak', 'omnidash-client.json');

/** The dashboard host this repo actually serves and CORS-allows. */
const LIVE_HOST = 'dev.dash.omninode.ai';
/** The transposition that was committed. */
const TRANSPOSED_HOST = 'dash.dev.omninode.ai';

interface KeycloakClient {
  clientId: string;
  rootUrl: string;
  redirectUris: string[];
  webOrigins: string[];
  attributes: Record<string, string>;
}

function readClient(): KeycloakClient {
  return JSON.parse(readFileSync(CLIENT_PATH, 'utf8')) as KeycloakClient;
}

function originOf(uri: string): string {
  const url = new URL(uri.replace(/\*+$/, ''));
  return url.origin;
}

describe('omnidash Keycloak client declaration (OMN-18080)', () => {
  it('names the host this repo actually serves, not the transposition', () => {
    const raw = readFileSync(CLIENT_PATH, 'utf8');
    expect(raw).not.toContain(TRANSPOSED_HOST);
    expect(raw).toContain(LIVE_HOST);
  });

  it('declares a post-logout redirect URI', () => {
    const client = readClient();
    const postLogout = client.attributes['post.logout.redirect.uris'];
    expect(postLogout, 'post.logout.redirect.uris must be declared').toBeTruthy();
  });

  it('registers the post-logout URI on the SAME origin the client logs in from', () => {
    const client = readClient();
    const redirectOrigins = new Set(client.redirectUris.map(originOf));
    for (const uri of client.attributes['post.logout.redirect.uris'].split('##')) {
      expect(
        redirectOrigins.has(originOf(uri)),
        `post-logout URI ${uri} is on an origin absent from redirectUris ` +
          `${JSON.stringify([...redirectOrigins])}; Keycloak refuses an ` +
          'unregistered post-logout redirect, and keycloak-connect derives that ' +
          "redirect from the REQUEST's own origin"
      ).toBe(true);
    }
  });

  it('keeps rootUrl, redirectUris and webOrigins on one consistent origin', () => {
    const client = readClient();
    const origins = new Set([
      originOf(client.rootUrl),
      ...client.redirectUris.map(originOf),
      ...client.webOrigins.map(originOf),
    ]);
    expect(origins).toEqual(new Set([`https://${LIVE_HOST}`]));
  });

  it('keeps PKCE declared alongside the logout attribute', () => {
    expect(readClient().attributes['pkce.code.challenge.method']).toBe('S256');
  });
});
