import { describe, it, expect, beforeEach, vi } from 'vitest';
import { codeIntelligenceSource } from '../code-intelligence-source';
import type { CodeAnalysisData, ComplianceData, PatternSummary } from '../code-intelligence-source';
import { createMockResponse, setupFetchMock, resetFetchMock } from '../../../tests/utils/mock-fetch';

describe('CodeIntelligenceDataSource', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('fetchCodeAnalysis', () => {
    it('should return real code analysis from OmniArchon', async () => {
      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 1000,
        avg_complexity: 7.5,
        code_smells: 15,
        security_issues: 2,
        complexity_trend: [
          { timestamp: '2024-01-01T12:00:00Z', value: 7.0 },
          { timestamp: '2024-01-01T13:00:00Z', value: 7.5 },
        ],
        quality_trend: [
          { timestamp: '2024-01-01T12:00:00Z', value: 85 },
          { timestamp: '2024-01-01T13:00:00Z', value: 88 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockAnalysis);
      expect(result.data.files_analyzed).toBe(1000);
      expect(result.data.complexity_trend).toHaveLength(2);
      expect(result.data.quality_trend).toHaveLength(2);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['http://localhost:8053/api/intelligence/code/analysis', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.files_analyzed).toBe(1250);
      expect(result.data.avg_complexity).toBe(7.2);
      expect(result.data.code_smells).toBe(23);
      expect(result.data.security_issues).toBe(2);
    });

    it('should return mock data when files_analyzed is 0', async () => {
      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 0,
        avg_complexity: 0,
        code_smells: 0,
        security_issues: 0,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.files_analyzed).toBe(1250);
    });

    it('should handle network errors and return mock data', async () => {
      setupFetchMock(
        new Map([
          ['http://localhost:8053/api/intelligence/code/analysis', new Error('Network error')],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.files_analyzed).toBe(1250);
    });

    it('should use custom OmniArchon URL from environment', async () => {
      const originalEnv = import.meta.env.VITE_INTELLIGENCE_SERVICE_URL;
      import.meta.env.VITE_INTELLIGENCE_SERVICE_URL = 'http://custom-host:9000';

      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 3000,
        avg_complexity: 5.5,
        code_smells: 10,
        security_issues: 0,
      };

      setupFetchMock(
        new Map([
          ['custom-host:9000/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('7d');

      expect(result.isMock).toBe(false);
      expect(result.data.files_analyzed).toBe(3000);

      // Restore original env
      import.meta.env.VITE_INTELLIGENCE_SERVICE_URL = originalEnv;
    });
  });

  describe('fetchCompliance', () => {
    it('should return real compliance data', async () => {
      const mockCompliance: ComplianceData = {
        summary: {
          totalFiles: 1000,
          compliantFiles: 920,
          nonCompliantFiles: 50,
          pendingFiles: 30,
          compliancePercentage: 92,
          avgComplianceScore: 0.92,
        },
        statusBreakdown: [
          { status: 'compliant', count: 920, percentage: 92 },
          { status: 'non_compliant', count: 50, percentage: 5 },
          { status: 'pending', count: 30, percentage: 3 },
        ],
        nodeTypeBreakdown: [
          { nodeType: 'Effect', compliantCount: 50, totalCount: 60, percentage: 83.3 },
          { nodeType: 'Compute', compliantCount: 45, totalCount: 50, percentage: 90.0 },
        ],
        trend: [
          { period: '2024-01-01', compliancePercentage: 85.0, totalFiles: 900 },
          { period: '2024-01-02', compliancePercentage: 92.0, totalFiles: 1000 },
        ],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(mockCompliance)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockCompliance);
      expect(result.data.summary.totalFiles).toBe(1000);
      expect(result.data.statusBreakdown).toHaveLength(3);
      expect(result.data.nodeTypeBreakdown).toHaveLength(2);
      expect(result.data.trend).toHaveLength(2);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.summary.totalFiles).toBe(150);
      expect(result.data.summary.compliantFiles).toBe(120);
      expect(result.data.summary.compliancePercentage).toBe(80.0);
    });

    it('should return mock data when totalFiles is 0', async () => {
      const mockCompliance: ComplianceData = {
        summary: {
          totalFiles: 0,
          compliantFiles: 0,
          nonCompliantFiles: 0,
          pendingFiles: 0,
          compliancePercentage: 0,
          avgComplianceScore: 0,
        },
        statusBreakdown: [],
        nodeTypeBreakdown: [],
        trend: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(mockCompliance)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.summary.totalFiles).toBe(150);
    });

    it('should handle missing summary field and fall back to mock data', async () => {
      const invalidData = {
        statusBreakdown: [],
        nodeTypeBreakdown: [],
        trend: [],
        // Missing required 'summary' field - validation should fail
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(invalidData)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      // Validation fails due to missing summary, so it falls back to mock data
      expect(result.isMock).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalFiles).toBeGreaterThanOrEqual(0);
    });

    it('should handle network errors', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', new Error('Connection refused')],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('7d');

      expect(result.isMock).toBe(true);
      expect(result.data.summary).toBeDefined();
    });
  });

  describe('fetchPatternSummary', () => {
    it('should return real pattern summary', async () => {
      // Mock API response format (not PatternSummary - that's what the source returns)
      const mockApiResponse = {
        totalPatterns: 125,
        activeLearningCount: 98,
        avgQualityScore: 0.87, // API returns 0-1, source multiplies by 10
        newPatternsToday: 5,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.isMock).toBe(false);
      // Check transformed fields
      expect(result.data.totalPatterns).toBe(125);
      expect(result.data.activePatterns).toBe(98); // From activeLearningCount
      expect(result.data.qualityScore).toBe(8.7); // avgQualityScore (0.87) * 10
      expect(result.data.recentDiscoveries).toBe(5); // From newPatternsToday
      expect(result.data.usageCount).toBe(0); // Not provided by API
      expect(result.data.topPatterns).toEqual([]); // Not provided by API
    });

    it('should handle missing fields in API response', async () => {
      const mockApiResponse = {};

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.isMock).toBe(false);
      expect(result.data.totalPatterns).toBe(0);
      expect(result.data.activePatterns).toBe(0);
      expect(result.data.qualityScore).toBe(0);
      expect(result.data.recentDiscoveries).toBe(0);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.isMock).toBe(true);
      expect(result.data.totalPatterns).toBe(125);
      expect(result.data.activePatterns).toBe(98);
      expect(result.data.qualityScore).toBe(8.5);
      expect(result.data.usageCount).toBe(1247);
      expect(result.data.topPatterns).toHaveLength(3);
    });

    it('should include top patterns in mock data', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', new Error('Network error')],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.isMock).toBe(true);
      expect(result.data.topPatterns).toHaveLength(3);
      expect(result.data.topPatterns[0]).toHaveProperty('id');
      expect(result.data.topPatterns[0]).toHaveProperty('name');
      expect(result.data.topPatterns[0]).toHaveProperty('category');
      expect(result.data.topPatterns[0]).toHaveProperty('quality');
      expect(result.data.topPatterns[0]).toHaveProperty('usage');
    });

    it('should transform quality score correctly', async () => {
      const mockApiResponse = {
        totalPatterns: 100,
        activeLearningCount: 75,
        avgQualityScore: 0.95,
        newPatternsToday: 2,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', createMockResponse(mockApiResponse)],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.data.qualityScore).toBe(9.5); // 0.95 * 10
    });
  });

  describe('fetchAll', () => {
    it('should combine all data sources', async () => {
      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 1000,
        avg_complexity: 7.5,
        code_smells: 15,
        security_issues: 2,
      };
      const mockCompliance: ComplianceData = {
        summary: {
          totalFiles: 1000,
          compliantFiles: 920,
          nonCompliantFiles: 50,
          pendingFiles: 30,
          compliancePercentage: 92,
          avgComplianceScore: 0.92,
        },
        statusBreakdown: [],
        nodeTypeBreakdown: [],
        trend: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
          ['/api/intelligence/code/compliance', createMockResponse(mockCompliance)],
        ])
      );

      const result = await codeIntelligenceSource.fetchAll('24h');

      expect(result.codeAnalysis).toEqual(mockAnalysis);
      expect(result.compliance).toEqual(mockCompliance);
      expect(result.isMock).toBe(false);
    });

    it('should mark as mock if any source fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(null, { status: 500 })],
          ['/api/intelligence/code/compliance', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
      expect(result.codeAnalysis).toBeDefined();
      expect(result.compliance).toBeDefined();
      // Both failed, so we get mock data
      expect(result.codeAnalysis.files_analyzed).toBe(1250);
      expect(result.compliance.summary.totalFiles).toBe(150);
    });

    it('should fetch both data sources in parallel', async () => {
      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 2000,
        avg_complexity: 7.0,
        code_smells: 25,
        security_issues: 1,
      };

      const mockCompliance: ComplianceData = {
        summary: {
          totalFiles: 200,
          compliantFiles: 180,
          nonCompliantFiles: 15,
          pendingFiles: 5,
          compliancePercentage: 90.0,
          avgComplianceScore: 0.92,
        },
        statusBreakdown: [],
        nodeTypeBreakdown: [],
        trend: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
          ['/api/intelligence/code/compliance', createMockResponse(mockCompliance)],
        ])
      );

      const startTime = Date.now();
      const result = await codeIntelligenceSource.fetchAll('24h');
      const duration = Date.now() - startTime;

      // Parallel execution should complete reasonably quickly (< 1000ms for mock data)
      expect(duration).toBeLessThan(1000);
      expect(result.codeAnalysis).toBeDefined();
      expect(result.compliance).toBeDefined();
    });
  });
});

