import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { intelligenceRouter } from '../intelligence-routes';
import { getIntelligenceDb } from '../storage';
import { intelligenceEvents } from '../intelligence-event-adapter';
import { eventConsumer } from '../event-consumer';
import { checkAllServices } from '../service-health';
import { dbAdapter } from '../db-adapter';

// Mock dependencies - create a proper query builder mock that chains correctly
const createMockQueryBuilder = () => {
  const builder: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    groupBy: vi.fn(),
    execute: vi.fn().mockResolvedValue([]),
  };

  // Make all methods return the builder for chaining
  builder.select.mockReturnValue(builder);
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.offset.mockReturnValue(builder);
  builder.groupBy.mockReturnValue(builder);

  return builder;
};

const mockDb = createMockQueryBuilder();

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

vi.mock('../intelligence-event-adapter', () => ({
  intelligenceEvents: {
    start: vi.fn().mockResolvedValue(undefined),
    requestPatternDiscovery: vi.fn().mockResolvedValue({ patterns: [] }),
  },
}));

vi.mock('../event-consumer', () => ({
  eventConsumer: {
    getAgentMetrics: vi.fn().mockReturnValue([]),
    getRecentActions: vi.fn().mockReturnValue([]),
    getRoutingDecisions: vi.fn().mockReturnValue([]),
    getActionsByAgent: vi.fn().mockReturnValue([]),
    getHealthStatus: vi.fn().mockReturnValue({
      status: 'healthy',
      agents: 0,
      recentActions: 0,
      routingDecisions: 0,
    }),
    getRecentTransformations: vi.fn().mockReturnValue([]),
    getPerformanceMetrics: vi.fn().mockReturnValue([]),
    getPerformanceStats: vi.fn().mockReturnValue({
      avgRoutingDurationMs: 0,
      cacheHitRate: 0,
      totalQueries: 0,
      avgCandidatesEvaluated: 0,
      strategyBreakdown: {},
    }),
  },
}));

vi.mock('../service-health', () => ({
  checkAllServices: vi.fn().mockResolvedValue([]),
}));

vi.mock('../db-adapter', () => ({
  dbAdapter: {
    count: vi.fn().mockResolvedValue(0),
  },
}));

function resetSelectMock() {
  vi.mocked(mockDb.select).mockReset();
  vi.mocked(mockDb.select).mockReturnValue(mockDb);
}

describe('Intelligence Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/intelligence', intelligenceRouter);
    vi.clearAllMocks();

    // Reset mockDb chain after clearing mocks
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.offset.mockReturnValue(mockDb);
    mockDb.groupBy.mockReturnValue(mockDb);
    mockDb.execute.mockResolvedValue([]);
  });

  describe('GET /api/intelligence/db/test/count', () => {
    it('should return count for specified table', async () => {
      vi.mocked(dbAdapter.count).mockResolvedValue(42);

      const response = await request(app)
        .get('/api/intelligence/db/test/count?table=agent_actions')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('table', 'agent_actions');
      expect(response.body).toHaveProperty('count', 42);
    });

    it('should use default table if not specified', async () => {
      vi.mocked(dbAdapter.count).mockResolvedValue(10);

      const response = await request(app).get('/api/intelligence/db/test/count').expect(200);

      expect(response.body.table).toBe('agent_actions');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(dbAdapter.count).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/intelligence/db/test/count').expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/intelligence/analysis/patterns', () => {
    it('should return patterns with default parameters', async () => {
      vi.mocked(intelligenceEvents.requestPatternDiscovery).mockResolvedValue({
        patterns: [{ id: '1', name: 'Test Pattern' }],
      });

      const response = await request(app).get('/api/intelligence/analysis/patterns').expect(200);

      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta.sourcePath).toBe('node_*_effect.py');
      expect(response.body.meta.language).toBe('python');
    });

    it('should accept custom query parameters', async () => {
      vi.mocked(intelligenceEvents.requestPatternDiscovery).mockResolvedValue({
        patterns: [],
      });

      const response = await request(app)
        .get('/api/intelligence/analysis/patterns?path=test.py&lang=python&timeout=10000')
        .expect(200);

      expect(response.body.meta.sourcePath).toBe('test.py');
      expect(response.body.meta.language).toBe('python');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(intelligenceEvents.requestPatternDiscovery).mockRejectedValue(
        new Error('Pattern discovery failed')
      );

      const response = await request(app).get('/api/intelligence/analysis/patterns').expect(502);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /api/intelligence/services/health', () => {
    it('should return service health checks', async () => {
      vi.mocked(checkAllServices).mockResolvedValue([
        {
          service: 'PostgreSQL',
          status: 'up',
          latencyMs: 5,
        },
        {
          service: 'Kafka/Redpanda',
          status: 'up',
          latencyMs: 10,
        },
      ] as any);

      const response = await request(app).get('/api/intelligence/services/health').expect(200);

      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('overallStatus');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('timestamp');
      expect(Array.isArray(response.body.services)).toBe(true);
      expect(response.body.services.length).toBe(2);
      expect(response.body.overallStatus).toBe('healthy');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(checkAllServices).mockRejectedValue(new Error('Health check failed'));

      const response = await request(app).get('/api/intelligence/services/health').expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/intelligence/agents/summary', () => {
    it('should return agent metrics from event consumer', async () => {
      vi.mocked(eventConsumer.getAgentMetrics).mockReturnValue([
        {
          agent: 'test-agent',
          totalRequests: 100,
          avgRoutingTime: 50,
          avgConfidence: 0.9,
        },
      ] as any);

      const response = await request(app).get('/api/intelligence/agents/summary').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should fall back to database when event consumer is empty', async () => {
      vi.mocked(eventConsumer.getAgentMetrics).mockReturnValue([]);
      vi.mocked(mockDb.execute).mockResolvedValue([
        {
          agent: 'test-agent',
          total_requests: 50,
          avg_routing_time: 45,
          avg_confidence: 0.85,
        },
      ] as any);

      const response = await request(app)
        .get('/api/intelligence/agents/summary?timeWindow=24h')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    // eslint-disable-next-line vitest/expect-expect
    it('should handle different time windows', async () => {
      vi.mocked(eventConsumer.getAgentMetrics).mockReturnValue([]);
      vi.mocked(mockDb.execute).mockResolvedValue([]);

      await request(app).get('/api/intelligence/agents/summary?timeWindow=7d').expect(200);

      await request(app).get('/api/intelligence/agents/summary?timeWindow=30d').expect(200);
    });
  });

  describe('GET /api/intelligence/actions/recent', () => {
    it('should return recent actions from event consumer', async () => {
      vi.mocked(eventConsumer.getRecentActions).mockReturnValue([
        {
          id: '1',
          agentName: 'test-agent',
          actionType: 'tool_call',
          actionName: 'read_file',
        },
      ] as any);

      const response = await request(app).get('/api/intelligence/actions/recent').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should accept limit parameter', async () => {
      vi.mocked(eventConsumer.getRecentActions).mockReturnValue([]);

      const response = await request(app)
        .get('/api/intelligence/actions/recent?limit=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/health', () => {
    it('should return health status', async () => {
      vi.mocked(eventConsumer.getHealthStatus).mockReturnValue({
        status: 'healthy',
        agents: 5,
        recentActions: 10,
        routingDecisions: 8,
      } as any);

      const response = await request(app).get('/api/intelligence/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(eventConsumer.getHealthStatus).mockImplementation(() => {
        throw new Error('Health check failed');
      });

      const response = await request(app).get('/api/intelligence/health').expect(503);

      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/intelligence/patterns/summary', () => {
    it('should return pattern summary', async () => {
      // Mock the table existence check to succeed
      vi.mocked(mockDb.execute).mockResolvedValue([{ check: 1 }] as any);

      // Mock the select query result
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([
          {
            total_patterns: 100,
            languages: 3,
            unique_executions: 50,
          },
        ]),
      } as any);

      const response = await request(app).get('/api/intelligence/patterns/summary').expect(200);

      expect(response.body).toHaveProperty('total_patterns');
      expect(response.body.total_patterns).toBe(100);
    });

    it('should return empty summary when table does not exist', async () => {
      // Mock table existence check to fail with table not found error
      const tableError = new Error('relation "pattern_lineage_nodes" does not exist');
      (tableError as any).code = '42P01';
      // Use mockRejectedValueOnce for the first execute call (table check)
      vi.mocked(mockDb.execute).mockRejectedValueOnce(tableError);

      const response = await request(app).get('/api/intelligence/patterns/summary').expect(200);

      expect(response.body).toHaveProperty('total_patterns', 0);
      expect(response.body).toHaveProperty('languages', 0);
      expect(response.body).toHaveProperty('unique_executions', 0);
    });

    it('should handle errors gracefully', async () => {
      // Mock table check to succeed, but select query to fail
      vi.mocked(mockDb.execute).mockResolvedValue([{ check: 1 }] as any);
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockRejectedValue(new Error('Database connection error')),
      } as any);

      const response = await request(app).get('/api/intelligence/patterns/summary').expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/intelligence/agents/:agent/actions', () => {
    it('should return actions for a specific agent', async () => {
      vi.mocked(eventConsumer.getActionsByAgent).mockReturnValue([
        {
          id: '1',
          agentName: 'test-agent',
          actionType: 'tool_call',
          actionName: 'read_file',
        },
      ] as any);

      const response = await request(app)
        .get('/api/intelligence/agents/test-agent/actions')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should accept timeWindow and limit parameters', async () => {
      vi.mocked(eventConsumer.getActionsByAgent).mockReturnValue([]);

      const response = await request(app)
        .get('/api/intelligence/agents/test-agent/actions?timeWindow=24h&limit=50')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(eventConsumer.getActionsByAgent).mockImplementation(() => {
        throw new Error('Failed to get actions');
      });

      const response = await request(app)
        .get('/api/intelligence/agents/test-agent/actions')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/intelligence/agents/routing-strategy', () => {
    it('should return routing strategy breakdown', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { strategy: 'trigger', count: 50 },
                { strategy: 'ai', count: 30 },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/agents/routing-strategy')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    // eslint-disable-next-line vitest/expect-expect
    it('should accept timeWindow parameter', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as any);

      await request(app).get('/api/intelligence/agents/routing-strategy?timeWindow=7d').expect(200);
    });
  });

  describe('GET /api/intelligence/routing/decisions', () => {
    it('should return routing decisions', async () => {
      vi.mocked(eventConsumer.getRoutingDecisions).mockReturnValue([
        {
          id: '1',
          selectedAgent: 'test-agent',
          confidenceScore: 0.9,
        },
      ] as any);

      const response = await request(app).get('/api/intelligence/routing/decisions').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should accept limit, agent, and minConfidence parameters', async () => {
      vi.mocked(eventConsumer.getRoutingDecisions).mockReturnValue([]);

      const response = await request(app)
        .get('/api/intelligence/routing/decisions?limit=50&agent=test-agent&minConfidence=0.8')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/patterns/discovery', () => {
    it('should return pattern discovery results', async () => {
      // This endpoint is a stub that returns mock data
      const response = await request(app)
        .get('/api/intelligence/patterns/discovery?limit=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/patterns/recent', () => {
    it('should return recent patterns', async () => {
      // Mock table existence check
      vi.mocked(mockDb.execute).mockResolvedValue([{ check: 1 }] as any);

      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                pattern_name: 'TestPattern',
                language: 'python',
                created_at: new Date(),
                correlation_id: 'test-correlation',
              },
            ]),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/recent?limit=20')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return mock data when table does not exist', async () => {
      const tableError = new Error('relation "pattern_lineage_nodes" does not exist');
      (tableError as any).code = '42P01';
      vi.mocked(mockDb.execute).mockRejectedValue(tableError);

      const response = await request(app)
        .get('/api/intelligence/patterns/recent?limit=20')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/patterns/trends', () => {
    it('should return pattern trends', async () => {
      // Mock table existence check
      vi.mocked(mockDb.execute).mockResolvedValueOnce([{ check: 1 }] as any);

      // Mock the trends query
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  period: '2025-01-01',
                  manifestsGenerated: 10,
                  avgPatternsPerManifest: '5',
                  avgQueryTimeMs: '0',
                },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/trends?timeWindow=7d')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when table does not exist', async () => {
      const tableError = new Error('relation "pattern_lineage_nodes" does not exist');
      (tableError as any).code = '42P01';
      vi.mocked(mockDb.execute).mockRejectedValue(tableError);

      const response = await request(app).get('/api/intelligence/patterns/trends').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /api/intelligence/patterns/list', () => {
    it('should return pattern list', async () => {
      vi.mocked(mockDb.execute).mockResolvedValueOnce([{ check: 1 }] as any);
      vi.mocked(mockDb.execute).mockResolvedValueOnce({
        rows: [
          {
            id: 'test-id',
            name: 'TestPattern',
            patternType: 'function',
            language: 'python',
            filePath: '/test/path.py',
            createdAt: new Date().toISOString(),
            qualityScore: 0.85,
            qualityConfidence: 0.9,
          },
        ],
      } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/list?limit=50&offset=0')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when table does not exist', async () => {
      const tableError = new Error('relation "pattern_lineage_nodes" does not exist');
      (tableError as any).code = '42P01';
      vi.mocked(mockDb.execute).mockRejectedValue(tableError);

      const response = await request(app).get('/api/intelligence/patterns/list').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /api/intelligence/patterns/quality-trends', () => {
    it('should return empty array (service no longer exists)', async () => {
      const response = await request(app)
        .get('/api/intelligence/patterns/quality-trends?timeWindow=7d')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /api/intelligence/patterns/performance', () => {
    it('should return pattern performance metrics', async () => {
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  generationSource: 'qdrant',
                  totalManifests: 100,
                  avgTotalMs: '450.5',
                  avgPatterns: '18.2',
                  fallbackCount: 5,
                  avgPatternQueryMs: '200.3',
                  avgInfraQueryMs: '150.2',
                },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app).get('/api/intelligence/patterns/performance').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/patterns/relationships', () => {
    it('should return pattern relationships', async () => {
      vi.mocked(mockDb.execute).mockResolvedValueOnce([{ check: 1 }] as any);

      // Mock the top patterns query (when no patternIdsParam)
      const limitMock = {
        limit: vi.fn().mockResolvedValue([{ id: 'pattern-1' }, { id: 'pattern-2' }]),
        offset: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([{ id: 'pattern-1' }, { id: 'pattern-2' }]),
      };
      const orderByMock = {
        orderBy: vi.fn().mockReturnValue(limitMock),
        limit: vi.fn().mockReturnValue(limitMock),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
      };
      const fromMock = {
        from: vi.fn().mockReturnValue(orderByMock),
        where: vi.fn().mockReturnValue(orderByMock),
        orderBy: vi.fn().mockReturnValue(orderByMock),
        limit: vi.fn().mockReturnValue(limitMock),
      };
      vi.mocked(mockDb.select).mockReturnValueOnce(fromMock as any);

      // Mock the edges query
      const edgesWhereMock = {
        where: vi
          .fn()
          .mockResolvedValue([
            { source: 'pattern-1', target: 'pattern-2', type: 'modified_from', weight: '1.0' },
          ]),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        execute: vi
          .fn()
          .mockResolvedValue([
            { source: 'pattern-1', target: 'pattern-2', type: 'modified_from', weight: '1.0' },
          ]),
      };
      const edgesFromMock = {
        from: vi.fn().mockReturnValue(edgesWhereMock),
        where: vi.fn().mockReturnValue(edgesWhereMock),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      vi.mocked(mockDb.select).mockReturnValueOnce(edgesFromMock as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/relationships')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return empty array when table does not exist', async () => {
      const tableError = new Error('relation "pattern_lineage_nodes" does not exist');
      (tableError as any).code = '42P01';
      vi.mocked(mockDb.execute).mockRejectedValue(tableError);

      const response = await request(app)
        .get('/api/intelligence/patterns/relationships')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /api/intelligence/patterns/by-language', () => {
    it('should return language breakdown', async () => {
      vi.mocked(mockDb.execute).mockResolvedValueOnce([{ check: 1 }] as any);
      vi.mocked(mockDb.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                { language: 'python', pattern_count: 686 },
                { language: 'typescript', pattern_count: 287 },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/by-language?timeWindow=7d')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/intelligence/transformations/summary', () => {
    it('should return transformation summary', async () => {
      // Mock the summary statistics query (first select)
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalTransformations: 56,
              uniqueSourceAgents: 6,
              uniqueTargetAgents: 19,
              avgTransformationTimeMs: '45.5',
              successRate: '0.98',
            },
          ]),
        }),
      } as any);

      // Mock the most common transformation query (second select)
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ source: 'agent-a', target: 'agent-b', count: 13 }]),
              }),
            }),
          }),
        }),
      } as any);

      // Mock the transformation flows query (third select)
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    source: 'agent-a',
                    target: 'agent-b',
                    value: 5,
                    avgConfidence: '0.9',
                    avgDurationMs: '45',
                  },
                ]),
              }),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/transformations/summary?timeWindow=24h')
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('sankey');
      expect(response.body.sankey).toHaveProperty('nodes');
      expect(response.body.sankey).toHaveProperty('links');
    });
  });

  describe('GET /api/intelligence/developer/workflows', () => {
    it('should aggregate workflows with improvement calculation', async () => {
      const selectMock = vi.mocked(mockDb.select);
      selectMock
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    actionType: 'tool_call',
                    completions: 6,
                    avgDurationMs: '1500',
                  },
                ]),
              }),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([
                {
                  actionType: 'tool_call',
                  completions: 3,
                },
              ]),
            }),
          }),
        } as any);

      const response = await request(app).get('/api/intelligence/developer/workflows').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toMatchObject({
        id: 'tool_call',
        name: 'Code Generation',
        completions: 6,
        avgTime: '1.5s',
        improvement: 100,
      });

      selectMock.mockReset();
      selectMock.mockReturnThis();
    });

    it('should handle workflow errors gracefully', async () => {
      vi.mocked(mockDb.select).mockImplementationOnce(() => {
        throw new Error('workflow error');
      });

      const response = await request(app).get('/api/intelligence/developer/workflows').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch developer workflows');
    });
  });

  describe('GET /api/intelligence/developer/velocity', () => {
    it('should format velocity results by hour for 24h window', async () => {
      const selectMock = vi.mocked(mockDb.select);
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  period: new Date('2024-01-01T01:00:00Z').toISOString(),
                  actionCount: 4,
                },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/developer/velocity?timeWindow=24h')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].value).toBe(4);
      expect(response.body[0].time).toMatch(/:\d{2}$/);

      selectMock.mockReset();
      selectMock.mockReturnThis();
    });

    it('should handle velocity errors gracefully', async () => {
      vi.mocked(mockDb.select).mockImplementationOnce(() => {
        throw new Error('velocity error');
      });

      const response = await request(app).get('/api/intelligence/developer/velocity').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch developer velocity');
    });
  });

  describe('GET /api/intelligence/developer/productivity', () => {
    it('should calculate productivity score from success rate and confidence', async () => {
      const selectMock = vi.mocked(mockDb.select);
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  period: new Date('2024-01-01T02:00:00Z').toISOString(),
                  successRate: '0.8',
                  avgConfidence: '0.9',
                },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/developer/productivity?timeWindow=24h')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].value).toBe(72);
      expect(response.body[0].time).toMatch(/:\d{2}$/);

      selectMock.mockReset();
      selectMock.mockReturnThis();
    });

    it('should handle productivity errors gracefully', async () => {
      vi.mocked(mockDb.select).mockImplementationOnce(() => {
        throw new Error('productivity error');
      });

      const response = await request(app)
        .get('/api/intelligence/developer/productivity')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch developer productivity');
    });
  });

  describe('GET /api/intelligence/developer/task-velocity', () => {
    it('should return task velocity with tasks per day calculation', async () => {
      const selectMock = vi.mocked(mockDb.select);
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  period: new Date('2024-01-05T00:00:00Z').toISOString(),
                  tasksCompleted: 5,
                  avgDurationMs: '4500',
                  totalTasks: 6,
                },
              ]),
            }),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/developer/task-velocity?timeWindow=7d')
        .expect(200);

      expect(response.body).toEqual([
        {
          date: '2024-01-05',
          tasksCompleted: 5,
          avgDurationMs: 4500,
          tasksPerDay: 5,
        },
      ]);

      selectMock.mockReset();
      selectMock.mockReturnThis();
    });

    it('should handle task velocity errors gracefully', async () => {
      vi.mocked(mockDb.select).mockImplementationOnce(() => {
        throw new Error('task velocity failure');
      });

      const response = await request(app)
        .get('/api/intelligence/developer/task-velocity')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch task velocity');
    });
  });

  describe('GET /api/intelligence/transformations/recent', () => {
    it('should return recent transformations with total count', async () => {
      const sample = [
        { id: 't1', agent: 'agent-a', success: true },
        { id: 't2', agent: 'agent-b', success: false },
      ];
      vi.mocked(eventConsumer.getRecentTransformations).mockReturnValue(sample as any);

      const response = await request(app)
        .get('/api/intelligence/transformations/recent?limit=10')
        .expect(200);

      expect(response.body).toEqual({
        transformations: sample,
        total: sample.length,
      });
      expect(eventConsumer.getRecentTransformations).toHaveBeenCalledWith(10);

      vi.mocked(eventConsumer.getRecentTransformations).mockReset();
      vi.mocked(eventConsumer.getRecentTransformations).mockReturnValue([]);
    });

    it('should handle transformation errors gracefully', async () => {
      vi.mocked(eventConsumer.getRecentTransformations).mockImplementationOnce(() => {
        throw new Error('transformations down');
      });

      const response = await request(app)
        .get('/api/intelligence/transformations/recent')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch recent transformations');
    });
  });

  describe('GET /api/intelligence/performance/metrics', () => {
    it('should return metrics with stats', async () => {
      const metrics = [{ id: 'm1', routingDurationMs: 45 }];
      const stats = {
        avgRoutingDurationMs: 45,
        cacheHitRate: 0.5,
        totalQueries: 10,
        avgCandidatesEvaluated: 2,
        strategyBreakdown: { enhanced_fuzzy_matching: 7 },
      };
      vi.mocked(eventConsumer.getPerformanceMetrics).mockReturnValue(metrics as any);
      vi.mocked(eventConsumer.getPerformanceStats).mockReturnValue(stats as any);

      const response = await request(app)
        .get('/api/intelligence/performance/metrics?limit=5')
        .expect(200);

      expect(response.body).toEqual({ metrics, stats, total: metrics.length });
      expect(eventConsumer.getPerformanceMetrics).toHaveBeenCalledWith(5);

      vi.mocked(eventConsumer.getPerformanceMetrics).mockReturnValue([]);
      vi.mocked(eventConsumer.getPerformanceStats).mockReturnValue({
        avgRoutingDurationMs: 0,
        cacheHitRate: 0,
        totalQueries: 0,
        avgCandidatesEvaluated: 0,
        strategyBreakdown: {},
      } as any);
    });

    it('should handle performance metrics errors gracefully', async () => {
      vi.mocked(eventConsumer.getPerformanceMetrics).mockImplementationOnce(() => {
        throw new Error('metrics error');
      });

      const response = await request(app).get('/api/intelligence/performance/metrics').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch performance metrics');
    });
  });

  describe('GET /api/intelligence/performance/summary', () => {
    it('should return performance summary stats', async () => {
      const stats = {
        avgRoutingDurationMs: 50,
        cacheHitRate: 0.65,
        totalQueries: 20,
        avgCandidatesEvaluated: 3,
        strategyBreakdown: { enhanced_fuzzy_matching: 15 },
      };
      vi.mocked(eventConsumer.getPerformanceStats).mockReturnValue(stats as any);

      const response = await request(app).get('/api/intelligence/performance/summary').expect(200);

      expect(response.body).toEqual(stats);

      vi.mocked(eventConsumer.getPerformanceStats).mockReturnValue({
        avgRoutingDurationMs: 0,
        cacheHitRate: 0,
        totalQueries: 0,
        avgCandidatesEvaluated: 0,
        strategyBreakdown: {},
      } as any);
    });

    it('should handle performance summary errors gracefully', async () => {
      vi.mocked(eventConsumer.getPerformanceStats).mockImplementationOnce(() => {
        throw new Error('summary failure');
      });

      const response = await request(app).get('/api/intelligence/performance/summary').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch performance summary');
    });
  });

  describe('GET /api/intelligence/documents/top-accessed', () => {
    it('should return documents with trend metadata', async () => {
      const nowIso = new Date().toISOString();
      const selectMock = vi.mocked(mockDb.select);
      selectMock
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'doc-1',
                    repository: 'repo',
                    filePath: '/file.md',
                    accessCount: 12,
                    lastAccessedAt: new Date(nowIso),
                    createdAt: new Date(nowIso),
                  },
                ]),
              }),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue([{ status: 'active', count: 12 }]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi
                .fn()
                .mockResolvedValue([{ nodeType: 'effect', totalCount: 10, compliantCount: 8 }]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    period: nowIso,
                    totalFiles: 10,
                    compliantFiles: 8,
                  },
                ]),
              }),
            }),
          }),
        } as any);

      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date(nowIso).getTime());
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const response = await request(app)
        .get('/api/intelligence/documents/top-accessed?timeWindow=24h&limit=5')
        .expect(200);

      expect(response.body[0]).toMatchObject({
        id: 'doc-1',
        repository: 'repo',
        filePath: '/file.md',
        accessCount: 12,
      });
      dateNowSpy.mockRestore();
      randomSpy.mockRestore();

      selectMock.mockReset();
      selectMock.mockReturnThis();
    });

    it('should handle document query errors', async () => {
      vi.mocked(mockDb.select).mockImplementationOnce(() => {
        throw new Error('document failure');
      });

      const response = await request(app)
        .get('/api/intelligence/documents/top-accessed')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch top accessed documents');
    });
  });

  describe('GET /api/intelligence/code/compliance', () => {
    it('should return empty structure when table missing', async () => {
      const tableError = new Error('relation "onex_compliance_stamps" does not exist') as any;
      tableError.code = '42P01';
      vi.mocked(mockDb.execute).mockRejectedValueOnce(tableError);

      const response = await request(app).get('/api/intelligence/code/compliance').expect(200);

      expect(response.body.summary.totalFiles).toBe(0);
      expect(response.body.statusBreakdown).toEqual([]);
    });

    it('should handle compliance errors', async () => {
      vi.mocked(mockDb.execute).mockRejectedValueOnce(new Error('db unavailable'));

      const response = await request(app).get('/api/intelligence/code/compliance').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch ONEX compliance data');
    });
  });

  describe('GET /api/intelligence/platform/services', () => {
    it('should return formatted platform services', async () => {
      const serviceDate = new Date('2024-02-01T10:00:00Z');
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                id: 'svc-1',
                serviceName: 'API Gateway',
                serviceUrl: 'https://api.local',
                serviceType: 'api',
                healthStatus: 'healthy',
                lastHealthCheck: serviceDate,
              },
            ]),
          }),
        }),
      } as any);

      const response = await request(app).get('/api/intelligence/platform/services').expect(200);

      expect(response.body).toEqual([
        {
          id: 'svc-1',
          serviceName: 'API Gateway',
          serviceUrl: 'https://api.local',
          serviceType: 'api',
          healthStatus: 'healthy',
          lastHealthCheck: serviceDate.toISOString(),
        },
      ]);

      resetSelectMock();
    });

    it('should handle errors fetching platform services', async () => {
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(new Error('registry unavailable')),
          }),
        }),
      } as any);

      const response = await request(app).get('/api/intelligence/platform/services').expect(500);

      expect(response.body).toHaveProperty('error', 'Failed to fetch platform services');

      resetSelectMock();
    });
  });

  describe('GET /api/intelligence/execution/:correlationId', () => {
    it('should return mock execution trace when correlation ID matches mock data', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const response = await request(app)
        .get('/api/intelligence/execution/mock-corr-1')
        .expect(200);

      expect(response.body).toHaveProperty('correlationId', 'mock-corr-1');
      expect(Array.isArray(response.body.actions)).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should assemble execution trace from database results', async () => {
      const decisionCreatedAt = new Date('2024-01-01T00:00:00Z');
      const actionCreatedAt = new Date('2024-01-01T00:01:00Z');

      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userRequest: 'Test request',
                  selectedAgent: 'agent-test',
                  confidenceScore: '0.9',
                  routingStrategy: 'enhanced_fuzzy_matching',
                  routingTimeMs: 45,
                  createdAt: decisionCreatedAt,
                  executionSucceeded: true,
                  alternatives: [],
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  id: 'action-1',
                  actionType: 'tool_call',
                  actionName: 'Read',
                  actionDetails: { file: 'index.ts' },
                  durationMs: 30,
                  createdAt: actionCreatedAt,
                },
              ]),
            }),
          }),
        } as any);

      const response = await request(app).get('/api/intelligence/execution/real-corr').expect(200);

      expect(response.body).toMatchObject({
        correlationId: 'real-corr',
        routingDecision: {
          selectedAgent: 'agent-test',
          routingTimeMs: 45,
        },
      });
      expect(response.body.summary.totalActions).toBe(1);

      resetSelectMock();
    });

    it('should return 404 when execution not found', async () => {
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/execution/missing-corr')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Execution not found');

      resetSelectMock();
    });
  });

  describe('GET /api/intelligence/agents/:agentName/details', () => {
    it('should return agent drill-down metrics', async () => {
      vi.mocked(eventConsumer.getAgentMetrics).mockReturnValueOnce([
        {
          agent: 'agent-1',
          totalRequests: 10,
          avgConfidence: 0.9,
          avgRoutingTime: 50,
        },
      ] as any);
      vi.mocked(eventConsumer.getActionsByAgent).mockReturnValueOnce([
        {
          id: 'action-1',
          actionType: 'tool_call',
          actionName: 'Read',
          actionDetails: { success: true },
          durationMs: 40,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ] as any);

      const response = await request(app)
        .get('/api/intelligence/agents/agent-1/details')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'agent-1',
        status: 'active',
        metrics: {
          totalRequests: 10,
        },
      });
    });

    it('should return 404 when agent not found', async () => {
      vi.mocked(eventConsumer.getAgentMetrics).mockReturnValueOnce([] as any);

      const response = await request(app)
        .get('/api/intelligence/agents/missing-agent/details')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Agent not found');
    });
  });

  describe('GET /api/intelligence/patterns/:patternId/details', () => {
    it('should return pattern details with metrics', async () => {
      vi.mocked(mockDb.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'pattern-1',
                  patternName: 'Authentication Guard',
                  patternType: 'security',
                  metadata: { usageCount: 5, patternCategory: 'auth', description: 'Ensures auth' },
                },
              ]),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([
                    { qualityScore: 0.9 },
                    { qualityScore: 0.8 },
                    { qualityScore: 0.7 },
                  ]),
              }),
            }),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ project: 'agent-api', module: 'module-a' }]),
            }),
          }),
        } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/pattern-1/details')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'pattern-1',
        name: 'Authentication Guard',
        category: 'auth',
        usageExamples: [expect.objectContaining({ module: 'module-a' })],
      });
      expect(response.body.usageExamples[0].project).toContain('agent-a');

      resetSelectMock();
    });

    it('should return 404 when pattern does not exist', async () => {
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/intelligence/patterns/unknown/details')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Pattern not found');

      resetSelectMock();
    });
  });

  describe('GET /api/intelligence/services/:serviceName/details', () => {
    it('should return mapped service health information', async () => {
      vi.mocked(checkAllServices).mockResolvedValueOnce([
        { service: 'PostgreSQL', status: 'up', details: { version: '15' } },
      ] as any);

      const response = await request(app)
        .get('/api/intelligence/services/PostgreSQL/details')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'PostgreSQL',
        status: 'healthy',
        details: { version: '15' },
      });
    });

    it('should return 404 when service is not known', async () => {
      vi.mocked(checkAllServices).mockResolvedValueOnce([
        { service: 'Kafka', status: 'up' },
      ] as any);

      const response = await request(app)
        .get('/api/intelligence/services/Redis/details')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Service not found');
    });
  });

  describe('GET /api/intelligence/trace/:correlationId', () => {
    it('should return trace data for valid correlation ID', async () => {
      const correlationId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock actions query
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'action-1',
              agentName: 'test-agent',
              actionType: 'tool_call',
              actionName: 'read_file',
              actionDetails: {},
              durationMs: 100,
              createdAt: new Date(),
            },
          ]),
        }),
      } as any);

      // Mock manifests query
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'manifest-1',
              agentName: 'test-agent',
              manifestVersion: '1.0',
              generationSource: 'qdrant',
              patternsCount: 5,
              infrastructureServices: [],
              totalQueryTimeMs: 200,
              routingDecisionId: 'routing-1',
              createdAt: new Date(),
            },
          ]),
        }),
      } as any);

      // Mock routing decisions query — direct lookup by correlation_id
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'routing-1',
              selectedAgent: 'test-agent',
              confidenceScore: '0.9',
              routingStrategy: 'fuzzy_matching',
              userRequest: 'test request',
              reasoning: 'test reasoning',
              alternatives: [],
              routingTimeMs: 50,
              createdAt: new Date(),
            },
          ]),
        }),
      } as any);

      // Mock routing decisions query — FK lookup via manifest.routingDecisionId
      vi.mocked(mockDb.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'routing-1',
              selectedAgent: 'test-agent',
              confidenceScore: '0.9',
              routingStrategy: 'fuzzy_matching',
              userRequest: 'test request',
              reasoning: 'test reasoning',
              alternatives: [],
              routingTimeMs: 50,
              createdAt: new Date(),
            },
          ]),
        }),
      } as any);

      const response = await request(app)
        .get(`/api/intelligence/trace/${correlationId}`)
        .expect(200);

      expect(response.body).toHaveProperty('correlationId', correlationId);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('summary');
    });

    it('should return 400 for invalid correlation ID format', async () => {
      const response = await request(app).get('/api/intelligence/trace/invalid-id').expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid correlation ID format');
    });
  });
});
