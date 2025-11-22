import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllAlertMetrics, clearAlertMetricsCache } from '../alert-helpers';
import { getIntelligenceDb } from '../storage';

// Mock dependencies
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  execute: vi.fn().mockResolvedValue([]),
};

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Alert Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAlertMetricsCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllAlertMetrics', () => {
    it('should return alert metrics with default values', async () => {
      // Mock select chain to return proper result structure
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalActions: 100,
              errorActions: 0,
            },
          ]),
        }),
      } as any);

      // Mock for injection success rate
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalInjections: 50,
              successfulInjections: 48,
            },
          ]),
        }),
      } as any);

      // Mock for response time
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              avgResponseTime: 150,
            },
          ]),
        }),
      } as any);

      // Mock for success rate
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalActions: 100,
              successfulActions: 95,
            },
          ]),
        }),
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const metrics = await getAllAlertMetrics();

      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('injectionSuccessRate');
      expect(metrics).toHaveProperty('avgResponseTime');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('timestamp');
    });

    it('should calculate error rate from database', async () => {
      // Mock all the select chains properly
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalActions: 100,
              errorActions: 5,
            },
          ]),
        }),
      } as any);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const metrics = await getAllAlertMetrics();

      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeLessThanOrEqual(1);
    });
  });

  describe('clearAlertMetricsCache', () => {
    it('should clear the cache', () => {
      expect(() => clearAlertMetricsCache()).not.toThrow();
    });
  });
});
