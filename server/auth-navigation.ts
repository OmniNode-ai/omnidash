import type { IncomingHttpHeaders } from 'node:http';

export interface AuthNavigationRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
}

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
