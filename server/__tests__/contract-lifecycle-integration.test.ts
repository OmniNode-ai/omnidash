import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import type { Contract, ContractAuditLog } from '@shared/intelligence-schema';

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
  };

  // Set up method chaining
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

describe('Contract Lifecycle - Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    mockDb = createMockDb();
    app = express();
    app.use(express.json());
    app.use('/api/intelligence/contracts', contractRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Lifecycle: Draft → Validated → Published → Deprecated → Archived', () => {
    it('should successfully transition through all lifecycle stages', async () => {
      // Step 1: Create draft contract
      const draftContract: Contract = {
        id: 'contract-1',
        contractId: 'user-authentication-orchestrator',
        name: 'user-authentication-orchestrator',
        displayName: 'User Authentication Orchestrator',
        type: 'orchestrator',
        status: 'draft',
        version: '0.1.0',
        description: 'Handles user authentication flows across multiple providers',
        schema: {
          inputs: ['username', 'password', 'mfaToken'],
          outputs: ['authToken', 'refreshToken', 'userId'],
          providers: ['local', 'oauth', 'saml'],
        },
        metadata: {
          team: 'platform-security',
          contact: 'security@example.com',
        },
        createdBy: 'john.doe',
        updatedBy: 'john.doe',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-01T10:00:00Z'),
      };

      mockDb.returning.mockResolvedValue([draftContract]);

      const createResponse = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'user-authentication-orchestrator',
          displayName: 'User Authentication Orchestrator',
          type: 'orchestrator',
          description: 'Handles user authentication flows across multiple providers',
        })
        .expect(201);

      expect(createResponse.body.status).toBe('draft');
      expect(createResponse.body.version).toBe('0.1.0');

      // Step 2: Validate contract
      const validatedContract: Contract = {
        ...draftContract,
        status: 'validated',
        updatedAt: new Date('2024-01-02T14:30:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([draftContract]);
      mockDb.returning.mockResolvedValue([validatedContract]);

      const validateResponse = await request(app)
        .post('/api/intelligence/contracts/contract-1/validate')
        .expect(200);

      expect(validateResponse.body.isValid).toBe(true);
      expect(validateResponse.body.contract.status).toBe('validated');
      expect(validateResponse.body.errors).toHaveLength(0);

      // Step 3: Publish contract
      const publishedContract: Contract = {
        ...validatedContract,
        status: 'published',
        version: '1.0.0', // Bumped to 1.0.0 on publish
        updatedAt: new Date('2024-01-05T09:15:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([validatedContract]);
      mockDb.returning.mockResolvedValue([publishedContract]);

      const publishResponse = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .send({
          evidence: [
            { type: 'pr', url: 'https://github.com/org/repo/pull/456' },
            { type: 'ticket', url: 'https://jira.example.com/SEC-123' },
          ],
        })
        .expect(200);

      expect(publishResponse.body.success).toBe(true);
      expect(publishResponse.body.contract.status).toBe('published');

      // Step 4: Deprecate contract
      const deprecatedContract: Contract = {
        ...publishedContract,
        status: 'deprecated',
        updatedAt: new Date('2024-06-15T11:00:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([publishedContract]);
      mockDb.returning.mockResolvedValue([deprecatedContract]);

      const deprecateResponse = await request(app)
        .post('/api/intelligence/contracts/contract-1/deprecate')
        .send({
          reason: 'Replaced by user-authentication-orchestrator v2.0.0',
        })
        .expect(200);

      expect(deprecateResponse.body.success).toBe(true);
      expect(deprecateResponse.body.contract.status).toBe('deprecated');

      // Step 5: Archive contract
      const archivedContract: Contract = {
        ...deprecatedContract,
        status: 'archived',
        updatedAt: new Date('2024-12-20T16:45:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([deprecatedContract]);
      mockDb.returning.mockResolvedValue([archivedContract]);

      const archiveResponse = await request(app)
        .post('/api/intelligence/contracts/contract-1/archive')
        .send({
          reason: '6-month deprecation period completed',
        })
        .expect(200);

      expect(archiveResponse.body.success).toBe(true);
      expect(archiveResponse.body.contract.status).toBe('archived');
    });
  });

  describe('Draft contract iteration workflow', () => {
    it('should allow multiple updates to draft contract before validation', async () => {
      // Create initial draft
      const initialDraft: Contract = {
        id: 'contract-2',
        contractId: 'email-notification-effect',
        name: 'email-notification-effect',
        displayName: 'Email Notification Effect',
        type: 'effect',
        status: 'draft',
        version: '0.1.0',
        description: 'Sends email notifications',
        schema: {},
        metadata: {},
        createdBy: 'alice',
        updatedBy: 'alice',
        createdAt: new Date('2024-01-10T08:00:00Z'),
        updatedAt: new Date('2024-01-10T08:00:00Z'),
      };

      mockDb.returning.mockResolvedValue([initialDraft]);

      const createResponse = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'email-notification-effect',
          displayName: 'Email Notification Effect',
          type: 'effect',
          description: 'Sends email notifications',
        })
        .expect(201);

      expect(createResponse.body.status).toBe('draft');

      // Update 1: Add schema
      const updatedDraft1: Contract = {
        ...initialDraft,
        description: 'Sends transactional email notifications',
        schema: { provider: 'sendgrid' },
        updatedAt: new Date('2024-01-11T10:30:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([initialDraft]);
      mockDb.returning.mockResolvedValue([updatedDraft1]);

      await request(app)
        .put('/api/intelligence/contracts/contract-2')
        .send({
          description: 'Sends transactional email notifications',
          schema: { provider: 'sendgrid' },
        })
        .expect(200);

      // Update 2: Add metadata
      const updatedDraft2: Contract = {
        ...updatedDraft1,
        metadata: { team: 'notifications', rateLimit: '100/min' },
        updatedAt: new Date('2024-01-12T14:15:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([updatedDraft1]);
      mockDb.returning.mockResolvedValue([updatedDraft2]);

      const update2Response = await request(app)
        .put('/api/intelligence/contracts/contract-2')
        .send({
          metadata: { team: 'notifications', rateLimit: '100/min' },
        })
        .expect(200);

      expect(update2Response.body.metadata.team).toBe('notifications');

      // Validate after iterations
      const validatedContract: Contract = {
        ...updatedDraft2,
        status: 'validated',
        updatedAt: new Date('2024-01-13T09:00:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([updatedDraft2]);
      mockDb.returning.mockResolvedValue([validatedContract]);

      const validateResponse = await request(app)
        .post('/api/intelligence/contracts/contract-2/validate')
        .expect(200);

      expect(validateResponse.body.contract.status).toBe('validated');
    });
  });

  describe('Version evolution workflow', () => {
    it('should create new version from published contract', async () => {
      // Existing published contract
      const publishedV1: Contract = {
        id: 'contract-3',
        contractId: 'data-processor',
        name: 'data-processor',
        displayName: 'Data Processor',
        type: 'compute',
        status: 'published',
        version: '1.0.0',
        description: 'Processes incoming data streams',
        schema: {
          maxBatchSize: 1000,
          timeout: 30000,
        },
        metadata: { team: 'data-platform' },
        createdBy: 'bob',
        updatedBy: 'bob',
        createdAt: new Date('2023-06-01T00:00:00Z'),
        updatedAt: new Date('2023-06-01T00:00:00Z'),
      };

      // Create v1.1.0 draft
      const draftV1_1: Contract = {
        id: 'contract-4',
        contractId: 'data-processor',
        name: 'data-processor',
        displayName: 'Data Processor',
        type: 'compute',
        status: 'draft',
        version: '1.1.0',
        description: 'Processes incoming data streams with improved performance',
        schema: {
          maxBatchSize: 1000,
          timeout: 30000,
        },
        metadata: { team: 'data-platform' },
        createdBy: null,
        updatedBy: null,
        createdAt: new Date('2024-01-15T10:00:00Z'),
        updatedAt: new Date('2024-01-15T10:00:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([publishedV1]);
      mockDb.returning.mockResolvedValue([draftV1_1]);

      const createVersionResponse = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'data-processor',
          displayName: 'Data Processor',
          type: 'compute',
          description: 'Processes incoming data streams with improved performance',
          sourceContractId: 'contract-3',
          versionBump: 'minor',
        })
        .expect(201);

      expect(createVersionResponse.body.version).toBe('1.1.0');
      expect(createVersionResponse.body.status).toBe('draft');
      expect(createVersionResponse.body.contractId).toBe('data-processor');

      // Validate and publish new version
      const validatedV1_1: Contract = {
        ...draftV1_1,
        status: 'validated',
        updatedAt: new Date('2024-01-16T11:00:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([draftV1_1]);
      mockDb.returning.mockResolvedValue([validatedV1_1]);

      await request(app).post('/api/intelligence/contracts/contract-4/validate').expect(200);

      const publishedV1_1: Contract = {
        ...validatedV1_1,
        status: 'published',
        updatedAt: new Date('2024-01-17T14:30:00Z'),
      };

      mockDb.where.mockResolvedValueOnce([validatedV1_1]);
      mockDb.returning.mockResolvedValue([publishedV1_1]);

      const publishResponse = await request(app)
        .post('/api/intelligence/contracts/contract-4/publish')
        .expect(200);

      expect(publishResponse.body.contract.version).toBe('1.1.0');
      expect(publishResponse.body.contract.status).toBe('published');
    });
  });

  describe('Audit trail verification', () => {
    it('should create comprehensive audit trail for contract lifecycle', async () => {
      const contractId = 'contract-5';

      const mockAuditLog: ContractAuditLog[] = [
        {
          id: 'audit-1',
          contractId,
          action: 'created',
          fromStatus: null,
          toStatus: 'draft',
          fromVersion: null,
          toVersion: '0.1.0',
          actor: 'developer',
          reason: null,
          evidence: [],
          contentHash: 'hash-001',
          snapshot: {
            contractId: 'api-gateway',
            name: 'api-gateway',
            displayName: 'API Gateway',
            type: 'reducer',
            status: 'draft',
            version: '0.1.0',
          },
          metadata: {},
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 'audit-2',
          contractId,
          action: 'updated',
          fromStatus: 'draft',
          toStatus: 'draft',
          fromVersion: '0.1.0',
          toVersion: '0.1.0',
          actor: 'developer',
          reason: null,
          evidence: [],
          contentHash: 'hash-002',
          snapshot: {
            contractId: 'api-gateway',
            name: 'api-gateway',
            displayName: 'API Gateway',
            type: 'reducer',
            status: 'draft',
            version: '0.1.0',
            description: 'Updated description',
          },
          metadata: {},
          createdAt: new Date('2024-01-02T11:00:00Z'),
        },
        {
          id: 'audit-3',
          contractId,
          action: 'validated',
          fromStatus: 'draft',
          toStatus: 'validated',
          fromVersion: '0.1.0',
          toVersion: '0.1.0',
          actor: 'tech-lead',
          reason: null,
          evidence: [],
          contentHash: 'hash-003',
          snapshot: {
            contractId: 'api-gateway',
            name: 'api-gateway',
            displayName: 'API Gateway',
            type: 'reducer',
            status: 'validated',
            version: '0.1.0',
          },
          metadata: {},
          createdAt: new Date('2024-01-03T09:00:00Z'),
        },
        {
          id: 'audit-4',
          contractId,
          action: 'published',
          fromStatus: 'validated',
          toStatus: 'published',
          fromVersion: '1.0.0',
          toVersion: '1.0.0',
          actor: 'release-manager',
          reason: null,
          evidence: [{ type: 'pr', url: 'https://github.com/org/repo/pull/789' }],
          contentHash: 'hash-004',
          snapshot: {
            contractId: 'api-gateway',
            name: 'api-gateway',
            displayName: 'API Gateway',
            type: 'reducer',
            status: 'published',
            version: '1.0.0',
          },
          metadata: {},
          createdAt: new Date('2024-01-05T10:00:00Z'),
        },
        {
          id: 'audit-5',
          contractId,
          action: 'deprecated',
          fromStatus: 'published',
          toStatus: 'deprecated',
          fromVersion: '1.0.0',
          toVersion: '1.0.0',
          actor: 'admin',
          reason: 'Replaced by v2.0.0',
          evidence: [],
          contentHash: 'hash-005',
          snapshot: {
            contractId: 'api-gateway',
            name: 'api-gateway',
            displayName: 'API Gateway',
            type: 'reducer',
            status: 'deprecated',
            version: '1.0.0',
          },
          metadata: {},
          createdAt: new Date('2024-06-01T10:00:00Z'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockAuditLog);

      const auditResponse = await request(app)
        .get(`/api/intelligence/contracts/${contractId}/audit`)
        .expect(200);

      expect(auditResponse.body).toHaveLength(5);
      expect(auditResponse.body[0].action).toBe('created');
      expect(auditResponse.body[1].action).toBe('updated');
      expect(auditResponse.body[2].action).toBe('validated');
      expect(auditResponse.body[3].action).toBe('published');
      expect(auditResponse.body[4].action).toBe('deprecated');

      // Verify snapshots are present for key transitions
      expect(auditResponse.body[0].snapshot).toBeDefined();
      expect(auditResponse.body[3].snapshot).toBeDefined();
      expect(auditResponse.body[4].snapshot).toBeDefined();

      // Verify evidence is captured for publishing
      expect(auditResponse.body[3].evidence).toHaveLength(1);
      expect(auditResponse.body[3].evidence[0].type).toBe('pr');
    });
  });

  describe('Error handling and validation', () => {
    it('should prevent skipping lifecycle stages', async () => {
      // Try to publish a draft contract (should fail - must be validated first)
      const draftContract: Contract = {
        id: 'contract-6',
        contractId: 'invalid-transition',
        name: 'invalid-transition',
        displayName: 'Invalid Transition',
        type: 'effect',
        status: 'draft',
        version: '0.1.0',
        description: 'Test contract',
        schema: {},
        metadata: {},
        createdBy: 'test',
        updatedBy: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValue([draftContract]);

      const publishResponse = await request(app)
        .post('/api/intelligence/contracts/contract-6/publish')
        .expect(400);

      expect(publishResponse.body.error).toContain('must be validated first');
    });

    it('should prevent archiving non-deprecated contracts', async () => {
      const publishedContract: Contract = {
        id: 'contract-7',
        contractId: 'invalid-archive',
        name: 'invalid-archive',
        displayName: 'Invalid Archive',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Test contract',
        schema: {},
        metadata: {},
        createdBy: 'test',
        updatedBy: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValue([publishedContract]);

      const archiveResponse = await request(app)
        .post('/api/intelligence/contracts/contract-7/archive')
        .expect(400);

      expect(archiveResponse.body.error).toContain('Only deprecated contracts can be archived');
    });

    it('should prevent updates to non-draft contracts', async () => {
      const publishedContract: Contract = {
        id: 'contract-8',
        contractId: 'immutable-published',
        name: 'immutable-published',
        displayName: 'Immutable Published',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Published contract',
        schema: {},
        metadata: {},
        createdBy: 'test',
        updatedBy: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValue([publishedContract]);

      const updateResponse = await request(app)
        .put('/api/intelligence/contracts/contract-8')
        .send({ description: 'Attempted update' })
        .expect(400);

      expect(updateResponse.body.error).toContain('Only drafts can be updated');
    });
  });

  describe('Snapshot and diff functionality', () => {
    it('should retrieve snapshot for specific audit entry', async () => {
      const auditWithSnapshot: ContractAuditLog = {
        id: 'audit-10',
        contractId: 'contract-9',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'release-manager',
        reason: null,
        evidence: [],
        contentHash: 'snapshot-hash',
        snapshot: {
          contractId: 'snapshot-test',
          name: 'snapshot-test',
          displayName: 'Snapshot Test',
          type: 'effect',
          status: 'published',
          version: '1.0.0',
          description: 'Test snapshot',
          schema: { key: 'value' },
          metadata: { team: 'test' },
        },
        metadata: {},
        createdAt: new Date('2024-01-10T10:00:00Z'),
      };

      mockDb.where.mockResolvedValue([auditWithSnapshot]);

      const snapshotResponse = await request(app)
        .get('/api/intelligence/contracts/contract-9/audit/audit-10/snapshot')
        .expect(200);

      expect(snapshotResponse.body.auditId).toBe('audit-10');
      expect(snapshotResponse.body.snapshot.contractId).toBe('snapshot-test');
      expect(snapshotResponse.body.snapshot.status).toBe('published');
      expect(snapshotResponse.body.snapshot.schema).toEqual({ key: 'value' });
    });

    it('should compute diff between two audit snapshots', async () => {
      const fromAudit: ContractAuditLog = {
        id: 'audit-11',
        contractId: 'contract-10',
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        fromVersion: null,
        toVersion: '0.1.0',
        actor: 'developer',
        reason: null,
        evidence: [],
        contentHash: 'hash-v1',
        snapshot: {
          contractId: 'diff-test',
          name: 'diff-test',
          version: '0.1.0',
          status: 'draft',
          description: 'Initial version',
          schema: { feature: 'basic' },
        },
        metadata: {},
        createdAt: new Date('2024-01-01'),
      };

      const toAudit: ContractAuditLog = {
        id: 'audit-12',
        contractId: 'contract-10',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'release-manager',
        reason: null,
        evidence: [],
        contentHash: 'hash-v2',
        snapshot: {
          contractId: 'diff-test',
          name: 'diff-test',
          version: '1.0.0',
          status: 'published',
          description: 'Production-ready version',
          schema: { feature: 'advanced', optimization: true },
        },
        metadata: {},
        createdAt: new Date('2024-01-10'),
      };

      mockDb.where.mockResolvedValueOnce([fromAudit]).mockResolvedValueOnce([toAudit]);

      const diffResponse = await request(app)
        .get('/api/intelligence/contracts/contract-10/diff?from=audit-11&to=audit-12')
        .expect(200);

      expect(diffResponse.body.from.auditId).toBe('audit-11');
      expect(diffResponse.body.to.auditId).toBe('audit-12');
      expect(diffResponse.body.diff).toHaveProperty('lines');
      expect(diffResponse.body.diff).toHaveProperty('additions');
      expect(diffResponse.body.diff).toHaveProperty('deletions');
      expect(diffResponse.body.diff.additions).toBeGreaterThan(0);
    });
  });
});
