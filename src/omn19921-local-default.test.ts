import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageForPath, PAGE_PATHS } from './navigation/page-routes';

describe('OMN-19921 current local default', () => {
  it('opens the current local Overview at the root route', () => {
    expect(pageForPath('/')).toBe('local-overview');
    expect(PAGE_PATHS['local-overview']).toBe('/overview');
  });

  it('keeps the six served local surfaces reachable from the default route family', () => {
    expect([
      pageForPath('/overview'),
      pageForPath('/runs'),
      pageForPath('/workflow'),
      pageForPath('/usage'),
      pageForPath('/credentials'),
      pageForPath('/api-keys'),
    ]).toEqual([
      'local-overview',
      'local-runs',
      'local-workflow',
      'local-usage',
      'local-credentials',
      'local-api-keys',
    ]);
  });

  it('does not restore the retired direct SQLite projection reader', () => {
    expect(existsSync(resolve(process.cwd(), 'server/sqlite-projection-reader.ts'))).toBe(false);
  });
});
