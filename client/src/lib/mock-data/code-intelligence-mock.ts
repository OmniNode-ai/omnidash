/**
 * Mock Data Generator for Code Intelligence Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type { CodeAnalysisData, ComplianceData } from '../data-sources/code-intelligence-source';

export class CodeIntelligenceMockData {
  /**
   * Generate mock code analysis data
   */
  static generateCodeAnalysis(): CodeAnalysisData {
    const filesAnalyzed = Gen.randomInt(800, 2000);
    const avgComplexity = Gen.randomFloat(5.0, 12.0, 1);
    const codeSmells = Gen.randomInt(10, 80);
    const securityIssues = Gen.randomInt(0, 15);

    // Generate complexity trend (last 20 data points)
    const complexityTrend = Gen.generateTimeSeries(20, 4.0, 13.0, 60).map((point) => ({
      timestamp: new Date(
        Date.now() - (19 - Gen.generateTimeSeries(20, 0, 0, 0).indexOf(point)) * 3600000
      ).toISOString(),
      value: point.value,
    }));

    // Generate quality trend (last 20 data points)
    const qualityTrend = Gen.generateTimeSeries(20, 60, 95, 60).map((point) => ({
      timestamp: new Date(
        Date.now() - (19 - Gen.generateTimeSeries(20, 0, 0, 0).indexOf(point)) * 3600000
      ).toISOString(),
      value: point.value,
    }));

    return {
      files_analyzed: filesAnalyzed,
      avg_complexity: avgComplexity,
      code_smells: codeSmells,
      security_issues: securityIssues,
      complexity_trend: complexityTrend,
      quality_trend: qualityTrend,
    };
  }

  /**
   * Generate mock compliance data
   */
  static generateCompliance(): ComplianceData {
    const totalFiles = Gen.randomInt(100, 300);
    const compliantFiles = Math.floor(totalFiles * Gen.randomFloat(0.7, 0.9));
    const nonCompliantFiles = Math.floor(totalFiles * Gen.randomFloat(0.05, 0.2));
    const pendingFiles = totalFiles - compliantFiles - nonCompliantFiles;
    const compliancePercentage = parseFloat(
      ((compliantFiles / totalFiles) * 100).toFixed(1)
    );
    const avgComplianceScore = Gen.randomFloat(0.75, 0.92, 2);

    // Status breakdown
    const statusBreakdown = [
      {
        status: 'compliant',
        count: compliantFiles,
        percentage: parseFloat(((compliantFiles / totalFiles) * 100).toFixed(1)),
      },
      {
        status: 'non_compliant',
        count: nonCompliantFiles,
        percentage: parseFloat(((nonCompliantFiles / totalFiles) * 100).toFixed(1)),
      },
      {
        status: 'pending',
        count: pendingFiles,
        percentage: parseFloat(((pendingFiles / totalFiles) * 100).toFixed(1)),
      },
    ];

    // Node type breakdown
    const nodeTypes = ['Module', 'Class', 'Function', 'Method', 'Variable'];
    const nodeTypeBreakdown = nodeTypes.map((nodeType) => {
      const totalCount = Gen.randomInt(50, 200);
      const compliantCount = Math.floor(totalCount * Gen.randomFloat(0.7, 0.95));
      return {
        nodeType,
        compliantCount,
        totalCount,
        percentage: parseFloat(((compliantCount / totalCount) * 100).toFixed(1)),
      };
    });

    // Compliance trend (last 30 days)
    const trend = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      trend.push({
        period: date.toISOString(),
        compliancePercentage: Gen.randomFloat(70, 90, 1),
        totalFiles: Gen.randomInt(90, 110),
      });
    }

    return {
      summary: {
        totalFiles,
        compliantFiles,
        nonCompliantFiles,
        pendingFiles,
        compliancePercentage,
        avgComplianceScore,
      },
      statusBreakdown,
      nodeTypeBreakdown,
      trend,
    };
  }

  /**
   * Generate complete code intelligence data
   */
  static generateAll() {
    return {
      codeAnalysis: this.generateCodeAnalysis(),
      compliance: this.generateCompliance(),
      isMock: true,
    };
  }
}
