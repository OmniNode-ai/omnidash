/**
 * Tests for patterns-routes.ts (OMN-2924)
 *
 * Verifies:
 * - Returns paginated pattern list from pattern_learning_artifacts
 * - Filters by lifecycle_state (status)
 * - Filters by min_confidence (maps to composite_score)
 * - Handles pagination
 * - Returns 400 for invalid parameters
 * - Returns empty response when table does not exist
 * - Sets no-cache headers
 * - Handles DB unavailable (demo mode)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import patternsRoutes, { resetTableExistsCache } from '../patterns-routes';

// Mock data using pattern_learning_artifacts shape
const mockArtifacts = [
  {
    id: 'uuid-1',
    patternId: 'pattern-uuid-1',
    patternName: 'code_generation',
    patternType: 'code_pattern',
    lifecycleState: 'validated',
    compositeScore: '0.850000',
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-20'),
    projectedAt: new Date('2026-01-20'),
  },
  {
    id: 'uuid-2',
    patternId: 'pattern-uuid-2',
    patternName: 'debugging',
    patternType: 'debug_pattern',
    lifecycleState: 'candidate',
    compositeScore: '0.650000',
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-01-10'),
    projectedAt: new Date('2026-01-10'),
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

/**
 * Prepend a mockReturnValueOnce on mockDb.select for the tableExists() probe.
 *
 * tableExists() calls: db.select().from(patternLearningArtifacts).limit(1)
 * and awaits the result of .limit(). This helper creates a one-shot
 * chain that resolves .limit() to a non-empty array (table exists)
 * or rejects with a PG 42P01 error (table missing).
 */
function mockTableExistsProbe(opts?: { reject?: Error }) {
  const limitFn = opts?.reject
    ? vi.fn().mockRejectedValueOnce(opts.reject)
    : vi.fn().mockResolvedValueOnce([{ one: 1 }]);

  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      limit: limitFn,
    }),
  });
}

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
    // Reset module-level table-existence cache so each test starts fresh.
    resetTableExistsCache();

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
      mockTableExistsProbe();

      // Mock Promise.all: [countResult, rows]
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockArtifacts),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
      expect(response.body.total).toBe(2);
      expect(Array.isArray(response.body.patterns)).toBe(true);
    });

    it('should filter by status correctly', async () => {
      mockTableExistsProbe();

      const validatedArtifacts = mockArtifacts.filter((a) => a.lifecycleState === 'validated');
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(validatedArtifacts),
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
      mockTableExistsProbe();

      const highScoreArtifacts = mockArtifacts.filter((a) => parseFloat(a.compositeScore) >= 0.8);
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(highScoreArtifacts),
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
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 100 }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockArtifacts[0]]),
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
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([mockArtifacts[0]]),
              }),
            }),
          }),
        }),
      });

      const response = await request(app).get('/api/patterns').expect(200);

      const pattern = response.body.patterns[0];

      expect(pattern).toHaveProperty('id');
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('signature');
      expect(pattern).toHaveProperty('status');
      expect(pattern).toHaveProperty('confidence');
      expect(pattern).toHaveProperty('quality_score');
      expect(pattern).toHaveProperty('usage_count_rolling_20');
      expect(pattern).toHaveProperty('success_rate_rolling_20');

      // Verify field mappings from pattern_learning_artifacts
      expect(pattern.id).toBe('uuid-1');
      expect(pattern.name).toBe('code_generation'); // patternName maps to name
      expect(pattern.signature).toBe('code_pattern'); // patternType maps to signature
      expect(pattern.status).toBe('validated'); // lifecycleState maps to status
      expect(pattern.confidence).toBeCloseTo(0.85); // compositeScore maps to confidence
      expect(pattern.quality_score).toBeCloseTo(0.85); // compositeScore maps to quality_score
    });

    it('should return empty response when pattern_learning_artifacts table does not exist', async () => {
      const tableError = new Error('relation "pattern_learning_artifacts" does not exist');
      (tableError as any).code = '42P01';
      mockTableExistsProbe({ reject: tableError });

      const response = await request(app).get('/api/patterns').expect(200);

      expect(response.body).toEqual({
        patterns: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('should clamp limit to maximum of 250', async () => {
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });
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

      expect(response.body.limit).toBe(250);
    });

    it('should clamp limit to minimum of 1', async () => {
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });
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

      expect(response.body.limit).toBe(1);
    });

    it('should clamp negative offset to 0', async () => {
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });
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

      expect(response.body.offset).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockTableExistsProbe();

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
        // Reset module-level cache so each loop iteration runs the table probe.
        resetTableExistsCache();

        // Re-establish default mock chain after vi.clearAllMocks()
        mockDb.select.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.orderBy.mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.offset.mockReturnValue(mockDb);

        mockTableExistsProbe();

        mockDb.select.mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        });
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
      mockTableExistsProbe();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      });
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

    it('should return demo mode response when DB is unavailable', async () => {
      // Mock tryGetIntelligenceDb to return null (DB unavailable)
      const { tryGetIntelligenceDb } = await import('../storage');
      vi.mocked(tryGetIntelligenceDb).mockReturnValueOnce(null as any);

      const response = await request(app).get('/api/patterns').expect(200);

      expect(response.body._demo).toBe(true);
      expect(response.body.patterns).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });
});
