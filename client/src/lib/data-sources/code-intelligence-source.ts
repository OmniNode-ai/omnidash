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
    try {
      const omniarchonUrl = import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || "http://localhost:8053";
      const response = await fetch(`${omniarchonUrl}/api/intelligence/code/analysis?timeWindow=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (data.files_analyzed > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch code analysis from OmniArchon, using mock data', err);
    }

    // Mock data fallback
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
    try {
      const response = await fetch(`/api/intelligence/code/compliance?timeWindow=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        if (data.summary && data.summary.totalFiles > 0) {
          return { data, isMock: false };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch compliance data, using mock data', err);
    }

    // Mock data fallback
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

export const codeIntelligenceSource = new CodeIntelligenceDataSource();

