import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import savingsRoutes from '../savings-routes';
import { AgentRunTracker } from '../agent-run-tracker';

// Mock dependencies
vi.mock('../agent-run-tracker', () => ({
  AgentRunTracker: {
    calculateSavingsMetrics: vi.fn().mockReturnValue({
      totalSavings: 1000,
      monthlySavings: 1000,
      weeklySavings: 250,
      dailySavings: 35,
      intelligenceRuns: 100,
      baselineRuns: 100,
      avgTokensPerRun: 500,
      avgComputePerRun: 1.5,
      costPerToken: 0.0001,
      costPerCompute: 0.05,
      efficiencyGain: 25,
      timeSaved: 10,
      dataAvailable: true,
    }),
    recordRun: vi.fn(),
    getRuns: vi.fn().mockReturnValue([]),
    getRunsInRange: vi.fn().mockReturnValue([]),
    getAgentIds: vi.fn().mockReturnValue(['test-agent']),
    getAgentComparison: vi.fn().mockReturnValue({
      agentId: 'test-agent',
      agentName: 'Test Agent',
      withIntelligence: {
        avgTokens: 500,
        avgCompute: 1.0,
        avgTime: 30,
        successRate: 95,
        cost: 0.05,
      },
      withoutIntelligence: {
        avgTokens: 1000,
        avgCompute: 2.0,
        avgTime: 60,
        successRate: 90,
        cost: 0.1,
      },
      savings: { tokens: 500, compute: 1.0, time: 30, cost: 0.05, percentage: 50 },
    }),
  },
}));

describe('Savings Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/savings', savingsRoutes);
    vi.clearAllMocks();
  });

  describe('POST /api/savings/runs', () => {
    it('should record an agent run', async () => {
      const runData = {
        id: 'test-run-id',
        agentId: 'test-agent',
        agentName: 'Test Agent',
        timestamp: new Date().toISOString(),
        withIntelligence: true,
        tokensUsed: 1000,
        computeUnits: 2.0,
        duration: 60,
        success: true,
        cost: 0.1,
      };

      const response = await request(app).post('/api/savings/runs').send(runData).expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/savings/runs').send({}).expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/savings/metrics', () => {
    it('should return savings metrics', async () => {
      const response = await request(app).get('/api/savings/metrics').expect(200);

      expect(response.body).toHaveProperty('totalSavings');
      expect(response.body).toHaveProperty('monthlySavings');
      expect(response.body).toHaveProperty('weeklySavings');
      expect(response.body).toHaveProperty('dailySavings');
      expect(response.body).toHaveProperty('intelligenceRuns');
      expect(response.body).toHaveProperty('baselineRuns');
    });

    it('should accept timeRange parameter', async () => {
      const response = await request(app).get('/api/savings/metrics?timeRange=7d').expect(200);

      expect(response.body).toHaveProperty('totalSavings');
    });

    // eslint-disable-next-line vitest/expect-expect
    it('should handle different time ranges', async () => {
      // supertest .expect() performs assertions
      await request(app).get('/api/savings/metrics?timeRange=30d').expect(200);

      await request(app).get('/api/savings/metrics?timeRange=90d').expect(200);
    });
  });

  describe('GET /api/savings/agents', () => {
    it('should return agent comparisons', async () => {
      vi.mocked(AgentRunTracker.getRuns).mockReturnValue([
        {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          timestamp: new Date().toISOString(),
          withIntelligence: true,
          tokensUsed: 500,
          computeUnits: 1.0,
          duration: 30,
          success: true,
          cost: 0.05,
        },
        {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          timestamp: new Date().toISOString(),
          withIntelligence: false,
          tokensUsed: 1000,
          computeUnits: 2.0,
          duration: 60,
          success: true,
          cost: 0.1,
        },
      ] as any);

      const response = await request(app).get('/api/savings/agents').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should accept timeRange parameter', async () => {
      vi.mocked(AgentRunTracker.getRuns).mockReturnValue([]);

      const response = await request(app).get('/api/savings/agents?timeRange=7d').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/savings/timeseries', () => {
    it('should return time series data', async () => {
      vi.mocked(AgentRunTracker.getRunsInRange).mockReturnValue([
        {
          id: 'run-1',
          agentId: 'test-agent',
          agentName: 'Test Agent',
          timestamp: new Date().toISOString(),
          withIntelligence: true,
          tokensUsed: 500,
          computeUnits: 1.0,
          duration: 30,
          success: true,
          cost: 0.05,
        },
        {
          id: 'run-2',
          agentId: 'test-agent',
          agentName: 'Test Agent',
          timestamp: new Date().toISOString(),
          withIntelligence: false,
          tokensUsed: 1000,
          computeUnits: 2.0,
          duration: 60,
          success: true,
          cost: 0.1,
        },
      ] as any);

      const response = await request(app).get('/api/savings/timeseries?timeRange=7d').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/savings/providers', () => {
    it('should return provider savings data', async () => {
      vi.mocked(AgentRunTracker.getRunsInRange).mockReturnValue([
        {
          id: 'run-1',
          agentId: 'test-agent',
          agentName: 'Test Agent',
          timestamp: new Date().toISOString(),
          withIntelligence: true,
          tokensUsed: 500,
          computeUnits: 1.0,
          duration: 30,
          success: true,
          cost: 0.05,
          metadata: { provider: 'anthropic' },
        },
      ] as any);

      const response = await request(app).get('/api/savings/providers?timeRange=30d').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/savings/breakdown', () => {
    it('should return cost breakdown', async () => {
      const response = await request(app).get('/api/savings/breakdown?timeRange=30d').expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
