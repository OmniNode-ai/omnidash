import type { IncomingHttpHeaders } from 'node:http';

export interface AuthNavigationRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
}

export type OidcIssuerQueryNormalization =
  | { readonly kind: 'unchanged'; readonly url: string }
  | { readonly kind: 'normalized'; readonly url: string }
  | {
      readonly kind: 'rejected';
      readonly rejection: 'missing_expected_issuer' | 'issuer_mismatch';
    };

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function isDataPath(path: string): boolean {
  return path === '/api'
    || path.startsWith('/api/')
    || path === '/projection'
    || path.startsWith('/projection/');
}

/**
 * Validate and remove Keycloak's RFC 9207 `iss` response parameter.
 *
 * keycloak-connect 26.1.1 does not remove `iss` after it exchanges an
 * authorization code. The stale parameter consequently becomes part of the
 * next redirect URI, and repeated logins accumulate duplicate `iss` values.
 * Validate every supplied value before removing it so callback cleanup does
 * not discard the issuer binding that RFC 9207 provides.
 */
export function normalizeOidcIssuerQuery(
  rawUrl: string,
  expectedIssuer: string,
): OidcIssuerQueryNormalization {
  const parsed = new URL(rawUrl, 'http://omnidash.internal');
  const issuers = parsed.searchParams.getAll('iss');

  if (issuers.length === 0) {
    return { kind: 'unchanged', url: rawUrl };
  }
  if (!expectedIssuer) {
    return { kind: 'rejected', rejection: 'missing_expected_issuer' };
  }
  if (issuers.some((issuer) => issuer !== expectedIssuer)) {
    return { kind: 'rejected', rejection: 'issuer_mismatch' };
  }

  parsed.searchParams.delete('iss');
  return {
    kind: 'normalized',
    url: `${parsed.pathname}${parsed.search}${parsed.hash}`,
  };
}

/**
 * Return true only for a top-level SPA document navigation.
 *
 * Keycloak login is stateful: every redirect records the exact callback URI
 * used for the authorization-code exchange. Redirecting projection reads,
 * favicon requests, or JS/CSS fetches starts concurrent login flows in the
 * same browser session and lets those subresources overwrite the document
 * callback. Non-document requests must therefore fall through to the normal
 * 401/403 boundary instead of initiating OIDC.
 */
export function shouldProtectBrowserNavigation(
  request: AuthNavigationRequest,
): boolean {
  if (request.method.toUpperCase() !== 'GET' || isDataPath(request.path)) {
    return false;
  }

  const fetchDest = headerValue(request.headers['sec-fetch-dest']).trim().toLowerCase();
  if (fetchDest) {
    return fetchDest === 'document';
  }

  const acceptedTypes = headerValue(request.headers.accept)
    .split(',')
    .map((value) => value.split(';', 1)[0]?.trim().toLowerCase());
  return acceptedTypes.includes('text/html');
}
