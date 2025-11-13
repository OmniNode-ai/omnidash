// Pattern Learning Data Source
import { USE_MOCK_DATA, PatternLearningMockData } from '../mock-data';
import { fallbackChain, withFallback, ensureNumeric, ensureString } from '../defensive-transform-logger';
import {
  patternSummarySchema,
  patternTrendSchema,
  qualityTrendSchema,
  languageBreakdownApiSchema,
  discoveredPatternSchema,
  safeParseResponse,
  parseArrayResponse,
} from '../schemas/api-response-schemas';

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
        const rawData = await response.json();
        // Validate API response with Zod schema (handles camelCase)
        const data = safeParseResponse(patternSummarySchema, rawData, 'pattern-summary');
        // Transform API response with defensive logging, handling both camelCase and snake_case
        return {
          totalPatterns: fallbackChain(
            'totalPatterns',
            { context: 'pattern-summary' },
            [
              { value: data?.totalPatterns, label: 'camelCase totalPatterns' },
              { value: (rawData as any)?.total_patterns, label: 'snake_case total_patterns', level: 'warn' },
              { value: 0, label: 'default zero', level: 'error' }
            ]
          ),
          newPatternsToday: fallbackChain(
            'newPatternsToday',
            { context: 'pattern-summary' },
            [
              { value: data?.newPatternsToday, label: 'camelCase newPatternsToday' },
              { value: (rawData as any)?.new_patterns_today, label: 'snake_case new_patterns_today', level: 'warn' },
              { value: 0, label: 'default zero', level: 'error' }
            ]
          ),
          avgQualityScore: fallbackChain(
            'avgQualityScore',
            { context: 'pattern-summary' },
            [
              { value: data?.avgQualityScore, label: 'camelCase avgQualityScore' },
              { value: (rawData as any)?.avg_quality_score, label: 'snake_case avg_quality_score', level: 'warn' },
              { value: 0, label: 'default zero', level: 'error' }
            ]
          ),
          activeLearningCount: fallbackChain(
            'activeLearningCount',
            { context: 'pattern-summary' },
            [
              { value: data?.activeLearningCount, label: 'camelCase activeLearningCount' },
              { value: (rawData as any)?.active_learning_count, label: 'snake_case active_learning_count', level: 'warn' },
              { value: 0, label: 'default zero', level: 'error' }
            ]
          ),
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
        const rawData = await response.json();
        // Handle both validated data and raw data (for cases where validation fails but we have data)
        const validatedData = parseArrayResponse(patternTrendSchema, rawData, 'pattern-trends');
        const dataArray = Array.isArray(rawData) ? rawData : (validatedData.length > 0 ? validatedData : []);
        
        if (dataArray.length > 0) {
          // Transform to ensure proper format with defensive logging
          return dataArray.map((item: any, index: number) => ({
            period: withFallback(
              'period',
              item.period,
              new Date().toISOString(),
              { id: index, context: 'pattern-trends' },
              'warn'
            ),
            manifestsGenerated: fallbackChain(
              'manifestsGenerated',
              { id: index, context: 'pattern-trends' },
              [
                { value: item.manifestsGenerated, label: 'camelCase manifestsGenerated' },
                { value: item.manifests_generated, label: 'snake_case manifests_generated', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            ),
            avgPatternsPerManifest: fallbackChain(
              'avgPatternsPerManifest',
              { id: index, context: 'pattern-trends' },
              [
                { value: item.avgPatternsPerManifest, label: 'camelCase avgPatternsPerManifest' },
                { value: item.avg_patterns_per_manifest, label: 'snake_case avg_patterns_per_manifest', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            ),
            avgQueryTimeMs: fallbackChain(
              'avgQueryTimeMs',
              { id: index, context: 'pattern-trends' },
              [
                { value: item.avgQueryTimeMs, label: 'camelCase avgQueryTimeMs' },
                { value: item.avg_query_time_ms, label: 'snake_case avg_query_time_ms', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            ),
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
        const rawData = await response.json();
        // Handle both validated data and raw data (for cases where validation fails but we have data)
        const validatedData = parseArrayResponse(qualityTrendSchema, rawData, 'quality-trends');
        const dataArray = Array.isArray(rawData) ? rawData : (validatedData.length > 0 ? validatedData : []);
        
        if (dataArray.length > 0) {
          // Transform to ensure proper format with defensive logging
          return dataArray.map((item: any, index: number) => ({
            period: withFallback(
              'period',
              item.period,
              new Date().toISOString(),
              { id: index, context: 'quality-trends' },
              'warn'
            ),
            avgQuality: fallbackChain(
              'avgQuality',
              { id: index, context: 'quality-trends' },
              [
                { value: item.avgQuality, label: 'camelCase avgQuality' },
                { value: item.avg_quality, label: 'snake_case avg_quality', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            ),
            manifestCount: fallbackChain(
              'manifestCount',
              { id: index, context: 'quality-trends' },
              [
                { value: item.manifestCount, label: 'camelCase manifestCount' },
                { value: item.manifest_count, label: 'snake_case manifest_count', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            ),
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
        const rawData = await response.json();
        // Handle both validated data and raw data (for cases where validation fails but we have data)
        const validatedData = parseArrayResponse(languageBreakdownApiSchema, rawData, 'language-breakdown');
        const dataArray = Array.isArray(rawData) ? rawData : (validatedData.length > 0 ? validatedData : []);
        
        if (dataArray.length > 0) {
          // Calculate total for percentages with defensive logging
          const total = dataArray.reduce((sum: number, item: any, index: number) => {
            const count = fallbackChain(
              'pattern_count',
              { id: index, context: 'language-breakdown-total' },
              [
                { value: item.pattern_count, label: 'snake_case pattern_count' },
                { value: item.count, label: 'count field', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            );
            return sum + count;
          }, 0);

          // Transform snake_case API response to camelCase with percentages
          return dataArray.map((item: any, index: number) => {
            const count = fallbackChain(
              'pattern_count',
              { id: index, context: 'language-breakdown' },
              [
                { value: item.pattern_count, label: 'snake_case pattern_count' },
                { value: item.count, label: 'count field', level: 'warn' },
                { value: 0, label: 'default zero', level: 'error' }
              ]
            );
            return {
              language: withFallback(
                'language',
                item.language,
                'unknown',
                { id: index, context: 'language-breakdown' },
                'warn'
              ),
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
        const rawData = await response.json();
        // Validate API response with Zod schema
        const data = parseArrayResponse(discoveredPatternSchema, rawData, 'pattern-discovery');
        return {
          data: data.map((p) => ({
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





