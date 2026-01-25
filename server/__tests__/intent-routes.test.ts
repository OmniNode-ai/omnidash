import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { intentRouter } from '../intent-routes';

// Create mock functions using vi.hoisted() so they're available during module loading
const { mockRequest, mockEmitDistributionUpdate, mockEmitIntentStored } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockEmitDistributionUpdate: vi.fn(),
  mockEmitIntentStored: vi.fn(),
}));

// Mock the intelligence event adapter
let mockIntelInstance: {
  started: boolean;
  start: ReturnType<typeof vi.fn>;
  request: typeof mockRequest;
} | null = null;

vi.mock('../intelligence-event-adapter', () => ({
  getIntelligenceEvents: vi.fn(() => mockIntelInstance),
  IntelligenceEventAdapter: vi.fn(),
}));

// Mock the intent event emitter
vi.mock('../intent-events', () => ({
  intentEventEmitter: {
    emitDistributionUpdate: mockEmitDistributionUpdate,
    emitIntentStored: mockEmitIntentStored,
    emitIntentEvent: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
  },
}));

describe('Intent Routes', () => {
  let app: Express;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/intents', intentRouter);
    vi.clearAllMocks();

    // Suppress console.error output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default mock instance setup
    mockIntelInstance = {
      started: true,
      start: vi.fn().mockResolvedValue(undefined),
      request: mockRequest,
    };
    mockRequest.mockResolvedValue({
      distribution: { code_generation: 10, debugging: 5 },
      total_intents: 15,
      execution_time_ms: 42,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ============================================================================
  // GET /api/intents/distribution
  // ============================================================================

  describe('GET /api/intents/distribution', () => {
    it('should return 503 if intelligence adapter unavailable', async () => {
      mockIntelInstance = null;

      const response = await request(app).get('/api/intents/distribution').expect(503);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Intent service unavailable');
      expect(response.body).toHaveProperty('reason', 'Event adapter not configured');
    });

    it('should return distribution with proper structure on success', async () => {
      mockRequest.mockResolvedValue({
        distribution: { code_generation: 25, debugging: 15, documentation: 10 },
        total_intents: 50,
        execution_time_ms: 35,
      });

      const response = await request(app)
        .get('/api/intents/distribution?time_range_hours=24')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('distribution');
      expect(response.body.distribution).toEqual({
        code_generation: 25,
        debugging: 15,
        documentation: 10,
      });
      expect(response.body).toHaveProperty('total_intents', 50);
      expect(response.body).toHaveProperty('time_range_hours', 24);
      expect(response.body).toHaveProperty('execution_time_ms', 35);
    });

    it('should emit distribution update event on success', async () => {
      mockRequest.mockResolvedValue({
        distribution: { testing: 8 },
        total_intents: 8,
        execution_time_ms: 20,
      });

      await request(app).get('/api/intents/distribution').expect(200);

      expect(mockEmitDistributionUpdate).toHaveBeenCalledWith({
        distribution: { testing: 8 },
        total_intents: 8,
        time_range_hours: 24, // default value
      });
    });

    it('should clamp time_range_hours to minimum of 1', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 10,
      });

      const response = await request(app)
        .get('/api/intents/distribution?time_range_hours=-5')
        .expect(200);

      expect(response.body.time_range_hours).toBe(1);
      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_distribution',
        expect.objectContaining({
          time_range_hours: 1,
        }),
        expect.any(Number)
      );
    });

    it('should clamp time_range_hours to maximum of 168 (7 days)', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 10,
      });

      const response = await request(app)
        .get('/api/intents/distribution?time_range_hours=1000')
        .expect(200);

      expect(response.body.time_range_hours).toBe(168);
    });

    it('should use default time_range_hours of 24 when not specified', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 10,
      });

      const response = await request(app).get('/api/intents/distribution').expect(200);

      expect(response.body.time_range_hours).toBe(24);
    });

    it('should return 500 on internal error', async () => {
      mockRequest.mockRejectedValue(new Error('Kafka connection failed'));

      const response = await request(app).get('/api/intents/distribution').expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Kafka connection failed');
    });

    it('should start adapter if not started', async () => {
      mockIntelInstance = {
        started: false,
        start: vi.fn().mockResolvedValue(undefined),
        request: mockRequest,
      };
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 5,
      });

      await request(app).get('/api/intents/distribution').expect(200);

      expect(mockIntelInstance.start).toHaveBeenCalled();
    });

    it('should handle empty distribution response', async () => {
      mockRequest.mockResolvedValue({});

      const response = await request(app).get('/api/intents/distribution').expect(200);

      expect(response.body).toHaveProperty('distribution', {});
      expect(response.body).toHaveProperty('total_intents', 0);
    });
  });

  // ============================================================================
  // GET /api/intents/session/:sessionId
  // ============================================================================

  describe('GET /api/intents/session/:sessionId', () => {
    it('should return 400 if sessionId format invalid', async () => {
      // Session ID with invalid characters (special chars not allowed)
      const response = await request(app)
        .get('/api/intents/session/invalid@session#id!')
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('Invalid sessionId format');
    });

    it('should return 400 if sessionId is too long', async () => {
      const longSessionId = 'a'.repeat(150); // Exceeds 128 character limit
      const response = await request(app).get(`/api/intents/session/${longSessionId}`).expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('Invalid sessionId format');
    });

    it('should return 503 if intelligence adapter unavailable', async () => {
      mockIntelInstance = null;

      const response = await request(app)
        .get('/api/intents/session/valid-session-id-123')
        .expect(503);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Intent service unavailable');
    });

    it('should return session intents with proper structure', async () => {
      mockRequest.mockResolvedValue({
        intents: [
          {
            intent_id: 'intent-1',
            intent_category: 'code_generation',
            confidence: 0.95,
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            intent_id: 'intent-2',
            intent_category: 'debugging',
            confidence: 0.88,
            created_at: '2024-01-01T00:01:00Z',
          },
        ],
        total_count: 2,
        execution_time_ms: 28,
      });

      const response = await request(app)
        .get('/api/intents/session/test-session-abc123')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('session_id', 'test-session-abc123');
      expect(response.body).toHaveProperty('intents');
      expect(response.body.intents).toHaveLength(2);
      expect(response.body).toHaveProperty('total_count', 2);
      expect(response.body).toHaveProperty('execution_time_ms', 28);
    });

    it('should accept valid UUID format sessionId', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 15,
      });

      const response = await request(app)
        .get('/api/intents/session/123e4567-e89b-12d3-a456-426614174000')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('session_id', '123e4567-e89b-12d3-a456-426614174000');
    });

    it('should accept alphanumeric with hyphens and underscores', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      const response = await request(app)
        .get('/api/intents/session/my_session-123_test')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
    });

    it('should respect min_confidence parameter', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 12,
      });

      await request(app).get('/api/intents/session/test-session?min_confidence=0.8').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_session',
        expect.objectContaining({
          min_confidence: 0.8,
        }),
        expect.any(Number)
      );
    });

    it('should clamp min_confidence to valid range [0, 1]', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      await request(app).get('/api/intents/session/test-session?min_confidence=1.5').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_session',
        expect.objectContaining({
          min_confidence: 1, // clamped to 1
        }),
        expect.any(Number)
      );
    });

    it('should respect limit parameter', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      await request(app).get('/api/intents/session/test-session?limit=50').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_session',
        expect.objectContaining({
          limit: 50,
        }),
        expect.any(Number)
      );
    });

    it('should clamp limit to maximum of 1000', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      await request(app).get('/api/intents/session/test-session?limit=5000').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_session',
        expect.objectContaining({
          limit: 1000,
        }),
        expect.any(Number)
      );
    });

    it('should return 500 on internal error', async () => {
      mockRequest.mockRejectedValue(new Error('Database query failed'));

      const response = await request(app).get('/api/intents/session/valid-session').expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Database query failed');
    });

    it('should handle empty intents response', async () => {
      mockRequest.mockResolvedValue({});

      const response = await request(app).get('/api/intents/session/empty-session').expect(200);

      expect(response.body).toHaveProperty('intents', []);
      expect(response.body).toHaveProperty('total_count', 0);
    });
  });

  // ============================================================================
  // GET /api/intents/recent
  // ============================================================================

  describe('GET /api/intents/recent', () => {
    it('should return 503 if intelligence adapter unavailable', async () => {
      mockIntelInstance = null;

      const response = await request(app).get('/api/intents/recent').expect(503);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Intent service unavailable');
    });

    it('should return recent intents with proper structure', async () => {
      mockRequest.mockResolvedValue({
        intents: [
          {
            intent_id: 'recent-1',
            session_id: 'session-a',
            intent_category: 'testing',
            confidence: 0.92,
            created_at: '2024-01-01T10:00:00Z',
          },
        ],
        total_count: 1,
        execution_time_ms: 18,
      });

      const response = await request(app).get('/api/intents/recent').expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('intents');
      expect(response.body.intents).toHaveLength(1);
      expect(response.body).toHaveProperty('total_count', 1);
      expect(response.body).toHaveProperty('time_range_hours', 1); // default
      expect(response.body).toHaveProperty('execution_time_ms', 18);
    });

    it('should respect limit parameter bounds (min 1, max 100)', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      // Test minimum bound
      await request(app).get('/api/intents/recent?limit=-10').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_recent',
        expect.objectContaining({
          limit: 1,
        }),
        expect.any(Number)
      );

      vi.clearAllMocks();
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      // Test maximum bound
      await request(app).get('/api/intents/recent?limit=500').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_recent',
        expect.objectContaining({
          limit: 100,
        }),
        expect.any(Number)
      );
    });

    it('should use default limit of 50 when not specified', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      await request(app).get('/api/intents/recent').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_recent',
        expect.objectContaining({
          limit: 50,
        }),
        expect.any(Number)
      );
    });

    it('should clamp time_range_hours to maximum of 168 (7 days)', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      const response = await request(app)
        .get('/api/intents/recent?time_range_hours=1000')
        .expect(200);

      expect(response.body.time_range_hours).toBe(168);
    });

    it('should respect min_confidence parameter', async () => {
      mockRequest.mockResolvedValue({
        intents: [],
        total_count: 0,
        execution_time_ms: 10,
      });

      await request(app).get('/api/intents/recent?min_confidence=0.7').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_recent',
        expect.objectContaining({
          min_confidence: 0.7,
        }),
        expect.any(Number)
      );
    });

    it('should return 500 on internal error', async () => {
      mockRequest.mockRejectedValue(new Error('Service timeout'));

      const response = await request(app).get('/api/intents/recent').expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Service timeout');
    });

    it('should handle empty intents response', async () => {
      mockRequest.mockResolvedValue({});

      const response = await request(app).get('/api/intents/recent').expect(200);

      expect(response.body).toHaveProperty('intents', []);
      expect(response.body).toHaveProperty('total_count', 0);
    });
  });

  // ============================================================================
  // POST /api/intents/store
  // ============================================================================

  describe('POST /api/intents/store', () => {
    it('should return 400 if session_id missing', async () => {
      const response = await request(app)
        .post('/api/intents/store')
        .send({ intent_category: 'code_generation' })
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('session_id and intent_category are required');
    });

    it('should return 400 if intent_category missing', async () => {
      const response = await request(app)
        .post('/api/intents/store')
        .send({ session_id: 'test-session-123' })
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('session_id and intent_category are required');
    });

    it('should return 400 if both session_id and intent_category missing', async () => {
      const response = await request(app).post('/api/intents/store').send({}).expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('session_id and intent_category are required');
    });

    it('should return 400 if session_id format invalid', async () => {
      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'invalid@session!id#',
          intent_category: 'debugging',
        })
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('Invalid session_id format');
    });

    it('should return 503 if intelligence adapter unavailable', async () => {
      mockIntelInstance = null;

      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'valid-session-123',
          intent_category: 'code_generation',
        })
        .expect(503);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Intent service unavailable');
    });

    it('should emit intent stored event on success', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        intent_id: 'new-intent-uuid',
        created: true,
        execution_time_ms: 45,
      });

      await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'my-session-123',
          intent_category: 'testing',
          confidence: 0.85,
          keywords: ['unit', 'test'],
        })
        .expect(200);

      expect(mockEmitIntentStored).toHaveBeenCalledWith(
        expect.objectContaining({
          intent_id: 'new-intent-uuid',
          session_id: 'my-session-123',
          intent_category: 'testing',
          confidence: 0.85,
          keywords: ['unit', 'test'],
        })
      );
    });

    it('should return success response with proper structure', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        intent_id: 'stored-intent-id',
        created: true,
        execution_time_ms: 30,
      });

      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'documentation',
          confidence: 0.9,
          keywords: ['readme', 'docs'],
          user_context: 'Updating documentation',
        })
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('intent_id', 'stored-intent-id');
      expect(response.body).toHaveProperty('session_id', 'test-session');
      expect(response.body).toHaveProperty('created', true);
      expect(response.body).toHaveProperty('execution_time_ms', 30);
    });

    it('should use default confidence of 0.5 when not provided', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        intent_id: 'test-intent',
        created: true,
        execution_time_ms: 20,
      });

      await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'refactoring',
        })
        .expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_store',
        expect.objectContaining({
          confidence: 0.5,
        }),
        expect.any(Number)
      );
    });

    it('should use empty array for keywords when not provided', async () => {
      mockRequest.mockResolvedValue({
        success: true,
        intent_id: 'test-intent',
        created: true,
        execution_time_ms: 20,
      });

      await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'analysis', // valid category
        })
        .expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_store',
        expect.objectContaining({
          keywords: [],
        }),
        expect.any(Number)
      );
    });

    it('should return 400 for invalid intent_category', async () => {
      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'invalid_category',
        })
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body.error).toContain('Invalid intent_category');
      expect(response.body.error).toContain('Must be one of');
    });

    it('should not emit event if request fails', async () => {
      mockRequest.mockResolvedValue({
        success: false,
        error: 'Storage failed',
        execution_time_ms: 15,
      });

      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'debugging',
        })
        .expect(200);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Storage failed');
      expect(mockEmitIntentStored).not.toHaveBeenCalled();
    });

    it('should return 500 on internal error', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'testing',
        })
        .expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockRequest.mockRejectedValue('String error');

      const response = await request(app)
        .post('/api/intents/store')
        .send({
          session_id: 'test-session',
          intent_category: 'testing',
        })
        .expect(500);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'String error');
    });
  });

  // ============================================================================
  // Edge cases and validation
  // ============================================================================

  describe('Edge cases and validation', () => {
    it('should handle timeout parameter correctly in distribution', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 5,
      });

      await request(app).get('/api/intents/distribution?timeout=15000').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_distribution',
        expect.any(Object),
        15000
      );
    });

    it('should clamp timeout to minimum of 1000ms', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 5,
      });

      await request(app).get('/api/intents/distribution?timeout=100').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_distribution',
        expect.any(Object),
        1000
      );
    });

    it('should clamp timeout to maximum of 30000ms', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 5,
      });

      await request(app).get('/api/intents/distribution?timeout=60000').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_distribution',
        expect.any(Object),
        30000
      );
    });

    it('should include correlation_id in all requests', async () => {
      mockRequest.mockResolvedValue({
        distribution: {},
        total_intents: 0,
        execution_time_ms: 5,
      });

      await request(app).get('/api/intents/distribution').expect(200);

      expect(mockRequest).toHaveBeenCalledWith(
        'intent_query_distribution',
        expect.objectContaining({
          correlation_id: expect.any(String),
        }),
        expect.any(Number)
      );
    });
  });
});
