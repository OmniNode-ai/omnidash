// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpLayoutPersistence } from './layout-persistence';
import type { DashboardDefinition } from '@shared/types/dashboard';

const MOCK_DASHBOARD: DashboardDefinition = {
  id: 'dash-test-1',
  schemaVersion: '1.0',
  name: 'Test Dashboard',
  layout: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  author: 'bret',
  shared: false,
};

describe('HttpLayoutPersistence', () => {
  let persistence: HttpLayoutPersistence;

  beforeEach(() => {
    vi.restoreAllMocks();
    persistence = new HttpLayoutPersistence('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('read()', () => {
    it('returns parsed dashboard when server responds 200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => MOCK_DASHBOARD,
        })
      );

      const result = await persistence.read('default');

      expect(result).toEqual(MOCK_DASHBOARD);
      expect(fetch).toHaveBeenCalledWith('/_layouts/default');
    });

    it('returns null on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => null,
        })
      );

      const result = await persistence.read('does-not-exist');

      expect(result).toBeNull();
    });

    it('throws on non-404 error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      await expect(persistence.read('default')).rejects.toThrow('/_layouts read failed: 500');
    });

    it('encodes layout name in URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => MOCK_DASHBOARD,
        })
      );

      await persistence.read('my layout/with spaces');

      expect(fetch).toHaveBeenCalledWith('/_layouts/my%20layout%2Fwith%20spaces');
    });
  });

  describe('write()', () => {
    it('POSTs JSON body and resolves on 200', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
        })
      );

      await expect(persistence.write('default', MOCK_DASHBOARD)).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledWith('/_layouts/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(MOCK_DASHBOARD),
      });
    });

    it('throws on error response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
      );

      await expect(persistence.write('default', MOCK_DASHBOARD)).rejects.toThrow(
        '/_layouts write failed: 503'
      );
    });

    it('uses custom baseUrl when provided', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
        })
      );

      const custom = new HttpLayoutPersistence('http://localhost:9999');
      await custom.write('default', MOCK_DASHBOARD);

      expect(fetch).toHaveBeenCalledWith('http://localhost:9999/_layouts/default', expect.any(Object));
    });
  });
});
