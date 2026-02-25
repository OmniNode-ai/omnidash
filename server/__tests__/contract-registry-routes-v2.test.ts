/**
 * Contract Registry Routes — OMN-2534 additions
 *
 * Tests for:
 * - GET /versions/:contractId/:version — read_contract_version
 * - GET /diff-versions?from=&to= — diff_versions with breaking change detection
 * - Event emission on publish, deprecate, archive
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock contract event emitter (fire-and-forget — just verify it's called)
vi.mock('../contract-event-emitter', () => ({
  contractEventEmitter: {
    emit: vi.fn().mockResolvedValue(undefined),
  },
}));

// Create a properly chaining mock database
const createMockDb = () => {
  const mockDb: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    and: vi.fn(),
  };

  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.where.mockReturnValue(mockDb);
  mockDb.orderBy.mockReturnValue(mockDb);
  mockDb.insert.mockReturnValue(mockDb);
  mockDb.values.mockReturnValue(mockDb);
  mockDb.update.mockReturnValue(mockDb);
  mockDb.set.mockReturnValue(mockDb);

  return mockDb;
};

let mockDb: any;

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

import contractRouter from '../contract-registry-routes';
import { contractEventEmitter } from '../contract-event-emitter';
import type { Contract } from '@shared/intelligence-schema';

// Minimal valid contract fixture
const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'test-uuid-1',
  contractId: 'user-auth-orchestrator',
  name: 'user_auth_orchestrator',
  displayName: 'User Auth Orchestrator',
  type: 'orchestrator',
  status: 'draft',
  version: '1.0.0',
  description: 'Test contract',
  schema: {
    contract_schema_version: '1.0.0',
    determinism_class: 'nondeterministic',
    node_identity: {
      name: 'user_auth_orchestrator',
      display_name: 'User Auth Orchestrator',
      version: '1.0.0',
      description: 'Test contract',
    },
  },
  metadata: {},
  createdBy: 'test-user',
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('Contract Registry Routes — OMN-2534 additions', () => {
  let app: Express;

  beforeEach(() => {
    mockDb = createMockDb();
    app = express();
    app.use(express.json());
    app.use('/api/contracts', contractRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // read_contract_version: GET /versions/:contractId/:version
  // ============================================================================

  describe('GET /versions/:contractId/:version', () => {
    it('should return the contract for a matching contractId + version', async () => {
      const contract = makeContract({ status: 'published' });
      mockDb.where.mockResolvedValue([contract]);

      const response = await request(app)
        .get('/api/contracts/versions/user-auth-orchestrator/1.0.0')
        .expect(200);

      expect(response.body.contractId).toBe('user-auth-orchestrator');
      expect(response.body.version).toBe('1.0.0');
    });

    it('should return 404 when no matching version exists', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/contracts/versions/user-auth-orchestrator/9.9.9')
        .expect(404);

      expect(response.body.error).toBe('Contract version not found');
      expect(response.body.contractId).toBe('user-auth-orchestrator');
      expect(response.body.version).toBe('9.9.9');
    });

    it('should return 503 when database is unavailable', async () => {
      const { getIntelligenceDb } = await import('../storage');
      vi.mocked(getIntelligenceDb).mockReturnValue(null as any);

      const response = await request(app)
        .get('/api/contracts/versions/user-auth-orchestrator/1.0.0')
        .expect(503);

      expect(response.body.error).toBe('Database unavailable');
    });
  });

  // ============================================================================
  // diff_versions: GET /diff-versions?from=&to=
  // ============================================================================

  describe('GET /diff-versions', () => {
    it('should return diff and breaking change analysis for two versions', async () => {
      const fromContract = makeContract({ id: 'uuid-v1', version: '1.0.0' });
      const toContract = makeContract({
        id: 'uuid-v2',
        version: '2.0.0',
        schema: {
          contract_schema_version: '1.0.0',
          determinism_class: 'nondeterministic',
          node_identity: {
            name: 'user_auth_orchestrator',
            display_name: 'User Auth Orchestrator',
            version: '2.0.0',
            description: 'Updated contract',
          },
        },
      });

      // first where = from, second where = to
      mockDb.where
        .mockResolvedValueOnce([fromContract])
        .mockResolvedValueOnce([toContract]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=uuid-v2')
        .expect(200);

      expect(response.body).toHaveProperty('from');
      expect(response.body).toHaveProperty('to');
      expect(response.body).toHaveProperty('diff');
      expect(response.body).toHaveProperty('breakingChanges');
      expect(response.body.from.version).toBe('1.0.0');
      expect(response.body.to.version).toBe('2.0.0');
      expect(response.body.diff).toHaveProperty('lines');
      expect(response.body.diff).toHaveProperty('additions');
      expect(response.body.diff).toHaveProperty('deletions');
      expect(response.body.breakingChanges).toHaveProperty('hasBreakingChanges');
      expect(response.body.breakingChanges).toHaveProperty('breakingChanges');
      expect(response.body.breakingChanges).toHaveProperty('nonBreakingChanges');
    });

    it('should return 400 when from or to params are missing', async () => {
      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1')
        .expect(400);

      expect(response.body.error).toMatch(/from and to/i);
    });

    it('should return 404 when source version does not exist', async () => {
      mockDb.where
        .mockResolvedValueOnce([]) // from not found
        .mockResolvedValueOnce([makeContract()]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=missing-uuid&to=uuid-v2')
        .expect(404);

      expect(response.body.error).toMatch(/source contract version not found/i);
    });

    it('should return 404 when target version does not exist', async () => {
      mockDb.where
        .mockResolvedValueOnce([makeContract()])
        .mockResolvedValueOnce([]); // to not found

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=missing-uuid')
        .expect(404);

      expect(response.body.error).toMatch(/target contract version not found/i);
    });

    it('should flag breaking changes when a required field is removed', async () => {
      const fromContract = makeContract({
        id: 'uuid-v1',
        version: '1.0.0',
        schema: {
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
          required: ['username', 'password'],
        },
      });
      const toContract = makeContract({
        id: 'uuid-v2',
        version: '2.0.0',
        schema: {
          // 'password' required field removed
          properties: {
            username: { type: 'string' },
          },
          required: ['username'],
        },
      });

      mockDb.where
        .mockResolvedValueOnce([fromContract])
        .mockResolvedValueOnce([toContract]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=uuid-v2')
        .expect(200);

      expect(response.body.breakingChanges.hasBreakingChanges).toBe(true);
      const breaking = response.body.breakingChanges.breakingChanges as any[];
      const removedField = breaking.find((b: any) => b.type === 'removed_required_field');
      expect(removedField).toBeDefined();
      expect(removedField.path).toBe('password');
    });

    it('should flag breaking changes when a field type changes', async () => {
      const fromContract = makeContract({
        id: 'uuid-v1',
        version: '1.0.0',
        schema: {
          properties: {
            count: { type: 'integer' },
          },
          required: [],
        },
      });
      const toContract = makeContract({
        id: 'uuid-v2',
        version: '2.0.0',
        schema: {
          properties: {
            count: { type: 'string' }, // changed from integer → string
          },
          required: [],
        },
      });

      mockDb.where
        .mockResolvedValueOnce([fromContract])
        .mockResolvedValueOnce([toContract]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=uuid-v2')
        .expect(200);

      expect(response.body.breakingChanges.hasBreakingChanges).toBe(true);
      const breaking = response.body.breakingChanges.breakingChanges as any[];
      const typeChange = breaking.find((b: any) => b.type === 'type_changed');
      expect(typeChange).toBeDefined();
      expect(typeChange.path).toBe('count');
    });

    it('should flag breaking changes when a capability is removed from effect_surface', async () => {
      const fromContract = makeContract({
        id: 'uuid-v1',
        version: '1.0.0',
        schema: { effect_surface: ['http_call', 'db_write', 'file_read'] },
      });
      const toContract = makeContract({
        id: 'uuid-v2',
        version: '2.0.0',
        schema: { effect_surface: ['http_call'] }, // db_write and file_read removed
      });

      mockDb.where
        .mockResolvedValueOnce([fromContract])
        .mockResolvedValueOnce([toContract]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=uuid-v2')
        .expect(200);

      expect(response.body.breakingChanges.hasBreakingChanges).toBe(true);
      const capRemovals = response.body.breakingChanges.breakingChanges.filter(
        (b: any) => b.type === 'capability_removed'
      );
      expect(capRemovals).toHaveLength(2);
      const paths = capRemovals.map((b: any) => b.fromValue);
      expect(paths).toContain('db_write');
      expect(paths).toContain('file_read');
    });

    it('should not flag breaking changes for added optional fields', async () => {
      const fromContract = makeContract({
        id: 'uuid-v1',
        version: '1.0.0',
        schema: {
          properties: { username: { type: 'string' } },
          required: ['username'],
        },
      });
      const toContract = makeContract({
        id: 'uuid-v2',
        version: '2.0.0',
        schema: {
          properties: {
            username: { type: 'string' },
            displayName: { type: 'string' }, // new optional field — non-breaking
          },
          required: ['username'],
        },
      });

      mockDb.where
        .mockResolvedValueOnce([fromContract])
        .mockResolvedValueOnce([toContract]);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=uuid-v1&to=uuid-v2')
        .expect(200);

      expect(response.body.breakingChanges.hasBreakingChanges).toBe(false);
      expect(response.body.breakingChanges.breakingChanges).toHaveLength(0);
      expect(response.body.breakingChanges.nonBreakingChanges).toHaveLength(1);
    });

    it('should return 503 when database is unavailable', async () => {
      const { getIntelligenceDb } = await import('../storage');
      vi.mocked(getIntelligenceDb).mockReturnValue(null as any);

      const response = await request(app)
        .get('/api/contracts/diff-versions?from=a&to=b')
        .expect(503);

      expect(response.body.error).toBe('Database unavailable');
    });
  });

  // ============================================================================
  // Event emission on lifecycle transitions
  // ============================================================================

  describe('Event emission', () => {
    it('should emit contract_published event on successful publish', async () => {
      const validatedContract = makeContract({
        id: 'pub-uuid-1',
        status: 'validated',
        schema: {
          contract_schema_version: '1.0.0',
          determinism_class: 'nondeterministic',
          node_identity: {
            name: 'user_auth_orchestrator',
            display_name: 'User Auth Orchestrator',
            version: '1.0.0',
            description: 'Handles user authentication flows for the platform',
          },
        },
      });
      const publishedContract = makeContract({
        id: 'pub-uuid-1',
        status: 'published',
        schema: validatedContract.schema,
      });

      // select (pre-flight check) → returns validated contract
      mockDb.where.mockResolvedValueOnce([validatedContract]);
      // update + returning → returns published contract (same pattern as lifecycle integration test)
      mockDb.returning.mockResolvedValue([publishedContract]);

      await request(app).post('/api/contracts/pub-uuid-1/publish').send({}).expect(200);

      expect(contractEventEmitter.emit).toHaveBeenCalledWith(
        'contract_published',
        expect.objectContaining({
          contractId: 'pub-uuid-1',
          contractLogicalId: 'user-auth-orchestrator',
          version: '1.0.0',
        })
      );
    });

    it('should emit contract_deprecated event on successful deprecation', async () => {
      const publishedContract = makeContract({ id: 'dep-uuid-1', status: 'published' });
      const deprecatedContract = makeContract({ id: 'dep-uuid-1', status: 'deprecated' });

      mockDb.where.mockResolvedValueOnce([publishedContract]);
      mockDb.returning.mockResolvedValue([deprecatedContract]);

      await request(app)
        .post('/api/contracts/dep-uuid-1/deprecate')
        .send({ reason: 'Superseded' })
        .expect(200);

      expect(contractEventEmitter.emit).toHaveBeenCalledWith(
        'contract_deprecated',
        expect.objectContaining({
          contractId: 'dep-uuid-1',
          contractLogicalId: 'user-auth-orchestrator',
          version: '1.0.0',
        })
      );
    });

    it('should emit contract_archived event on successful archival', async () => {
      const deprecatedContract = makeContract({ id: 'arc-uuid-1', status: 'deprecated' });
      const archivedContract = makeContract({ id: 'arc-uuid-1', status: 'archived' });

      mockDb.where.mockResolvedValueOnce([deprecatedContract]);
      mockDb.returning.mockResolvedValue([archivedContract]);

      await request(app)
        .post('/api/contracts/arc-uuid-1/archive')
        .send({ reason: 'Cleaned up' })
        .expect(200);

      expect(contractEventEmitter.emit).toHaveBeenCalledWith(
        'contract_archived',
        expect.objectContaining({
          contractId: 'arc-uuid-1',
          contractLogicalId: 'user-auth-orchestrator',
          version: '1.0.0',
        })
      );
    });
  });
});
