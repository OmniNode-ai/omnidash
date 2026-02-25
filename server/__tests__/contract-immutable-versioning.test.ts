/**
 * Tests for OMN-2559: Immutable versioning, version history browser, breaking change detection
 *
 * Covers:
 * - GET /by-contract-id/:contractId — fetch all versions of a contract
 * - POST /diff-versions — breaking change analysis
 * - PUT /:id immutability enforcement (published/deprecated/archived contracts)
 * - Breaking change detection logic (field_removed, type_changed, required_added, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Create a properly chaining mock database
const createMockDb = () => {
  const mockDb: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };

  mockDb['select'].mockReturnValue(mockDb);
  mockDb['from'].mockReturnValue(mockDb);
  mockDb['where'].mockReturnValue(mockDb);
  mockDb['orderBy'].mockReturnValue(mockDb);
  mockDb['insert'].mockReturnValue(mockDb);
  mockDb['values'].mockReturnValue(mockDb);
  mockDb['update'].mockReturnValue(mockDb);
  mockDb['set'].mockReturnValue(mockDb);

  return mockDb;
};

let mockDb: ReturnType<typeof createMockDb>;

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

import contractRouter from '../contract-registry-routes';
import type { Contract } from '@shared/intelligence-schema';

// Minimal Contract factory for tests
function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-uuid-1',
    contractId: 'my-effect',
    name: 'my-effect',
    displayName: 'My Effect',
    type: 'effect',
    status: 'published',
    version: '1.0.0',
    description: 'Test contract',
    schema: {},
    metadata: {},
    createdBy: 'test-user',
    updatedBy: 'test-user',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('OMN-2559: Immutable Versioning & Breaking Change Detection', () => {
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
  // GET /by-contract-id/:contractId — version history browser
  // ============================================================================

  describe('GET /by-contract-id/:contractId', () => {
    it('returns all versions for a contractId, newest first', async () => {
      const v1 = makeContract({ id: 'uuid-1', version: '1.0.0', status: 'published' });
      const v2 = makeContract({ id: 'uuid-2', version: '2.0.0', status: 'published' });
      const draft = makeContract({ id: 'uuid-3', version: '2.1.0', status: 'draft' });

      // The DB mock returns in the order the API returns (desc updatedAt)
      mockDb['returning'].mockResolvedValue([draft, v2, v1]);
      mockDb['orderBy'].mockResolvedValue([draft, v2, v1]);

      const response = await request(app)
        .get('/api/contracts/by-contract-id/my-effect')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);
    });

    it('returns empty array when contractId has no contracts', async () => {
      mockDb['orderBy'].mockResolvedValue([]);

      const response = await request(app)
        .get('/api/contracts/by-contract-id/nonexistent')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  // ============================================================================
  // POST /diff-versions — breaking change analysis
  // ============================================================================

  describe('POST /diff-versions', () => {
    it('returns 400 when fromId or toId is missing', async () => {
      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'some-id' })
        .expect(400);

      expect(response.body.error).toMatch(/fromId|toId/);
    });

    it('returns 404 when fromId does not exist', async () => {
      // First call (fromId) returns empty, second (toId) would return something
      mockDb['where']
        .mockResolvedValueOnce([]) // fromId not found
        .mockResolvedValueOnce([makeContract({ id: 'to-uuid' })]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'missing-from', toId: 'some-to' })
        .expect(404);

      expect(response.body.error).toContain('fromId');
    });

    it('detects no breaking changes between identical contracts', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(false);
      expect(response.body.breakingChanges).toHaveLength(0);
      expect(response.body.recommendedBump).toBe('patch');
    });

    it('detects field_removed as a breaking change', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: {
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: {
          properties: {
            name: { type: 'string' },
            // 'age' removed
          },
        },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(true);
      expect(response.body.recommendedBump).toBe('major');
      const categories = response.body.breakingChanges.map((c: { category: string }) => c.category);
      expect(categories).toContain('field_removed');
    });

    it('detects field_type_changed as a breaking change', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: { properties: { count: { type: 'number' } } },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: { properties: { count: { type: 'string' } } },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(true);
      const categories = response.body.breakingChanges.map((c: { category: string }) => c.category);
      expect(categories).toContain('field_type_changed');
    });

    it('detects determinism_class_changed as a breaking change', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: { determinism_class: 'deterministic' },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: { determinism_class: 'nondeterministic' },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(true);
      const categories = response.body.breakingChanges.map((c: { category: string }) => c.category);
      expect(categories).toContain('determinism_class_changed');
    });

    it('detects node_type_changed as a breaking change', async () => {
      const from = makeContract({ id: 'from-uuid', version: '1.0.0', type: 'effect' });
      const to = makeContract({ id: 'to-uuid', version: '1.0.1', type: 'compute' });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(true);
      const categories = response.body.breakingChanges.map((c: { category: string }) => c.category);
      expect(categories).toContain('node_type_changed');
    });

    it('detects enum_value_removed as a breaking change', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: {
          properties: {
            status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
          },
        },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: {
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] }, // 'pending' removed
          },
        },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(true);
      const categories = response.body.breakingChanges.map((c: { category: string }) => c.category);
      expect(categories).toContain('enum_value_removed');
    });

    it('recommends minor bump when new optional fields are added', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '1.0.0',
        schema: { properties: { name: { type: 'string' } } },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '1.0.1',
        schema: {
          properties: {
            name: { type: 'string' },
            description: { type: 'string' }, // new optional field
          },
        },
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.hasBreakingChanges).toBe(false);
      expect(response.body.recommendedBump).toBe('minor');
    });

    it('returns toVersionSuggested as MAJOR bump when breaking changes detected', async () => {
      const from = makeContract({
        id: 'from-uuid',
        version: '2.3.1',
        schema: { properties: { name: { type: 'string' } } },
      });
      const to = makeContract({
        id: 'to-uuid',
        version: '2.3.2',
        schema: { properties: {} }, // 'name' removed
      });

      mockDb['where'].mockResolvedValueOnce([from]).mockResolvedValueOnce([to]);

      const response = await request(app)
        .post('/api/contracts/diff-versions')
        .send({ fromId: 'from-uuid', toId: 'to-uuid' })
        .expect(200);

      expect(response.body.toVersionSuggested).toBe('3.0.0');
      expect(response.body.fromVersion).toBe('2.3.1');
    });
  });

  // ============================================================================
  // PUT /:id — Immutability enforcement
  // ============================================================================

  describe('PUT /:id — Immutability enforcement', () => {
    it('rejects updates to published contracts with 409', async () => {
      const published = makeContract({ id: 'pub-uuid', status: 'published' });
      mockDb['where'].mockResolvedValue([published]);

      const response = await request(app)
        .put('/api/contracts/pub-uuid')
        .send({ description: 'Updated description' })
        .expect(409);

      expect(response.body.error).toMatch(/published/i);
    });

    it('rejects updates to deprecated contracts with 409', async () => {
      const deprecated = makeContract({ id: 'dep-uuid', status: 'deprecated' });
      mockDb['where'].mockResolvedValue([deprecated]);

      const response = await request(app)
        .put('/api/contracts/dep-uuid')
        .send({ description: 'Updated description' })
        .expect(409);

      expect(response.body.error).toMatch(/deprecated/i);
    });

    it('rejects updates to archived contracts with 409', async () => {
      const archived = makeContract({ id: 'arc-uuid', status: 'archived' });
      mockDb['where'].mockResolvedValue([archived]);

      const response = await request(app)
        .put('/api/contracts/arc-uuid')
        .send({ description: 'Updated description' })
        .expect(409);

      expect(response.body.error).toMatch(/archived/i);
    });

    it('allows updates to draft contracts', async () => {
      const draft = makeContract({ id: 'draft-uuid', status: 'draft' });
      const updated = { ...draft, description: 'Updated', status: 'draft' };

      // First call: select to fetch the existing contract
      // Second call chain: update().set().where().returning() for the actual update
      // The mock needs separate resolution for select-chain vs update-chain
      let callCount = 0;
      mockDb['where'].mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // SELECT chain — return the existing draft
          return Promise.resolve([draft]);
        }
        // UPDATE chain — return the updated contract via returning()
        return {
          ...mockDb,
          returning: vi.fn().mockResolvedValue([updated]),
        };
      });

      const response = await request(app)
        .put('/api/contracts/draft-uuid')
        .send({ description: 'Updated' })
        .expect(200);

      expect(response.body.description).toBe('Updated');
    });
  });
});
