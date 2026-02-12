import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import patternsRoutes from '../patterns-routes';

// Mock data structure as specified
const mockPatterns = [
  {
    id: 'uuid-1',
    patternSignature: 'test_pattern_1',
    domainId: 'code_generation',
    status: 'validated',
    confidence: '0.85',
    qualityScore: '0.75',
    injectionCountRolling20: 10,
    successCountRolling20: 8,
    isCurrent: true,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-20'),
  },
  {
    id: 'uuid-2',
    patternSignature: 'test_pattern_2',
    domainId: 'debugging',
    status: 'candidate',
    confidence: '0.65',
    qualityScore: '0.50',
    injectionCountRolling20: 0, // zero sample - success_rate should be null
    successCountRolling20: 0,
    isCurrent: true,
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-01-10'),
  },
];

// Create a proper chainable mock query builder
const createMockQueryBuilder = () => {
  const builder: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    execute: vi.fn(),
  };

  // Make all methods return the builder for chaining by default
  builder.select.mockReturnValue(builder);
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.offset.mockReturnValue(builder);

  return builder;
};

const mockDb = createMockQueryBuilder();

// Mock the storage module
vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
  tryGetIntelligenceDb: vi.fn(() => mockDb),
  isDatabaseConfigured: vi.fn(() => true),
  getDatabaseError: vi.fn(() => null),
}));

describe('Patterns Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/patterns', patternsRoutes);
    vi.clearAllMocks();

    // Reset mockDb chain after clearing mocks
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.offset.mockReturnValue(mockDb);
    mockDb.execute.mockResolvedValue([{ check: 1 }]);
  });

  describe('GET /api/patterns', () => {
    it('should return paginated pattern list with default params', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query - returns array with count object
      const countMock = vi.fn().mockResolvedValue([{ count: 2 }]);
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: countMock,
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockPatterns),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      // Verify response shape
      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');

      // Verify default pagination values
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
      expect(response.body.total).toBe(2);
      expect(Array.isArray(response.body.patterns)).toBe(true);
    });

    it('should filter by status correctly', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock patterns query - only return validated patterns
      const validatedPatterns = mockPatterns.filter((p) => p.status === 'validated');
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(validatedPatterns),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?status=validated').expect(200);

      expect(response.body.patterns).toHaveLength(1);
      expect(response.body.patterns[0].status).toBe('validated');
    });

    it('should filter by min_confidence correctly', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock patterns query - only return patterns with confidence >= 0.8
      const highConfidencePatterns = mockPatterns.filter((p) => parseFloat(p.confidence) >= 0.8);
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(highConfidencePatterns),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?min_confidence=0.8').expect(200);

      expect(response.body.patterns).toHaveLength(1);
      expect(response.body.patterns[0].confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should handle pagination correctly with limit and offset', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 100 }]),
        }),
      });

      // Mock patterns query with pagination
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockPatterns[0]]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?limit=10&offset=5').expect(200);

      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(5);
      expect(response.body.total).toBe(100);
    });

    it('should return 400 for invalid status value', async () => {
      const response = await request(app).get('/api/patterns?status=invalid').expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid query parameters');
      expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for out-of-range confidence (> 1.0)', async () => {
      const response = await request(app).get('/api/patterns?min_confidence=2.0').expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid query parameters');
      expect(response.body).toHaveProperty('details');
    });

    it('should return 400 for negative confidence', async () => {
      const response = await request(app).get('/api/patterns?min_confidence=-0.5').expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid query parameters');
      expect(response.body).toHaveProperty('details');
    });

    it('should include all required fields in pattern items', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockPatterns[0]]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      const pattern = response.body.patterns[0];

      // Verify all required fields are present
      expect(pattern).toHaveProperty('id');
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('signature');
      expect(pattern).toHaveProperty('status');
      expect(pattern).toHaveProperty('confidence');
      expect(pattern).toHaveProperty('quality_score');
      expect(pattern).toHaveProperty('usage_count_rolling_20');
      expect(pattern).toHaveProperty('success_rate_rolling_20');
      expect(pattern).toHaveProperty('sample_size_rolling_20');
      expect(pattern).toHaveProperty('created_at');
      expect(pattern).toHaveProperty('updated_at');

      // Verify field mappings
      expect(pattern.id).toBe('uuid-1');
      expect(pattern.name).toBe('code_generation'); // domainId maps to name
      expect(pattern.signature).toBe('test_pattern_1'); // patternSignature maps to signature
      expect(pattern.status).toBe('validated');
      expect(pattern.confidence).toBe(0.85);
      expect(pattern.quality_score).toBe(0.75);
      expect(pattern.usage_count_rolling_20).toBe(10);
      expect(pattern.sample_size_rolling_20).toBe(10);
    });

    it('should return null for success_rate_rolling_20 when sample_size is 0 (zero-safe rule)', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Return pattern with zero sample size
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockPatterns[1]]), // Pattern with 0 injections
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      const pattern = response.body.patterns[0];
      expect(pattern.sample_size_rolling_20).toBe(0);
      expect(pattern.success_rate_rolling_20).toBeNull();
    });

    it('should calculate success_rate_rolling_20 correctly when sample_size > 0', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Return pattern with non-zero sample size (8 successes / 10 injections = 0.8)
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockPatterns[0]]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      const pattern = response.body.patterns[0];
      expect(pattern.sample_size_rolling_20).toBe(10);
      expect(pattern.success_rate_rolling_20).toBe(0.8); // 8/10 = 0.8
    });

    it('should return empty response when learned_patterns table does not exist', async () => {
      // Mock table existence check to fail with table not found error
      const tableError = new Error('relation "learned_patterns" does not exist');
      (tableError as any).code = '42P01';
      mockDb.execute.mockRejectedValueOnce(tableError);

      const response = await request(app).get('/api/patterns').expect(200);

      expect(response.body).toEqual({
        patterns: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('should clamp limit to maximum of 250', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?limit=500').expect(200);

      // Limit should be clamped to 250
      expect(response.body.limit).toBe(250);
    });

    it('should clamp limit to minimum of 1', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?limit=0').expect(200);

      // Limit should be clamped to 1
      expect(response.body.limit).toBe(1);
    });

    it('should clamp negative offset to 0', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns?offset=-10').expect(200);

      // Offset should be clamped to 0
      expect(response.body.offset).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      // Mock table existence check to succeed
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query to throw an error
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch patterns');
      expect(response.body).toHaveProperty('message');
    });

    it('should accept all valid status values', async () => {
      const validStatuses = ['candidate', 'provisional', 'validated', 'deprecated'];

      for (const status of validStatuses) {
        vi.clearAllMocks();

        // Mock table existence check
        mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

        // Mock count query
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });

        // Mock patterns query
        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        });

        const response = await request(app).get(`/api/patterns?status=${status}`).expect(200);

        expect(response.body).toHaveProperty('patterns');
      }
    });

    it('should set no-cache headers on response', async () => {
      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['expires']).toBe('0');
    });

    it('should handle patterns with null optional fields gracefully', async () => {
      const patternWithNulls = {
        id: 'uuid-3',
        patternSignature: 'test_pattern_3',
        domainId: 'analysis',
        status: 'provisional',
        confidence: null, // null confidence
        qualityScore: null, // null quality score
        injectionCountRolling20: null, // null injection count
        successCountRolling20: null, // null success count
        isCurrent: true,
        createdAt: null, // null dates
        updatedAt: null,
      };

      // Mock table existence check
      mockDb.execute.mockResolvedValueOnce([{ check: 1 }]);

      // Mock count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

      // Mock patterns query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([patternWithNulls]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      const pattern = response.body.patterns[0];

      // Should handle nulls gracefully with defaults
      expect(pattern.confidence).toBe(0);
      expect(pattern.quality_score).toBe(0.5);
      expect(pattern.usage_count_rolling_20).toBe(0);
      expect(pattern.sample_size_rolling_20).toBe(0);
      expect(pattern.success_rate_rolling_20).toBeNull(); // null due to zero sample
      expect(pattern.created_at).toBeNull(); // null when DB column is null
      expect(pattern.updated_at).toBeNull(); // null when DB column is null
    });
  });
});
