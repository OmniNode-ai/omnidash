import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPatterns } from '../api';
import { apiRequest, getQueryFn } from '../queryClient';

// Mock global fetch
global.fetch = vi.fn();

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchPatterns', () => {
    it('should fetch patterns successfully', async () => {
      const mockPatterns = [
        { name: 'pattern1', file_path: '/path/to/file.py' },
        { name: 'pattern2', file_path: '/path/to/file2.py' },
      ];

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ patterns: mockPatterns }),
      } as any);

      const result = await fetchPatterns({ path: 'test.py', lang: 'python' });

      expect(result).toEqual(mockPatterns);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/intelligence/analysis/patterns')
      );
    });

    it('should include query parameters', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ patterns: [] }),
      } as any);

      await fetchPatterns({ path: 'test.py', lang: 'python', timeout: 5000 });

      const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain('path=test.py');
      expect(callUrl).toContain('lang=python');
      expect(callUrl).toContain('timeout=5000');
    });

    it('should handle errors', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      } as any);

      await expect(fetchPatterns({ path: 'test.py' })).rejects.toThrow();
    });
  });

  describe('apiRequest', () => {
    it('should make GET request', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      await apiRequest('GET', '/api/test');

      expect(global.fetch).toHaveBeenCalledWith('/api/test', {
        method: 'GET',
        headers: {},
        body: undefined,
        credentials: 'include',
      });
    });

    it('should make POST request with data', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const data = { test: 'value' };
      await apiRequest('POST', '/api/test', data);

      expect(global.fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
    });

    it('should throw on error response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('Error message'),
      } as any);

      await expect(apiRequest('GET', '/api/test')).rejects.toThrow();
    });
  });

  describe('getQueryFn', () => {
    it('should fetch data successfully', async () => {
      const mockData = { id: 1, name: 'test' };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const queryFn = getQueryFn({ on401: 'throw' });
      const result = await queryFn({ queryKey: ['/api/test'] });

      expect(result).toEqual(mockData);
    });

    it('should return null on 401 when on401 is "returnNull"', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as any);

      const queryFn = getQueryFn({ on401: 'returnNull' });
      const result = await queryFn({ queryKey: ['/api/test'] });

      expect(result).toBeNull();
    });

    it('should throw on 401 when on401 is "throw"', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue('Unauthorized'),
      } as any);

      const queryFn = getQueryFn({ on401: 'throw' });
      await expect(queryFn({ queryKey: ['/api/test'] })).rejects.toThrow();
    });
  });
});
