import { USE_MOCK_DATA } from '../mock-data/config';
import { fallbackChain, ensureNumeric, ensureEnvVar } from '../defensive-transform-logger';
import {
  codeAnalysisDataSchema,
  complianceDataSchema,
  patternSummarySchema,
  safeParseResponse,
} from '../schemas/api-response-schemas';

export interface CodeAnalysisData {
  files_analyzed: number;
  avg_complexity: number;
  code_smells: number;
  security_issues: number;
  complexity_trend?: Array<{
    timestamp: string;
    value: number;
  }>;
  quality_trend?: Array<{
    timestamp: string;
    value: number;
  }>;
}

export interface ComplianceData {
  summary: {
    totalFiles: number;
    compliantFiles: number;
    nonCompliantFiles: number;
    pendingFiles: number;
    compliancePercentage: number;
    avgComplianceScore: number;
  };
  statusBreakdown: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  nodeTypeBreakdown: Array<{
    nodeType: string;
    compliantCount: number;
    totalCount: number;
    percentage: number;
  }>;
  trend: Array<{
    period: string;
    compliancePercentage: number;
    totalFiles: number;
  }>;
}

export interface CodeIntelligenceData {
  codeAnalysis: CodeAnalysisData;
  compliance: ComplianceData;
  isMock: boolean;
}

class CodeIntelligenceDataSource {
  async fetchCodeAnalysis(timeRange: string): Promise<{ data: CodeAnalysisData; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          files_analyzed: 1250,
          avg_complexity: 7.2,
          code_smells: 23,
          security_issues: 2,
          complexity_trend: [],
          quality_trend: [],
        },
        isMock: true,
      };
    }

    try {
      const omniarchonUrl = ensureEnvVar(
        'VITE_INTELLIGENCE_SERVICE_URL',
        'http://localhost:8053',
        'debug'
      );
      const response = await fetch(`${omniarchonUrl}/api/intelligence/code/analysis?timeWindow=${timeRange}`);
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(codeAnalysisDataSchema, rawData, 'code-analysis');
        if (data && data.files_analyzed > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch code analysis from OmniArchon, using mock data', err);
    }

    // Static mock data fallback - always returns predictable values for tests
    return {
      data: {
        files_analyzed: 1250,
        avg_complexity: 7.2,
        code_smells: 23,
        security_issues: 2,
        complexity_trend: [],
        quality_trend: [],
      },
      isMock: true,
    };
  }

  async fetchCompliance(timeRange: string): Promise<{ data: ComplianceData; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          summary: {
            totalFiles: 150,
            compliantFiles: 120,
            nonCompliantFiles: 25,
            pendingFiles: 5,
            compliancePercentage: 80.0,
            avgComplianceScore: 0.85,
          },
          statusBreakdown: [
            { status: "compliant", count: 120, percentage: 80.0 },
            { status: "non_compliant", count: 25, percentage: 16.7 },
            { status: "pending", count: 5, percentage: 3.3 },
          ],
          nodeTypeBreakdown: [],
          trend: [],
        },
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/intelligence/code/compliance?timeWindow=${timeRange}`);
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(complianceDataSchema, rawData, 'compliance-data');
        if (data && data.summary && data.summary.totalFiles > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch compliance data, using mock data', err);
    }

    // Static mock data fallback - always returns predictable values for tests
    return {
      data: {
        summary: {
          totalFiles: 150,
          compliantFiles: 120,
          nonCompliantFiles: 25,
          pendingFiles: 5,
          compliancePercentage: 80.0,
          avgComplianceScore: 0.85,
        },
        statusBreakdown: [
          { status: "compliant", count: 120, percentage: 80.0 },
          { status: "non_compliant", count: 25, percentage: 16.7 },
          { status: "pending", count: 5, percentage: 3.3 },
        ],
        nodeTypeBreakdown: [],
        trend: [],
      },
      isMock: true,
    };
  }

  async fetchPatternSummary(): Promise<{ data: PatternSummary; isMock: boolean }> {
    // In test environment, skip USE_MOCK_DATA check to allow test mocks to work
    const isTestEnv = import.meta.env.VITEST === 'true' || import.meta.env.VITEST === true;

    // Return comprehensive mock data if USE_MOCK_DATA is enabled (but not in tests)
    if (USE_MOCK_DATA && !isTestEnv) {
      return {
        data: {
          totalPatterns: 125,
          activePatterns: 98,
          qualityScore: 8.5,
          usageCount: 1247,
          recentDiscoveries: 3,
          topPatterns: [
            { id: '1', name: 'OAuth Authentication', category: 'Security', quality: 0.95, usage: 45 },
            { id: '2', name: 'Database Connection Pool', category: 'Data', quality: 0.92, usage: 32 },
            { id: '3', name: 'Error Handling Middleware', category: 'Error', quality: 0.89, usage: 28 },
          ],
        },
        isMock: true,
      };
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/summary`);
      if (response.ok) {
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = safeParseResponse(patternSummarySchema, rawData, 'pattern-summary-code-intel');
        if (data) {
          return {
            data: {
              totalPatterns: ensureNumeric(
                'totalPatterns',
                data.totalPatterns,
                0,
                { context: 'pattern-summary' }
              ),
              activePatterns: ensureNumeric(
                'activeLearningCount',
                data.activeLearningCount,
                0,
                { context: 'pattern-summary' }
              ),
              qualityScore: ensureNumeric(
                'avgQualityScore',
                data.avgQualityScore,
                0,
                { context: 'pattern-summary' }
              ) * 10,
              usageCount: 0,
              recentDiscoveries: ensureNumeric(
                'newPatternsToday',
                data.newPatternsToday,
                0,
                { context: 'pattern-summary' }
              ),
              topPatterns: [],
            },
            isMock: false,
          };
        }
        // If response is ok but validation failed, return empty data with isMock: false
        // This handles cases where API returns empty object or missing fields
        return {
          data: {
            totalPatterns: ensureNumeric('totalPatterns', rawData?.totalPatterns, 0, { context: 'pattern-summary' }),
            activePatterns: ensureNumeric('activeLearningCount', rawData?.activeLearningCount, 0, { context: 'pattern-summary' }),
            qualityScore: ensureNumeric('avgQualityScore', rawData?.avgQualityScore, 0, { context: 'pattern-summary' }) * 10,
            usageCount: 0,
            recentDiscoveries: ensureNumeric('newPatternsToday', rawData?.newPatternsToday, 0, { context: 'pattern-summary' }),
            topPatterns: [],
          },
          isMock: false,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch pattern summary, using mock data', err);
    }

    return {
      data: {
        totalPatterns: 125,
        activePatterns: 98,
        qualityScore: 8.5,
        usageCount: 1247,
        recentDiscoveries: 3,
        topPatterns: [
          { id: '1', name: 'OAuth Authentication', category: 'Security', quality: 0.95, usage: 45 },
          { id: '2', name: 'Database Connection Pool', category: 'Data', quality: 0.92, usage: 32 },
          { id: '3', name: 'Error Handling Middleware', category: 'Error', quality: 0.89, usage: 28 },
        ],
      },
      isMock: true,
    };
  }

  async fetchAll(timeRange: string): Promise<CodeIntelligenceData> {
    const [codeAnalysis, compliance] = await Promise.all([
      this.fetchCodeAnalysis(timeRange),
      this.fetchCompliance(timeRange),
    ]);

    return {
      codeAnalysis: codeAnalysis.data,
      compliance: compliance.data,
      isMock: codeAnalysis.isMock || compliance.isMock,
    };
  }
}

export interface PatternSummary {
  totalPatterns: number;
  activePatterns: number;
  qualityScore: number;
  usageCount: number;
  recentDiscoveries: number;
  topPatterns: Array<{
    id: string;
    name: string;
    category: string;
    quality: number;
    usage: number;
  }>;
}

export const codeIntelligenceSource = new CodeIntelligenceDataSource();

