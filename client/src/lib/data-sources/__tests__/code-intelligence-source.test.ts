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
        complexity_trend: [],
        quality_trend: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockAnalysis);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchCodeAnalysis('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.files_analyzed).toBe(1250);
      expect(result.data.avg_complexity).toBe(7.2);
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
        nodeTypeBreakdown: [],
        trend: [],
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(mockCompliance)],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      expect(result.isMock).toBe(false);
      expect(result.data).toEqual(mockCompliance);
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/code/compliance', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchCompliance('24h');

      expect(result.isMock).toBe(true);
      expect(result.data.summary.totalFiles).toBeGreaterThan(0);
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
    });

    it('should return mock data when API fails', async () => {
      setupFetchMock(
        new Map([
          ['/api/intelligence/patterns/summary', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchPatternSummary();

      expect(result.isMock).toBe(true);
      expect(result.data.totalPatterns).toBeGreaterThan(0);
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
      const mockAnalysis: CodeAnalysisData = {
        files_analyzed: 1000,
        avg_complexity: 7.5,
        code_smells: 15,
        security_issues: 2,
      };

      setupFetchMock(
        new Map([
          ['/api/intelligence/code/analysis', createMockResponse(mockAnalysis)],
          ['/api/intelligence/code/compliance', createMockResponse(null, { status: 500 })],
        ])
      );

      const result = await codeIntelligenceSource.fetchAll('24h');

      expect(result.isMock).toBe(true);
    });
  });
});

