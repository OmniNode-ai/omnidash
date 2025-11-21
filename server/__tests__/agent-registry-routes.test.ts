import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import yaml from 'js-yaml';

const trackerMocks = {
  startExecution: vi.fn(),
  updateExecutionStatus: vi.fn(),
  getExecution: vi.fn(),
  getExecutionsForAgent: vi.fn(),
  getRecentExecutions: vi.fn(),
  getExecutionStats: vi.fn(),
  getAgentPerformanceMetrics: vi.fn(),
};

const polymorphicMocks = {
  simulateRoutingDecision: vi.fn(),
  executeAgent: vi.fn(),
  getRoutingStatistics: vi.fn(),
  getAgentPerformanceComparison: vi.fn(),
};

vi.mock('../agent-execution-tracker', () => ({
  AgentExecutionTracker: trackerMocks,
}));

vi.mock('../polymorphic-agent-integration', () => ({
  PolymorphicAgentIntegration: polymorphicMocks,
}));

describe('agent-registry routes', () => {
  let app: express.Express;
  let currentRegistry: any;
  let routerModule: express.Router;
  const originalEnv = { ...process.env };

  const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
  const yamlLoadSpy = vi.spyOn(yaml, 'load');

  const SAMPLE_METRICS = {
    totalRuns: 25,
    successRate: 92,
    avgExecutionTime: 45,
    avgQualityScore: 8.7,
    lastUsed: '2024-01-01T00:00:00Z',
    popularity: 80,
    efficiency: 88,
  };

  const clone = <T>(value: T): T =>
    typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

  const SAMPLE_REGISTRY = {
    agents: {
      'agent-alpha': {
        name: 'Agent Alpha',
        title: 'Alpha Specialist',
        description: 'Handles alpha tasks',
        category: 'development',
        status: 'active',
        priority: 'high',
        color: 'green',
        tags: ['alpha', 'dev'],
        capabilities: {
          strategy: {
            name: 'Strategy',
            description: 'Strategic planning',
            category: 'planning',
            level: 'expert',
          },
        },
      },
      'agent-beta': {
        name: 'Agent Beta',
        title: 'Beta Analyst',
        description: 'Analyzes beta metrics',
        category: 'analysis',
        status: 'inactive',
        priority: 'medium',
        tags: ['beta'],
        capabilities: {
          analytics: {
            name: 'Analytics',
            description: 'Performs analytics',
            category: 'analysis',
            level: 'intermediate',
          },
        },
      },
    },
    categories: {
      development: {
        description: 'Development agents',
        count: 5,
        color: 'blue',
        priority: 'high',
      },
      analysis: {
        description: 'Analysis agents',
        count: 3,
      },
    },
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env = { ...originalEnv };
    process.env.AGENT_DEFINITIONS_PATH = '/fake/definitions';

    currentRegistry = clone(SAMPLE_REGISTRY);

    readFileSyncSpy.mockImplementation(() => 'yaml-content');
    yamlLoadSpy.mockImplementation(() => currentRegistry);

    trackerMocks.getAgentPerformanceMetrics.mockImplementation((agentId: string) => ({
      ...SAMPLE_METRICS,
      totalRuns: agentId === 'agent-beta' ? 15 : SAMPLE_METRICS.totalRuns,
      successRate: agentId === 'agent-beta' ? 85 : SAMPLE_METRICS.successRate,
      efficiency: agentId === 'agent-beta' ? 72 : SAMPLE_METRICS.efficiency,
    }));
    trackerMocks.getExecution.mockReturnValue({ id: 'exec-1', status: 'completed' });
    trackerMocks.getExecutionsForAgent.mockReturnValue([{ id: 'exec-2' }]);
    trackerMocks.getRecentExecutions.mockReturnValue([{ id: 'exec-3' }]);
    trackerMocks.getExecutionStats.mockReturnValue({ total: 10 });
    trackerMocks.startExecution.mockReturnValue({
      id: 'exec-123',
      status: 'executing',
      startedAt: '2024-01-01T00:00:00Z',
    });

    polymorphicMocks.simulateRoutingDecision.mockResolvedValue({
      selectedAgent: 'agent-alpha',
      confidence: 0.92,
    });
    polymorphicMocks.executeAgent.mockResolvedValue({ result: 'ok' });
    polymorphicMocks.getRoutingStatistics.mockReturnValue({ accuracy: 95 });
    polymorphicMocks.getAgentPerformanceComparison.mockReturnValue({
      comparison: 'data',
    });

    const router = (await import('../agent-registry-routes')).default;
    routerModule = router;
    app = express();
    app.use(express.json());
    app.use('/registry', router);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns transformed agents with filters applied', async () => {
    const response = await request(app).get('/registry/agents?category=development&search=alpha');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 'Agent Alpha',
      title: 'Alpha Specialist',
      performance: expect.objectContaining({ totalRuns: SAMPLE_METRICS.totalRuns }),
    });
  });

  it('returns 500 when registry cannot be loaded', async () => {
    currentRegistry = null;
    const response = await request(app).get('/registry/agents');
    expect(response.status).toBe(500);
  });

  it('returns specific agent or 404', async () => {
    let response = await request(app).get('/registry/agents/agent-alpha');
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Agent Alpha');

    response = await request(app).get('/registry/agents/unknown');
    expect(response.status).toBe(404);
  });

  it('returns categories list', async () => {
    const response = await request(app).get('/registry/categories');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({ name: 'development', count: 5 });
  });

  it('returns unique capabilities optionally filtered by category', async () => {
    let response = await request(app).get('/registry/capabilities');
    expect(response.status).toBe(200);
    expect(response.body.map((cap: any) => cap.name).sort()).toEqual(['Analytics', 'Strategy']);

    response = await request(app).get('/registry/capabilities?category=analysis');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Analytics');
  });

  it('returns agent-specific performance metrics', async () => {
    const response = await request(app).get('/registry/performance?agentId=agent-alpha');
    expect(response.status).toBe(200);
    expect(trackerMocks.getAgentPerformanceMetrics).toHaveBeenCalledWith('agent-alpha');
    expect(response.body.totalRuns).toBe(SAMPLE_METRICS.totalRuns);
  });

  it('returns performance overview when no agentId provided', async () => {
    const response = await request(app).get('/registry/performance');
    expect(response.status).toBe(200);
    expect(response.body.totalAgents).toBe(2);
    expect(response.body.topPerformers[0]).toHaveProperty('efficiency');
  });

  it('returns 404 when performance data missing', async () => {
    trackerMocks.getAgentPerformanceMetrics.mockReturnValueOnce(null);
    const response = await request(app).get('/registry/performance?agentId=missing');
    expect(response.status).toBe(404);
  });

  const getRouteHandler = (method: string, routePath: string) => {
    const layer = routerModule.stack.find(
      (entry: any) => entry.route && entry.route.path === routePath && entry.route.methods[method]
    );
    if (!layer) {
      throw new Error(`Route handler for [${method.toUpperCase()}] ${routePath} not found`);
    }
    return layer.route.stack[0].handle;
  };

  it('starts execution for an agent and schedules completion', async () => {
    const handler = getRouteHandler('post', '/agents/:agentId/execute');
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation(((
      cb: (...args: any[]) => void
    ) => {
      cb();
      return 0 as any;
    }) as any);

    const req: any = {
      params: { agentId: 'agent-alpha' },
      body: { query: 'Test query', context: { foo: 'bar' }, routingDecision: { decision: true } },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler(req, res, vi.fn());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'exec-123', status: 'executing' })
    );
    expect(trackerMocks.startExecution).toHaveBeenCalledWith(
      'agent-alpha',
      'Alpha Specialist',
      'Test query',
      { foo: 'bar' },
      { decision: true }
    );
    expect(trackerMocks.updateExecutionStatus).toHaveBeenCalledWith(
      'exec-123',
      'completed',
      expect.any(Object)
    );

    setTimeoutSpy.mockRestore();
  });

  it('returns execution by id or 404 when missing', async () => {
    trackerMocks.getExecution.mockReturnValueOnce({ id: 'exec-1' });
    let response = await request(app).get('/registry/executions/exec-1');
    expect(response.status).toBe(200);

    trackerMocks.getExecution.mockReturnValueOnce(null);
    response = await request(app).get('/registry/executions/missing');
    expect(response.status).toBe(404);
  });

  it('lists executions by agent or recent executions', async () => {
    let response = await request(app).get('/registry/executions?agentId=agent-alpha&limit=5');
    expect(response.status).toBe(200);
    expect(trackerMocks.getExecutionsForAgent).toHaveBeenCalledWith('agent-alpha', 5);

    response = await request(app).get('/registry/executions?limit=2');
    expect(response.status).toBe(200);
    expect(trackerMocks.getRecentExecutions).toHaveBeenCalledWith(2);
  });

  it('returns execution stats with optional time range', async () => {
    const handler = getRouteHandler('get', '/executions/stats');
    const req: any = {
      query: { agentId: 'agent-alpha', timeRange: '7d' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler(req, res, vi.fn());

    expect(trackerMocks.getExecutionStats).toHaveBeenCalledWith(
      'agent-alpha',
      expect.objectContaining({ start: expect.any(Date), end: expect.any(Date) })
    );
    expect(res.json).toHaveBeenCalledWith({ total: 10 });
  });

  it('handles routing decision and execution endpoints', async () => {
    const decideHandler = getRouteHandler('post', '/routing/decide');
    const executeHandler = getRouteHandler('post', '/routing/execute');

    const decideReq: any = { body: { query: 'route', context: { foo: 'bar' } } };
    const decideRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await decideHandler(decideReq, decideRes, vi.fn());
    expect(polymorphicMocks.simulateRoutingDecision).toHaveBeenCalledWith('route', { foo: 'bar' });
    expect(decideRes.json).toHaveBeenCalledWith({ selectedAgent: 'agent-alpha', confidence: 0.92 });

    const executeReq: any = { body: { query: 'execute', context: { fizz: 'buzz' } } };
    const executeRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await executeHandler(executeReq, executeRes, vi.fn());
    expect(polymorphicMocks.executeAgent).toHaveBeenCalled();
    expect(executeRes.json).toHaveBeenCalledWith({
      decision: { selectedAgent: 'agent-alpha', confidence: 0.92 },
      execution: { result: 'ok' },
    });
  });

  it('validates required query payloads', async () => {
    let response = await request(app).post('/registry/routing/decide').send({});
    expect(response.status).toBe(400);

    response = await request(app).post('/registry/routing/execute').send({});
    expect(response.status).toBe(400);
  });

  it('returns routing statistics and performance comparison', async () => {
    let response = await request(app).get('/registry/routing/stats');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accuracy: 95 });

    response = await request(app).get('/registry/routing/performance');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ comparison: 'data' });
  });
});
