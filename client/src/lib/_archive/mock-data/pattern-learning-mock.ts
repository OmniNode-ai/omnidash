/**
 * Mock Data Generator for Pattern Learning Dashboard
 */

import { MockDataGenerator as Gen } from './config';
import type {
  PatternSummary,
  Pattern,
  PatternTrend,
  QualityTrend,
  LanguageBreakdown,
  DiscoveredPattern,
} from '../data-sources/pattern-learning-source';

export class PatternLearningMockData {
  /**
   * Generate mock pattern summary
   */
  static generateSummary(): PatternSummary {
    return {
      totalPatterns: Gen.randomInt(800, 1500),
      newPatternsToday: Gen.randomInt(20, 60),
      avgQualityScore: Gen.randomFloat(0.78, 0.92, 2),
      activeLearningCount: Gen.randomInt(5, 15),
    };
  }

  /**
   * Generate mock pattern trends
   */
  static generateTrends(dataPoints: number = 20): PatternTrend[] {
    const trends: PatternTrend[] = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000); // Hourly data
      trends.push({
        period: timestamp.toISOString(),
        manifestsGenerated: Gen.randomInt(5, 25),
        avgPatternsPerManifest: Gen.randomFloat(0.5, 2.5, 1),
        avgQueryTimeMs: Gen.randomInt(30, 100),
      });
    }

    return trends;
  }

  /**
   * Generate mock quality trends
   */
  static generateQualityTrends(dataPoints: number = 20): QualityTrend[] {
    const trends: QualityTrend[] = [];
    const now = new Date();

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      trends.push({
        period: timestamp.toISOString(),
        avgQuality: Gen.randomFloat(0.75, 0.95, 2),
        manifestCount: Gen.randomInt(5, 25),
      });
    }

    return trends;
  }

  /**
   * Generate mock pattern list
   */
  static generatePatternList(limit: number = 50): Pattern[] {
    const patterns: Pattern[] = [];
    const categories = [
      'Authentication',
      'Data Processing',
      'Error Handling',
      'Caching',
      'Validation',
      'API Integration',
      'Database Access',
      'File Operations',
      'Async Operations',
      'State Management',
      'Event Handling',
      'Testing',
      'Logging',
      'Security',
      'Performance',
    ];

    const languages = ['TypeScript', 'Python', 'JavaScript', 'Rust', 'Go', 'Java', 'Ruby', 'C++'];

    const descriptions = {
      Authentication: [
        'OAuth 2.0 flow implementation',
        'JWT token validation',
        'Session management',
        'Multi-factor authentication',
      ],
      'Data Processing': [
        'Stream processing pipeline',
        'Batch data transformation',
        'Data validation rules',
        'ETL workflow pattern',
      ],
      'Error Handling': [
        'Custom error middleware',
        'Retry with exponential backoff',
        'Error boundary component',
        'Global error handler',
      ],
      Caching: [
        'LRU cache implementation',
        'Redis cache layer',
        'In-memory cache with TTL',
        'Cache invalidation strategy',
      ],
      Validation: [
        'Schema validation',
        'Input sanitization',
        'Type checking',
        'Business rule validation',
      ],
      'API Integration': [
        'REST client wrapper',
        'GraphQL query builder',
        'Webhook handler',
        'API rate limiting',
      ],
      'Database Access': [
        'Connection pooling',
        'Query builder pattern',
        'Transaction management',
        'Migration runner',
      ],
      'File Operations': [
        'Chunked file upload',
        'Stream-based file processing',
        'File watcher pattern',
        'Temporary file cleanup',
      ],
      'Async Operations': [
        'Promise chain builder',
        'Async/await error handling',
        'Concurrent task executor',
        'Queue-based processor',
      ],
      'State Management': [
        'Redux-like store',
        'Observer pattern',
        'State machine',
        'Event sourcing',
      ],
      'Event Handling': [
        'Event emitter pattern',
        'Event delegation',
        'Pub/sub system',
        'Custom event bus',
      ],
      Testing: [
        'Mock factory pattern',
        'Test fixture builder',
        'Snapshot testing utility',
        'Integration test helper',
      ],
      Logging: [
        'Structured logging',
        'Log rotation',
        'Context-aware logger',
        'Performance logging',
      ],
      Security: ['Input sanitization', 'XSS prevention', 'CSRF token validation', 'Rate limiting'],
      Performance: [
        'Memoization pattern',
        'Lazy loading',
        'Debounce/throttle',
        'Virtual scrolling',
      ],
    };

    for (let i = 0; i < limit; i++) {
      const category = Gen.randomItem(categories);
      const language = Gen.randomItem(languages);
      const trend = Gen.trend();
      const trendPercentage =
        trend === 'up'
          ? Gen.randomInt(5, 35)
          : trend === 'down'
            ? -Gen.randomInt(5, 20)
            : Gen.randomInt(-2, 2);

      const categoryDescriptions = descriptions[category as keyof typeof descriptions] || [
        `${category} pattern`,
      ];

      patterns.push({
        id: `pattern-${i + 1}`,
        name: `${category} - ${Gen.randomItem(categoryDescriptions)}`,
        description: Gen.randomItem(categoryDescriptions),
        quality: Gen.randomFloat(0.65, 0.98, 2),
        usage: Gen.randomInt(5, 200),
        trend,
        trendPercentage,
        category,
        language,
      });
    }

    return patterns.sort((a, b) => b.usage - a.usage);
  }

  /**
   * Generate mock language breakdown
   */
  static generateLanguageBreakdown(): LanguageBreakdown[] {
    const languages = [
      { name: 'TypeScript', weight: 0.35 },
      { name: 'Python', weight: 0.28 },
      { name: 'JavaScript', weight: 0.15 },
      { name: 'Rust', weight: 0.08 },
      { name: 'Go', weight: 0.07 },
      { name: 'Java', weight: 0.04 },
      { name: 'Ruby', weight: 0.02 },
      { name: 'C++', weight: 0.01 },
    ];

    const totalPatterns = Gen.randomInt(800, 1500);
    let remainingPercentage = 100;

    return languages.map((lang, idx) => {
      const isLast = idx === languages.length - 1;
      const percentage = isLast ? remainingPercentage : parseFloat((lang.weight * 100).toFixed(1));

      remainingPercentage -= percentage;

      const count = Math.round((totalPatterns * percentage) / 100);

      return {
        language: lang.name,
        count,
        percentage,
      };
    });
  }

  /**
   * Generate mock discovered patterns
   */
  static generateDiscoveredPatterns(limit: number = 8): DiscoveredPattern[] {
    const patterns: DiscoveredPattern[] = [];
    const patternNames = [
      'Authentication Middleware',
      'Database Connection Pool',
      'Error Boundary Component',
      'API Rate Limiter',
      'Cache Invalidation Strategy',
      'Async Task Queue',
      'Event Sourcing Handler',
      'GraphQL Resolver Pattern',
      'WebSocket Manager',
      'File Upload Handler',
      'State Machine Implementation',
      'Service Worker Pattern',
      'Microservice Gateway',
      'Circuit Breaker',
      'Saga Pattern',
    ];

    for (let i = 0; i < limit; i++) {
      const createdAt = Gen.pastTimestamp(240); // Last 4 hours
      patterns.push({
        name: Gen.randomItem(patternNames),
        file_path: Gen.filePath(),
        createdAt,
        metadata: { createdAt },
      });
    }

    return patterns.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Generate all pattern learning mock data
   */
  static generateAll() {
    return {
      summary: this.generateSummary(),
      trends: this.generateTrends(20),
      qualityTrends: this.generateQualityTrends(20),
      patterns: this.generatePatternList(50),
      languageBreakdown: this.generateLanguageBreakdown(),
      discoveredPatterns: this.generateDiscoveredPatterns(8),
    };
  }
}
