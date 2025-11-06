// Pattern Learning Data Source
import { USE_MOCK_DATA, PatternLearningMockData } from '../mock-data';

export interface DiscoveredPattern {
  name: string;
  file_path: string;
  createdAt: string;
  metadata?: {
    createdAt: string;
  };
}

export interface PatternSummary {
  totalPatterns: number;
  newPatternsToday: number;
  avgQualityScore: number;
  activeLearningCount: number;
}

export interface PatternTrend {
  period: string;
  manifestsGenerated: number;
  avgPatternsPerManifest: number;
  avgQueryTimeMs: number;
}

export interface QualityTrend {
  period: string;
  avgQuality: number;
  manifestCount: number;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  quality: number;
  usage: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  category: string;
  language?: string | null;
}

export interface LanguageBreakdown {
  language: string;
  count: number;
  percentage: number;
}

class PatternLearningSource {
  /**
   * Fetch pattern summary metrics
   */
  async fetchSummary(timeWindow: string = '24h'): Promise<PatternSummary> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return PatternLearningMockData.generateSummary();
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/summary?timeWindow=${timeWindow}`);
      if (response.ok) {
        const data = await response.json();
        // Transform snake_case API response to camelCase
        return {
          totalPatterns: data.total_patterns || data.totalPatterns || 0,
          newPatternsToday: data.new_patterns_today || data.newPatternsToday || 0,
          avgQualityScore: data.avg_quality_score || data.avgQualityScore || 0,
          activeLearningCount: data.active_learning_count || data.activeLearningCount || 0,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch pattern summary, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic values
    return PatternLearningMockData.generateSummary();
  }

  /**
   * Fetch pattern discovery trends over time
   */
  async fetchTrends(timeWindow: string = '24h'): Promise<PatternTrend[]> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return PatternLearningMockData.generateTrends(20);
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/trends?timeWindow=${timeWindow}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Transform to ensure proper format
          return data.map((item: any) => ({
            period: item.period || new Date().toISOString(),
            manifestsGenerated: item.manifestsGenerated || item.manifests_generated || 0,
            avgPatternsPerManifest: item.avgPatternsPerManifest || item.avg_patterns_per_manifest || 0,
            avgQueryTimeMs: item.avgQueryTimeMs || item.avg_query_time_ms || 0,
          }));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch pattern trends, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic time series
    return PatternLearningMockData.generateTrends(20);
  }

  /**
   * Fetch pattern quality trends over time
   */
  async fetchQualityTrends(timeWindow: string = '24h'): Promise<QualityTrend[]> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return PatternLearningMockData.generateQualityTrends(20);
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/quality-trends?timeWindow=${timeWindow}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Transform to ensure proper format
          return data.map((item: any) => ({
            period: item.period || new Date().toISOString(),
            avgQuality: item.avgQuality || item.avg_quality || 0,
            manifestCount: item.manifestCount || item.manifest_count || 0,
          }));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch quality trends, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic time series
    return PatternLearningMockData.generateQualityTrends(20);
  }

  /**
   * Fetch list of patterns with filtering
   */
  async fetchPatternList(limit: number = 50, timeWindow: string = '24h'): Promise<Pattern[]> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return PatternLearningMockData.generatePatternList(limit);
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/list?limit=${limit}&timeWindow=${timeWindow}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch pattern list, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic patterns
    return PatternLearningMockData.generatePatternList(limit);
  }

  /**
   * Fetch language breakdown statistics
   */
  async fetchLanguageBreakdown(timeWindow: string = '24h'): Promise<LanguageBreakdown[]> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return PatternLearningMockData.generateLanguageBreakdown();
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/by-language?timeWindow=${timeWindow}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Calculate total for percentages
          const total = data.reduce((sum: number, item: any) => {
            return sum + (item.pattern_count || item.count || 0);
          }, 0);

          // Transform snake_case API response to camelCase with percentages
          return data.map((item: any) => {
            const count = item.pattern_count || item.count || 0;
            return {
              language: item.language || 'unknown',
              count,
              percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
            };
          });
        }
      }
    } catch (err) {
      console.warn('Failed to fetch language breakdown, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic language distribution
    return PatternLearningMockData.generateLanguageBreakdown();
  }

  /**
   * Fetch recently discovered patterns
   */
  async fetchDiscovery(limit: number = 8): Promise<{ data: DiscoveredPattern[]; isMock: boolean }> {
    // Return comprehensive mock data if USE_MOCK_DATA is enabled
    if (USE_MOCK_DATA) {
      return { data: PatternLearningMockData.generateDiscoveredPatterns(limit), isMock: true };
    }

    try {
      const response = await fetch(`/api/intelligence/patterns/discovery?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        return {
          data: data.map((p: any) => ({
            name: p.name,
            file_path: p.file_path,
            metadata: { createdAt: p.createdAt },
            createdAt: p.createdAt,
          })),
          isMock: false,
        };
      }
    } catch (err) {
      console.warn('Failed to fetch pattern discovery, using mock data', err);
    }

    // Mock fallback - use mock data generator for realistic discovered patterns
    return {
      data: PatternLearningMockData.generateDiscoveredPatterns(limit),
      isMock: true,
    };
  }
}

export const patternLearningSource = new PatternLearningSource();



