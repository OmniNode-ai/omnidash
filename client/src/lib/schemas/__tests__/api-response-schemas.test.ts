import { describe, it, expect } from 'vitest';
import {
  serviceStatusSchema,
  healthStatusSchema,
  agentSummarySchema,
  patternSummarySchema,
  patternTrendSchema,
  safeParseResponse,
  parseArrayResponse,
} from '../api-response-schemas';

describe('api-response-schemas', () => {
  describe('serviceStatusSchema', () => {
    it('should validate valid service status', () => {
      const data = {
        name: 'PostgreSQL',
        status: 'up',
        latency: 5,
      };

      const result = serviceStatusSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should validate without optional latency', () => {
      const data = {
        name: 'PostgreSQL',
        status: 'up',
      };

      const result = serviceStatusSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('healthStatusSchema', () => {
    it('should validate health status with services', () => {
      const data = {
        status: 'healthy',
        services: [
          { name: 'PostgreSQL', status: 'up' },
          { name: 'Kafka', status: 'up', latency: 10 },
        ],
      };

      const result = healthStatusSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('agentSummarySchema', () => {
    it('should validate agent summary', () => {
      const data = {
        totalAgents: 10,
        activeAgents: 8,
        totalRuns: 100,
        successRate: 95,
        avgExecutionTime: 50,
      };

      const result = agentSummarySchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('patternSummarySchema', () => {
    it('should validate pattern summary', () => {
      const data = {
        totalPatterns: 100,
        newPatternsToday: 5,
        avgQualityScore: 0.85,
        activeLearningCount: 10,
      };

      const result = patternSummarySchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('safeParseResponse', () => {
    it('should return parsed data on success', () => {
      const data = {
        totalPatterns: 100,
        newPatternsToday: 5,
        avgQualityScore: 0.85,
        activeLearningCount: 10,
      };

      const result = safeParseResponse(patternSummarySchema, data, 'test');
      expect(result).toEqual(data);
    });

    it('should return undefined on validation failure', () => {
      const data = {
        totalPatterns: 'invalid',
      };

      const result = safeParseResponse(patternSummarySchema, data, 'test');
      expect(result).toBeUndefined();
    });
  });

  describe('parseArrayResponse', () => {
    it('should parse array of valid items', () => {
      const data = [
        {
          period: '2025-01-01',
          manifestsGenerated: 10,
          avgPatternsPerManifest: 5,
          avgQueryTimeMs: 100,
        },
        {
          period: '2025-01-02',
          manifestsGenerated: 12,
          avgPatternsPerManifest: 6,
          avgQueryTimeMs: 120,
        },
      ];

      const result = parseArrayResponse(patternTrendSchema, data, 'test');
      expect(result).toHaveLength(2);
    });

    it('should filter out invalid items', () => {
      const data = [
        {
          period: '2025-01-01',
          manifestsGenerated: 10,
          avgPatternsPerManifest: 5,
          avgQueryTimeMs: 100,
        },
        {
          period: '2025-01-02',
          // Missing required fields
        },
      ];

      const result = parseArrayResponse(patternTrendSchema, data, 'test');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for invalid input', () => {
      const result = parseArrayResponse(patternTrendSchema, null, 'test');
      expect(result).toEqual([]);
    });
  });
});
