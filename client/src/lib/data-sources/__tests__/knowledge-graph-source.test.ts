import { describe, it, expect, beforeEach, vi } from 'vitest';
import { knowledgeGraphSource } from '../knowledge-graph-source';
import { resetFetchMock } from '../../../tests/utils/mock-fetch';

// Mock the USE_MOCK_DATA flag to false so we can test real API paths
vi.mock('../../mock-data', () => ({
  USE_MOCK_DATA: false,
  KnowledgeGraphMockData: {
    generateAll: vi.fn(() => ({
      nodes: [],
      edges: [],
      isMock: true,
    })),
  },
}));

describe('KnowledgeGraphSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchGraph', () => {
    it('should return real data when API succeeds', async () => {
      const mockData = {
        nodes: [
          { id: 'node-1', label: 'Node 1', type: 'pattern' },
          { id: 'node-2', label: 'Node 2', type: 'service' },
        ],
        edges: [{ source: 'node-1', target: 'node-2', type: 'used-by' }],
      };

      (global.fetch as any) = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const result = await knowledgeGraphSource.fetchGraph('7d', 100);

      expect(result.isMock).toBe(false);
      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(result.edges).toBeDefined();
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should return mock data when API fails', async () => {
      (global.fetch as any) = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await knowledgeGraphSource.fetchGraph('7d', 100);

      expect(result.isMock).toBe(true);
      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(result.edges).toBeDefined();
      expect(Array.isArray(result.edges)).toBe(true);
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as any) = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await knowledgeGraphSource.fetchGraph('7d', 100);

      expect(result.isMock).toBe(true);
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
    });
  });
});
