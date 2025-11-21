/**
 * Mock Data Configuration
 *
 * Central configuration for mock data across all dashboards.
 * Set USE_MOCK_DATA to true to use realistic mock data instead of real API calls.
 * This is useful for:
 * - Development when backend services are unavailable
 * - Testing UI with realistic data
 * - Demos and screenshots
 */

// Check environment variable first, then fallback to default
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true' || false;

// Mock data generation utilities
export class MockDataGenerator {
  /**
   * Generate a random number between min and max
   */
  static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate a random float between min and max
   */
  static randomFloat(min: number, max: number, decimals: number = 2): number {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  }

  /**
   * Generate a clamped float within strict bounds
   * Ensures the returned value is always within [min, max] range
   */
  static clampedFloat(min: number, max: number, decimals: number = 2): number {
    const value = Math.random() * (max - min) + min;
    return parseFloat(Math.max(min, Math.min(max, value)).toFixed(decimals));
  }

  /**
   * Generate a positive float (>= 0)
   * Ensures the returned value is never negative
   */
  static positiveFloat(min: number, max: number, decimals: number = 2): number {
    return parseFloat(Math.max(0, Math.random() * (max - min) + min).toFixed(decimals));
  }

  /**
   * Generate a percentage (0-100)
   * Ensures the returned value is always a valid percentage
   */
  static percentage(decimals: number = 1): number {
    return parseFloat((Math.random() * 100).toFixed(decimals));
  }

  /**
   * Generate a currency value (always positive)
   * Ensures the returned value is never negative for financial data
   */
  static currency(min: number = 0, max: number = 10000, decimals: number = 2): number {
    return parseFloat(Math.max(0, Math.random() * (max - min) + min).toFixed(decimals));
  }

  /**
   * Pick a random item from an array
   */
  static randomItem<T>(items: T[]): T {
    return items[MockDataGenerator.randomInt(0, items.length - 1)];
  }

  /**
   * Pick multiple random items from an array
   */
  static randomItems<T>(items: T[], count: number): T[] {
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Generate a timestamp in the past
   */
  static pastTimestamp(maxMinutesAgo: number): string {
    const now = new Date();
    const minutesAgo = MockDataGenerator.randomInt(0, maxMinutesAgo);
    return new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
  }

  /**
   * Generate a time series of data points
   */
  static generateTimeSeries(
    dataPoints: number,
    minValue: number,
    maxValue: number,
    intervalMinutes: number = 1
  ): Array<{ time: string; value: number }> {
    const now = new Date();
    const data = [];

    for (let i = dataPoints - 1; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
      data.push({
        time: timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: MockDataGenerator.randomFloat(minValue, maxValue),
      });
    }

    return data;
  }

  /**
   * Generate a UUID
   */
  static uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate a realistic agent name
   */
  static agentName(): string {
    const prefixes = [
      'Code',
      'Test',
      'Deploy',
      'Analysis',
      'Refactor',
      'Documentation',
      'Security',
      'Performance',
      'Quality',
      'Integration',
    ];
    const suffixes = [
      'Agent',
      'Assistant',
      'Analyzer',
      'Generator',
      'Optimizer',
      'Validator',
      'Scanner',
      'Monitor',
    ];
    return `${MockDataGenerator.randomItem(prefixes)}${MockDataGenerator.randomItem(suffixes)}`;
  }

  /**
   * Generate a realistic file path
   */
  static filePath(): string {
    const dirs = ['src', 'lib', 'components', 'utils', 'services', 'pages', 'api'];
    const files = [
      'index.ts',
      'utils.ts',
      'types.ts',
      'api.ts',
      'component.tsx',
      'service.ts',
      'helper.ts',
      'config.ts',
    ];
    const depth = MockDataGenerator.randomInt(1, 4);
    const path = [];

    for (let i = 0; i < depth; i++) {
      path.push(MockDataGenerator.randomItem(dirs));
    }

    return `${path.join('/')}/${MockDataGenerator.randomItem(files)}`;
  }

  /**
   * Generate a realistic repository name
   */
  static repositoryName(): string {
    const adjectives = ['awesome', 'modern', 'fast', 'secure', 'smart', 'simple'];
    const nouns = ['app', 'service', 'api', 'platform', 'tool', 'framework'];
    return `${MockDataGenerator.randomItem(adjectives)}-${MockDataGenerator.randomItem(nouns)}`;
  }

  /**
   * Generate a realistic programming language
   */
  static programmingLanguage(): string {
    const languages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C++', 'Ruby'];
    return MockDataGenerator.randomItem(languages);
  }

  /**
   * Generate a status with weighted probabilities
   */
  static status(successWeight: number = 0.8): 'success' | 'error' | 'warning' {
    const rand = Math.random();
    if (rand < successWeight) return 'success';
    if (rand < successWeight + 0.15) return 'warning';
    return 'error';
  }

  /**
   * Generate a health status
   */
  static healthStatus(): 'healthy' | 'degraded' | 'down' {
    const rand = Math.random();
    if (rand < 0.85) return 'healthy';
    if (rand < 0.95) return 'degraded';
    return 'down';
  }

  /**
   * Generate a trend direction
   */
  static trend(): 'up' | 'down' | 'stable' {
    const rand = Math.random();
    if (rand < 0.4) return 'up';
    if (rand < 0.5) return 'down';
    return 'stable';
  }
}
