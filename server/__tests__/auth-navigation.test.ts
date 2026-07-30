import { describe, expect, it } from 'vitest';
import {
  normalizeOidcIssuerQuery,
  shouldProtectBrowserNavigation,
} from '../auth-navigation.js';

function request(
  path: string,
  options: {
    method?: string;
    accept?: string;
    fetchDest?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (options.accept !== undefined) headers.accept = options.accept;
  if (options.fetchDest !== undefined) headers['sec-fetch-dest'] = options.fetchDest;

  return {
    method: options.method ?? 'GET',
    path,
    headers,
  };
}

describe('shouldProtectBrowserNavigation', () => {
  it('protects a top-level HTML navigation', () => {
    expect(
      shouldProtectBrowserNavigation(
        request('/', { accept: 'text/html,application/xhtml+xml', fetchDest: 'document' }),
      ),
    ).toBe(true);
  });

  it('protects a client-side route when Accept identifies an HTML document', () => {
    expect(
      shouldProtectBrowserNavigation(
        request('/dashboards/sea-demo', { accept: 'text/html,application/xhtml+xml' }),
      ),
    ).toBe(true);
  });

  it.each([
    ['/projection/onex.evt.omnimarket.node-generation-completed.v1', '*/*', 'empty'],
    ['/favicon.ico', 'image/avif,image/webp,image/png,*/*', 'image'],
    ['/assets/index.js', '*/*', 'script'],
    ['/api/sea/generate', 'text/html', 'document'],
  ])('does not start login for subresource/data request %s', (path, accept, fetchDest) => {
    expect(
      shouldProtectBrowserNavigation(request(path, { accept, fetchDest })),
    ).toBe(false);
  });

  it('does not redirect a non-GET request even when it accepts HTML', () => {
    expect(
      shouldProtectBrowserNavigation(
        request('/dashboards', { method: 'POST', accept: 'text/html', fetchDest: 'document' }),
      ),
    ).toBe(false);
  });
});

describe('normalizeOidcIssuerQuery', () => {
  const issuer = 'https://dev.auth.omninode.ai/realms/omninode';

  it('leaves a URL without an issuer response parameter unchanged', () => {
    expect(normalizeOidcIssuerQuery('/dashboards?view=live', issuer)).toEqual({
      kind: 'unchanged',
      url: '/dashboards?view=live',
    });
  });

  it('removes a trusted issuer while preserving the rest of the callback', () => {
    expect(
      normalizeOidcIssuerQuery(
        '/?state=abc&iss=https%3A%2F%2Fdev.auth.omninode.ai%2Frealms%2Fomninode&code=xyz&auth_callback=1',
        issuer,
      ),
    ).toEqual({
      kind: 'normalized',
      url: '/?state=abc&code=xyz&auth_callback=1',
    });
  });

  it('removes every trusted duplicate from a stale callback URL', () => {
    expect(
      normalizeOidcIssuerQuery(
        '/?iss=https%3A%2F%2Fdev.auth.omninode.ai%2Frealms%2Fomninode&view=live&iss=https%3A%2F%2Fdev.auth.omninode.ai%2Frealms%2Fomninode',
        issuer,
      ),
    ).toEqual({
      kind: 'normalized',
      url: '/?view=live',
    });
  });

  it('rejects an issuer that does not exactly match the configured realm', () => {
    expect(
      normalizeOidcIssuerQuery(
        '/?iss=https%3A%2F%2Fattacker.example%2Frealms%2Fomninode&auth_callback=1',
        issuer,
      ),
    ).toEqual({ kind: 'rejected', rejection: 'issuer_mismatch' });
  });

  it('rejects issuer-bearing callbacks when no expected issuer is configured', () => {
    expect(
      normalizeOidcIssuerQuery(
        '/?iss=https%3A%2F%2Fdev.auth.omninode.ai%2Frealms%2Fomninode&auth_callback=1',
        '',
      ),
    ).toEqual({ kind: 'rejected', rejection: 'missing_expected_issuer' });
  });
});
