import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pattern } from '../pattern-learning-source';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

// Mock the USE_MOCK_DATA flag to false so we can test real API paths
vi.mock('../../mock-data', () => ({
  USE_MOCK_DATA: false,
  PatternLearningMockData: {
    generateSummary: vi.fn(() => ({
      totalPatterns: 1000,
      newPatternsToday: 50,
      avgQualityScore: 0.8,
      activeLearningCount: 10,
    })),
    generateTrends: vi.fn((count: number) =>
      Array(count).fill({
        period: new Date().toISOString(),
        manifestsGenerated: 10,
        avgPatternsPerManifest: 5,
        avgQueryTimeMs: 100,
      })
    ),
    generateQualityTrends: vi.fn((count: number) =>
      Array(count).fill({
        period: new Date().toISOString(),
        avgQuality: 0.8,
        manifestCount: 10,
      })
    ),
    generatePatternList: vi.fn((limit: number) =>
      Array(limit).fill({
        id: 'pattern-1',
        name: 'Pattern',
        description: 'Description',
        quality: 0.8,
        usage: 10,
        trend: 'stable' as const,
        trendPercentage: 0,
        category: 'Category',
        language: 'TypeScript',
      })
    ),
    generateLanguageBreakdown: vi.fn(() => [
      { language: 'TypeScript', count: 100, percentage: 50 },
      { language: 'JavaScript', count: 100, percentage: 50 },
    ]),
    generateDiscoveredPatterns: vi.fn((limit: number) =>
      Array(limit).fill({
        name: 'Pattern',
        file_path: '/path/to/pattern.ts',
        createdAt: new Date().toISOString(),
      })
    ),
  },
}));

import { patternLearningSource } from '../pattern-learning-source';

describe('PatternLearningSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchSummary', () => {
    it('should fetch pattern summary from API with snake_case transformation', async () => {
      const mockApiResponse = {
        total_patterns: 25432,
        new_patterns_today: 142,
        avg_quality_score: 0.87,
        active_learning_count: 12,
      };

      setupFetchMock(
        new Map([['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchSummary('24h');

      expect(result.totalPatterns).toBe(25432);
      expect(result.newPatternsToday).toBe(142);
      expect(result.avgQualityScore).toBe(0.87);
      expect(result.activeLearningCount).toBe(12);
    });

    it('should handle already camelCased API response', async () => {
      const mockApiResponse = {
        totalPatterns: 25432,
        newPatternsToday: 142,
        avgQualityScore: 0.87,
        activeLearningCount: 12,
      };

      setupFetchMock(
        new Map([['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchSummary('24h');

      expect(result.totalPatterns).toBe(25432);
      expect(result.newPatternsToday).toBe(142);
      expect(result.avgQualityScore).toBe(0.87);
      expect(result.activeLearningCount).toBe(12);
    });

    it('should handle missing fields with defaults', async () => {
      const mockApiResponse = {};

      setupFetchMock(
        new Map([['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchSummary('24h');

      expect(result.totalPatterns).toBe(0);
      expect(result.newPatternsToday).toBe(0);
      expect(result.avgQualityScore).toBe(0);
      expect(result.activeLearningCount).toBe(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/summary', createMockResponse(null, { status: 500 })]])
      );

      const result = await patternLearningSource.fetchSummary('24h');

      // Mock data should return realistic values
      expect(result.totalPatterns).toBeGreaterThanOrEqual(0);
      expect(result.newPatternsToday).toBeGreaterThanOrEqual(0);
      expect(result.avgQualityScore).toBeGreaterThanOrEqual(0);
      expect(result.activeLearningCount).toBeGreaterThanOrEqual(0);
    });

    it('should include timeWindow parameter in API request', async () => {
      const mockResponse = {
        total_patterns: 100,
        new_patterns_today: 10,
        avg_quality_score: 0.8,
        active_learning_count: 5,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary?timeWindow=7d', createMockResponse(mockResponse)],
        ])
      );

      await patternLearningSource.fetchSummary('7d');

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('timeWindow=7d'));
    });

    it('should handle network errors gracefully', async () => {
      setupFetchMock(new Map([['/api/intelligence/patterns/summary', new Error('Network error')]]));

      const result = await patternLearningSource.fetchSummary('24h');

      // Should fall back to mock data
      expect(result).toBeDefined();
      expect(result.totalPatterns).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fetchTrends', () => {
    it('should fetch pattern trends from API with snake_case transformation', async () => {
      const mockApiResponse = [
        {
          period: '2024-01-01T12:00:00Z',
          manifests_generated: 45,
          avg_patterns_per_manifest: 8.5,
          avg_query_time_ms: 125,
        },
        {
          period: '2024-01-01T13:00:00Z',
          manifests_generated: 52,
          avg_patterns_per_manifest: 9.2,
          avg_query_time_ms: 115,
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/trends', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchTrends('24h');

      expect(result.length).toBe(2);
      expect(result[0].period).toBe('2024-01-01T12:00:00Z');
      expect(result[0].manifestsGenerated).toBe(45);
      expect(result[0].avgPatternsPerManifest).toBe(8.5);
      expect(result[0].avgQueryTimeMs).toBe(125);
    });

    it('should handle camelCase API response', async () => {
      const mockApiResponse = [
        {
          period: '2024-01-01T12:00:00Z',
          manifestsGenerated: 45,
          avgPatternsPerManifest: 8.5,
          avgQueryTimeMs: 125,
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/trends', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchTrends('24h');

      expect(result[0].manifestsGenerated).toBe(45);
      expect(result[0].avgPatternsPerManifest).toBe(8.5);
      expect(result[0].avgQueryTimeMs).toBe(125);
    });

    it('should handle missing fields with defaults and current timestamp', async () => {
      const mockApiResponse = [
        {
          period: null,
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/trends', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchTrends('24h');

      expect(result.length).toBe(1);
      // Should use current date as fallback
      const parsedDate = new Date(result[0].period);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
      expect(result[0].manifestsGenerated).toBe(0);
      expect(result[0].avgPatternsPerManifest).toBe(0);
      expect(result[0].avgQueryTimeMs).toBe(0);
    });

    it('should return mock data when API returns empty array', async () => {
      setupFetchMock(new Map([['/api/intelligence/patterns/trends', createMockResponse([])]]));

      const result = await patternLearningSource.fetchTrends('24h');

      // Should fall back to mock data
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/trends', createMockResponse(null, { status: 500 })]])
      );

      const result = await patternLearningSource.fetchTrends('24h');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('manifestsGenerated');
      expect(result[0]).toHaveProperty('avgPatternsPerManifest');
      expect(result[0]).toHaveProperty('avgQueryTimeMs');
    });
  });

  describe('fetchQualityTrends', () => {
    it('should fetch quality trends from API with snake_case transformation', async () => {
      const mockApiResponse = [
        {
          period: '2024-01-01T12:00:00Z',
          avg_quality: 0.85,
          manifest_count: 42,
        },
        {
          period: '2024-01-01T13:00:00Z',
          avg_quality: 0.89,
          manifest_count: 38,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/quality-trends', createMockResponse(mockApiResponse)],
        ])
      );

      const result = await patternLearningSource.fetchQualityTrends('24h');

      expect(result.length).toBe(2);
      expect(result[0].period).toBe('2024-01-01T12:00:00Z');
      expect(result[0].avgQuality).toBe(0.85);
      expect(result[0].manifestCount).toBe(42);
    });

    it('should handle camelCase API response', async () => {
      const mockApiResponse = [
        {
          period: '2024-01-01T12:00:00Z',
          avgQuality: 0.85,
          manifestCount: 42,
        },
      ];

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/quality-trends', createMockResponse(mockApiResponse)],
        ])
      );

      const result = await patternLearningSource.fetchQualityTrends('24h');

      expect(result[0].avgQuality).toBe(0.85);
      expect(result[0].manifestCount).toBe(42);
    });

    it('should return mock data when API returns empty array', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/quality-trends', createMockResponse([])]])
      );

      const result = await patternLearningSource.fetchQualityTrends('24h');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/quality-trends', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await patternLearningSource.fetchQualityTrends('24h');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('avgQuality');
      expect(result[0]).toHaveProperty('manifestCount');
    });
  });

  describe('fetchPatternList', () => {
    it('should fetch pattern list from API', async () => {
      const mockPatterns: Pattern[] = [
        {
          id: 'pattern-1',
          name: 'Component Pattern',
          description: 'Reusable React component',
          quality: 0.92,
          usage: 156,
          trend: 'up',
          trendPercentage: 12.5,
          category: 'React',
          language: 'TypeScript',
        },
        {
          id: 'pattern-2',
          name: 'API Handler',
          description: 'Express route handler',
          quality: 0.88,
          usage: 89,
          trend: 'stable',
          trendPercentage: 0,
          category: 'Backend',
          language: 'JavaScript',
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/list', createMockResponse(mockPatterns)]])
      );

      const result = await patternLearningSource.fetchPatternList(50, '24h');

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('pattern-1');
      expect(result[0].name).toBe('Component Pattern');
      expect(result[1].trend).toBe('stable');
    });

    it('should handle limit parameter', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/list?limit=10&timeWindow=24h', createMockResponse([])],
        ])
      );

      await patternLearningSource.fetchPatternList(10, '24h');

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'));
    });

    it('should return mock data when API returns empty array', async () => {
      setupFetchMock(new Map([['/api/intelligence/patterns/list', createMockResponse([])]]));

      const result = await patternLearningSource.fetchPatternList(50, '24h');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/list', createMockResponse(null, { status: 500 })]])
      );

      const result = await patternLearningSource.fetchPatternList(25, '24h');

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(25);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
    });
  });

  describe('fetchLanguageBreakdown', () => {
    it('should fetch language breakdown from API with percentage calculation', async () => {
      const mockApiResponse = [
        { language: 'TypeScript', pattern_count: 150 },
        { language: 'JavaScript', pattern_count: 100 },
        { language: 'Python', pattern_count: 50 },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/by-language', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result.length).toBe(3);

      // TypeScript: 150 / 300 = 50%
      expect(result[0].language).toBe('TypeScript');
      expect(result[0].count).toBe(150);
      expect(result[0].percentage).toBe(50);

      // JavaScript: 100 / 300 = 33.3%
      expect(result[1].language).toBe('JavaScript');
      expect(result[1].count).toBe(100);
      expect(result[1].percentage).toBe(33.3);

      // Python: 50 / 300 = 16.7%
      expect(result[2].language).toBe('Python');
      expect(result[2].count).toBe(50);
      expect(result[2].percentage).toBe(16.7);
    });

    it('should handle camelCase count field', async () => {
      const mockApiResponse = [
        { language: 'TypeScript', count: 150 },
        { language: 'JavaScript', count: 50 },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/by-language', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result.length).toBe(2);
      expect(result[0].count).toBe(150);
      expect(result[0].percentage).toBe(75); // 150/200 = 75%
    });

    it('should handle missing language field with unknown', async () => {
      const mockApiResponse = [{ pattern_count: 100 }];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/by-language', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result[0].language).toBe('unknown');
      expect(result[0].count).toBe(100);
      expect(result[0].percentage).toBe(100);
    });

    it('should handle zero total with zero percentages', async () => {
      const mockApiResponse = [{ language: 'TypeScript', pattern_count: 0 }];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/by-language', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result[0].percentage).toBe(0);
    });

    it('should return mock data when API returns empty array', async () => {
      setupFetchMock(new Map([['/api/intelligence/patterns/by-language', createMockResponse([])]]));

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/by-language', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await patternLearningSource.fetchLanguageBreakdown('24h');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('language');
      expect(result[0]).toHaveProperty('count');
      expect(result[0]).toHaveProperty('percentage');
    });
  });

  describe('fetchDiscovery', () => {
    it('should fetch discovered patterns from API with isMock flag false', async () => {
      const mockApiResponse = [
        {
          name: 'Authentication Pattern',
          file_path: '/src/auth/pattern.ts',
          createdAt: '2024-01-01T12:00:00Z',
        },
        {
          name: 'Data Fetching Pattern',
          file_path: '/src/api/pattern.ts',
          createdAt: '2024-01-01T13:00:00Z',
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/discovery', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchDiscovery(8);

      expect(result.isMock).toBe(false);
      expect(result.data.length).toBe(2);
      expect(result.data[0].name).toBe('Authentication Pattern');
      expect(result.data[0].file_path).toBe('/src/auth/pattern.ts');
      expect(result.data[0].createdAt).toBe('2024-01-01T12:00:00Z');
      expect(result.data[0].metadata?.createdAt).toBe('2024-01-01T12:00:00Z');
    });

    it('should handle limit parameter', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/discovery?limit=5', createMockResponse([])]])
      );

      await patternLearningSource.fetchDiscovery(5);

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
    });

    it('should return mock data with isMock flag true when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/discovery', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await patternLearningSource.fetchDiscovery(8);

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty('name');
      expect(result.data[0]).toHaveProperty('file_path');
      expect(result.data[0]).toHaveProperty('createdAt');
    });

    it('should return mock data when API throws error', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/discovery', new Error('Network error')]])
      );

      const result = await patternLearningSource.fetchDiscovery(8);

      expect(result.isMock).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should properly transform API response to include metadata', async () => {
      const mockApiResponse = [
        {
          name: 'Test Pattern',
          file_path: '/test.ts',
          createdAt: '2024-01-01T10:00:00Z',
        },
      ];

      setupFetchMock(
        new Map([['/api/intelligence/patterns/discovery', createMockResponse(mockApiResponse)]])
      );

      const result = await patternLearningSource.fetchDiscovery(1);

      expect(result.data[0].metadata).toBeDefined();
      expect(result.data[0].metadata?.createdAt).toBe('2024-01-01T10:00:00Z');
      expect(result.data[0].createdAt).toBe('2024-01-01T10:00:00Z');
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed JSON gracefully in fetchTrends', async () => {
      const malformedResponse = new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      setupFetchMock(new Map([['/api/intelligence/patterns/trends', malformedResponse]]));

      const result = await patternLearningSource.fetchTrends('24h');

      // Should fall back to mock data on parse error
      expect(result.length).toBeGreaterThan(0);
    });

    it('should use default parameters when not provided', async () => {
      const mockResponse = {
        total_patterns: 100,
        new_patterns_today: 10,
        avg_quality_score: 0.8,
        active_learning_count: 5,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary?timeWindow=24h', createMockResponse(mockResponse)],
        ])
      );

      await patternLearningSource.fetchSummary(); // No parameter, should default to '24h'

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('timeWindow=24h'));
    });

    it('should handle 404 responses gracefully', async () => {
      setupFetchMock(
        new Map([['/api/intelligence/patterns/list', createMockResponse(null, { status: 404 })]])
      );

      const result = await patternLearningSource.fetchPatternList(10, '24h');

      // Should fall back to mock data
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
