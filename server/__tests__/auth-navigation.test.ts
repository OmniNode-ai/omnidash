import { describe, expect, it } from 'vitest';
import { shouldProtectBrowserNavigation } from '../auth-navigation.js';

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
