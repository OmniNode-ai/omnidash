import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';

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
    delete: vi.fn(),
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
  mockDb.delete.mockReturnValue(mockDb);

  return mockDb;
};

let mockDb: any;

vi.mock('../storage', () => ({
  getIntelligenceDb: vi.fn(() => mockDb),
}));

// Import the router after mocking dependencies
import contractRouter from '../contract-registry-routes';
import type { Contract, ContractAuditLog } from '@shared/intelligence-schema';

describe('Contract Registry Routes', () => {
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

  describe('GET /types', () => {
    it('should return all contract types', async () => {
      const response = await request(app).get('/api/intelligence/contracts/types').expect(200);

      expect(response.body).toEqual(['orchestrator', 'effect', 'reducer', 'compute']);
    });
  });

  describe('GET /schema/:type', () => {
    it('should return schema for valid contract type', async () => {
      const response = await request(app)
        .get('/api/intelligence/contracts/schema/effect')
        .expect(200);

      expect(response.body).toHaveProperty('jsonSchema');
      expect(response.body).toHaveProperty('uiSchema');
    });

    it('should return 400 for invalid contract type', async () => {
      const response = await request(app)
        .get('/api/intelligence/contracts/schema/invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid contract type');
    });
  });

  describe('GET /', () => {
    it('should return all contracts without filters', async () => {
      const mockContracts: Contract[] = [
        {
          id: 'contract-1',
          contractId: 'user-auth-orchestrator',
          name: 'user-auth-orchestrator',
          displayName: 'User Authentication Orchestrator',
          type: 'orchestrator',
          status: 'published',
          version: '1.0.0',
          description: 'Handles user authentication flows',
          schema: {},
          metadata: {},
          createdBy: 'test-user',
          updatedBy: 'test-user',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'contract-2',
          contractId: 'email-sender-effect',
          name: 'email-sender-effect',
          displayName: 'Email Sender Effect',
          type: 'effect',
          status: 'draft',
          version: '0.1.0',
          description: 'Sends email notifications',
          schema: {},
          metadata: {},
          createdBy: 'test-user',
          updatedBy: 'test-user',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockContracts);

      const response = await request(app).get('/api/intelligence/contracts').expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].contractId).toBe('user-auth-orchestrator');
      expect(response.body[1].contractId).toBe('email-sender-effect');
    });

    it('should filter contracts by type', async () => {
      const mockContracts: Contract[] = [
        {
          id: 'contract-1',
          contractId: 'email-sender-effect',
          name: 'email-sender-effect',
          displayName: 'Email Sender Effect',
          type: 'effect',
          status: 'published',
          version: '1.0.0',
          description: 'Sends email notifications',
          schema: {},
          metadata: {},
          createdBy: 'test-user',
          updatedBy: 'test-user',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockResolvedValue(mockContracts);

      const response = await request(app)
        .get('/api/intelligence/contracts?type=effect')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].type).toBe('effect');
    });

    it('should filter contracts by status', async () => {
      const mockContracts: Contract[] = [
        {
          id: 'contract-1',
          contractId: 'user-auth-orchestrator',
          name: 'user-auth-orchestrator',
          displayName: 'User Authentication Orchestrator',
          type: 'orchestrator',
          status: 'draft',
          version: '0.1.0',
          description: 'Draft contract',
          schema: {},
          metadata: {},
          createdBy: 'test-user',
          updatedBy: 'test-user',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockResolvedValue(mockContracts);

      const response = await request(app)
        .get('/api/intelligence/contracts?status=draft')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe('draft');
    });

    it('should search contracts by name', async () => {
      const mockContracts: Contract[] = [
        {
          id: 'contract-1',
          contractId: 'user-auth-orchestrator',
          name: 'user-auth-orchestrator',
          displayName: 'User Authentication Orchestrator',
          type: 'orchestrator',
          status: 'published',
          version: '1.0.0',
          description: 'User auth',
          schema: {},
          metadata: {},
          createdBy: 'test-user',
          updatedBy: 'test-user',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockResolvedValue(mockContracts);

      const response = await request(app)
        .get('/api/intelligence/contracts?search=user')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toContain('user');
    });
  });

  describe('GET /:id', () => {
    it('should return a specific contract by id', async () => {
      const mockContract: Contract = {
        id: 'contract-1',
        contractId: 'user-auth-orchestrator',
        name: 'user-auth-orchestrator',
        displayName: 'User Authentication Orchestrator',
        type: 'orchestrator',
        status: 'published',
        version: '1.0.0',
        description: 'Handles user authentication',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([mockContract]);

      const response = await request(app).get('/api/intelligence/contracts/contract-1').expect(200);

      expect(response.body.id).toBe('contract-1');
      expect(response.body.contractId).toBe('user-auth-orchestrator');
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/intelligence/contracts/non-existent')
        .expect(404);

      expect(response.body.error).toBe('Contract not found');
    });
  });

  describe('POST /', () => {
    it('should create a new draft contract', async () => {
      const newContract = {
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        description: 'Sends emails',
      };

      const createdContract: Contract = {
        id: 'new-contract-id',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '0.1.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([createdContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts')
        .send(newContract)
        .expect(201);

      expect(response.body.id).toBe('new-contract-id');
      expect(response.body.status).toBe('draft');
      expect(response.body.version).toBe('0.1.0');
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it('should create a new version from existing contract', async () => {
      const existingContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Sends emails',
        schema: { emailProvider: 'sendgrid' },
        metadata: { author: 'original-author' },
        createdBy: 'original-user',
        updatedBy: 'original-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const newVersionContract: Contract = {
        id: 'new-contract-id',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '1.0.1',
        description: 'Updated email sender',
        schema: { emailProvider: 'sendgrid' },
        metadata: { author: 'original-author' },
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValue([existingContract]);
      mockDb.returning.mockResolvedValue([newVersionContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'email-sender',
          displayName: 'Email Sender',
          type: 'effect',
          description: 'Updated email sender',
          sourceContractId: 'contract-1',
          versionBump: 'patch',
        })
        .expect(201);

      expect(response.body.version).toBe('1.0.1');
      expect(response.body.status).toBe('draft');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/intelligence/contracts')
        .send({ name: 'incomplete' })
        .expect(400);

      expect(response.body.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid contract type', async () => {
      const response = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'test-contract',
          displayName: 'Test Contract',
          type: 'invalid-type',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid contract type');
    });

    it('should return 404 when source contract not found', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/intelligence/contracts')
        .send({
          name: 'new-version',
          displayName: 'New Version',
          type: 'effect',
          sourceContractId: 'non-existent',
        })
        .expect(404);

      expect(response.body.error).toBe('Source contract not found');
    });
  });

  describe('PUT /:id', () => {
    it('should update a draft contract', async () => {
      const existingContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '0.1.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const updatedContract: Contract = {
        ...existingContract,
        description: 'Updated description',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([existingContract]);
      mockDb.returning.mockResolvedValue([updatedContract]);

      const response = await request(app)
        .put('/api/intelligence/contracts/contract-1')
        .send({ description: 'Updated description' })
        .expect(200);

      expect(response.body.description).toBe('Updated description');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .put('/api/intelligence/contracts/non-existent')
        .send({ description: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Contract not found');
    });

    it('should return 409 when trying to update a published contract', async () => {
      const publishedContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([publishedContract]);

      const response = await request(app)
        .put('/api/intelligence/contracts/contract-1')
        .send({ description: 'Updated' })
        .expect(409);

      expect(response.body.error).toContain('Cannot update contract with status');
    });
  });

  describe('POST /:id/validate', () => {
    it('should validate and update contract to validated status', async () => {
      const draftContract: Contract = {
        id: 'contract-1',
        contractId: 'email_sender',
        name: 'email_sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '1.0.0',
        description: 'Sends email notifications to users',
        schema: {
          contract_schema_version: '1.0.0',
          determinism_class: 'effect-driven',
          effect_surface: ['network'],
          node_identity: {
            name: 'email_sender',
            display_name: 'Email Sender',
            version: '1.0.0',
            description: 'Sends email notifications to users',
          },
        },
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const validatedContract: Contract = {
        ...draftContract,
        status: 'validated',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([draftContract]);
      mockDb.returning.mockResolvedValue([validatedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/validate')
        .expect(200);

      expect(response.body.lifecycle_state).toBe('validated');
      expect(response.body.contract.status).toBe('validated');
    });

    it('should return 422 with gate violations for invalid contract schema', async () => {
      const invalidContract: Contract = {
        id: 'contract-1',
        contractId: 'email_sender',
        name: 'email_sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {}, // Missing required fields: contract_schema_version, determinism_class
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([invalidContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/validate')
        .expect(422);

      expect(response.body.error).toBe('validation_failed');
      expect(response.body.gates).toBeDefined();
      expect(response.body.gates.length).toBeGreaterThan(0);
      // Each gate violation has code, message, optional path, optional severity
      expect(response.body.gates[0]).toHaveProperty('code');
      expect(response.body.gates[0]).toHaveProperty('message');
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/intelligence/contracts/non-existent/validate')
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });
  });

  describe('POST /:id/publish', () => {
    it('should publish a validated contract with valid schema', async () => {
      const validSchema = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: {
          name: 'email_sender',
          display_name: 'Email Sender',
          version: '1.0.0',
          description: 'Sends email notifications to users',
        },
      };

      const validatedContract: Contract = {
        id: 'contract-1',
        contractId: 'email_sender',
        name: 'email_sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'validated',
        version: '1.0.0',
        description: 'Sends emails',
        schema: validSchema,
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const publishedContract: Contract = {
        ...validatedContract,
        status: 'published',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([validatedContract]);
      mockDb.returning.mockResolvedValue([publishedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .send({ evidence: [{ type: 'pr', url: 'https://github.com/pr/123' }] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.contract.status).toBe('published');
      expect(response.body.content_hash).toBeDefined();
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should return 409 when trying to publish a non-validated (draft) contract', async () => {
      const draftContract: Contract = {
        id: 'contract-1',
        contractId: 'email_sender',
        name: 'email_sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .expect(409);

      expect(response.body.error).toBe('not_validated_or_concurrent_publish');
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/intelligence/contracts/non-existent/publish')
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });
  });

  describe('POST /:id/deprecate', () => {
    it('should deprecate a published contract', async () => {
      const publishedContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const deprecatedContract: Contract = {
        ...publishedContract,
        status: 'deprecated',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([publishedContract]);
      mockDb.returning.mockResolvedValue([deprecatedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/deprecate')
        .send({ reason: 'Replaced by v2.0.0' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.contract.status).toBe('deprecated');
    });

    it('should return 400 when trying to deprecate non-published contract', async () => {
      const draftContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'draft',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/deprecate')
        .expect(400);

      expect(response.body.error).toContain('Only published contracts can be deprecated');
    });
  });

  describe('POST /:id/archive', () => {
    it('should archive a deprecated contract', async () => {
      const deprecatedContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'deprecated',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const archivedContract: Contract = {
        ...deprecatedContract,
        status: 'archived',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([deprecatedContract]);
      mockDb.returning.mockResolvedValue([archivedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/archive')
        .send({ reason: 'No longer in use' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.contract.status).toBe('archived');
    });

    it('should return 400 when trying to archive non-deprecated contract', async () => {
      const publishedContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([publishedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/archive')
        .expect(400);

      expect(response.body.error).toContain('Only deprecated contracts can be archived');
    });
  });

  describe('GET /:id/audit', () => {
    it('should return audit history for a contract', async () => {
      const mockAuditLog: ContractAuditLog[] = [
        {
          id: 'audit-1',
          contractId: 'contract-1',
          action: 'created',
          fromStatus: null,
          toStatus: 'draft',
          fromVersion: null,
          toVersion: '0.1.0',
          actor: 'test-user',
          reason: null,
          evidence: [],
          contentHash: 'abc123',
          snapshot: null,
          metadata: {},
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'audit-2',
          contractId: 'contract-1',
          action: 'validated',
          fromStatus: 'draft',
          toStatus: 'validated',
          fromVersion: '0.1.0',
          toVersion: '0.1.0',
          actor: 'test-user',
          reason: null,
          evidence: [],
          contentHash: 'abc123',
          snapshot: null,
          metadata: {},
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockAuditLog);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/audit')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].action).toBe('created');
      expect(response.body[1].action).toBe('validated');
    });
  });

  describe('GET /:id/audit/:auditId/snapshot', () => {
    it('should return snapshot for a specific audit entry', async () => {
      const mockAuditEntry: ContractAuditLog = {
        id: 'audit-1',
        contractId: 'contract-1',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'abc123',
        snapshot: {
          contractId: 'email-sender',
          name: 'email-sender',
          displayName: 'Email Sender',
          type: 'effect',
          status: 'published',
          version: '1.0.0',
        },
        metadata: {},
        createdAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([mockAuditEntry]);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/audit/audit-1/snapshot')
        .expect(200);

      expect(response.body.auditId).toBe('audit-1');
      expect(response.body.snapshot).toHaveProperty('contractId');
      expect(response.body.snapshot.status).toBe('published');
    });

    it('should return 404 when snapshot not available', async () => {
      const mockAuditEntry: ContractAuditLog = {
        id: 'audit-1',
        contractId: 'contract-1',
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        fromVersion: null,
        toVersion: '0.1.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'abc123',
        snapshot: null,
        metadata: {},
        createdAt: new Date('2024-01-01'),
      };

      mockDb.where.mockResolvedValue([mockAuditEntry]);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/audit/audit-1/snapshot')
        .expect(404);

      expect(response.body.error).toContain('Snapshot not available');
    });
  });

  describe('GET /:id/diff', () => {
    it('should compute diff between two audit entries', async () => {
      const fromAudit: ContractAuditLog = {
        id: 'audit-1',
        contractId: 'contract-1',
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        fromVersion: null,
        toVersion: '0.1.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'abc123',
        snapshot: {
          contractId: 'email-sender',
          name: 'email-sender',
          displayName: 'Email Sender',
          version: '0.1.0',
          status: 'draft',
          description: 'Sends emails',
        },
        metadata: {},
        createdAt: new Date('2024-01-01'),
      };

      const toAudit: ContractAuditLog = {
        id: 'audit-2',
        contractId: 'contract-1',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'def456',
        snapshot: {
          contractId: 'email-sender',
          name: 'email-sender',
          displayName: 'Email Sender',
          version: '1.0.0',
          status: 'published',
          description: 'Sends email notifications',
        },
        metadata: {},
        createdAt: new Date('2024-01-02'),
      };

      mockDb.where.mockResolvedValueOnce([fromAudit]).mockResolvedValueOnce([toAudit]);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/diff?from=audit-1&to=audit-2')
        .expect(200);

      expect(response.body).toHaveProperty('from');
      expect(response.body).toHaveProperty('to');
      expect(response.body).toHaveProperty('diff');
      expect(response.body.from.auditId).toBe('audit-1');
      expect(response.body.to.auditId).toBe('audit-2');
      expect(response.body.diff).toHaveProperty('lines');
      expect(response.body.diff).toHaveProperty('additions');
      expect(response.body.diff).toHaveProperty('deletions');
    });

    it('should return 400 when query parameters missing', async () => {
      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/diff')
        .expect(400);

      expect(response.body.error).toContain('Missing required query parameters');
    });

    it('should return 400 when snapshots not available', async () => {
      const fromAudit: ContractAuditLog = {
        id: 'audit-1',
        contractId: 'contract-1',
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        fromVersion: null,
        toVersion: '0.1.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'abc123',
        snapshot: null,
        metadata: {},
        createdAt: new Date('2024-01-01'),
      };

      const toAudit: ContractAuditLog = {
        id: 'audit-2',
        contractId: 'contract-1',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'test-user',
        reason: null,
        evidence: [],
        contentHash: 'def456',
        snapshot: null,
        metadata: {},
        createdAt: new Date('2024-01-02'),
      };

      mockDb.where.mockResolvedValueOnce([fromAudit]).mockResolvedValueOnce([toAudit]);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/diff?from=audit-1&to=audit-2')
        .expect(400);

      expect(response.body.error).toContain('Snapshots not available');
    });
  });

  describe('GET /:id/export', () => {
    it('should export contract as JSON when format=json', async () => {
      const mockContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'published',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const mockAuditLog: ContractAuditLog[] = [];

      mockDb.where.mockResolvedValueOnce([mockContract]);
      mockDb.orderBy.mockResolvedValue(mockAuditLog);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/export?format=json')
        .expect(200);

      expect(response.body).toHaveProperty('contract');
      expect(response.body).toHaveProperty('schema');
      expect(response.body).toHaveProperty('provenance');
      expect(response.body).toHaveProperty('auditLog');
      expect(response.body).toHaveProperty('tests');
      expect(response.body.contract.contractId).toBe('email-sender');
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/intelligence/contracts/non-existent/export?format=json')
        .expect(404);

      expect(response.body.error).toBe('Contract not found');
    });
  });

  describe('Content Hash Generation', () => {
    it('should generate consistent hash for same contract content', () => {
      const contract1: Partial<Contract> = {
        name: 'test-contract',
        displayName: 'Test Contract',
        type: 'effect',
        version: '1.0.0',
        description: 'Test description',
        schema: { key: 'value' },
      };

      const contract2: Partial<Contract> = {
        name: 'test-contract',
        displayName: 'Test Contract',
        type: 'effect',
        version: '1.0.0',
        description: 'Test description',
        schema: { key: 'value' },
      };

      const hash1 = crypto
        .createHash('sha256')
        .update(JSON.stringify(contract1))
        .digest('hex')
        .substring(0, 16);
      const hash2 = crypto
        .createHash('sha256')
        .update(JSON.stringify(contract2))
        .digest('hex')
        .substring(0, 16);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different contract content', () => {
      const contract1: Partial<Contract> = {
        name: 'test-contract',
        displayName: 'Test Contract',
        type: 'effect',
        version: '1.0.0',
        description: 'Original description',
        schema: {},
      };

      const contract2: Partial<Contract> = {
        name: 'test-contract',
        displayName: 'Test Contract',
        type: 'effect',
        version: '1.0.0',
        description: 'Modified description',
        schema: {},
      };

      const hash1 = crypto
        .createHash('sha256')
        .update(JSON.stringify(contract1))
        .digest('hex')
        .substring(0, 16);
      const hash2 = crypto
        .createHash('sha256')
        .update(JSON.stringify(contract2))
        .digest('hex')
        .substring(0, 16);

      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================================
  // Policy Gate Enforcement Tests
  // ============================================================================

  describe('POST /:id/review — DRAFT→REVIEW completeness gate', () => {
    const makeContract = (overrides: Partial<Contract> = {}): Contract => ({
      id: 'contract-1',
      contractId: 'email_sender',
      name: 'email-sender',
      displayName: 'Email Sender',
      type: 'effect',
      status: 'draft',
      version: '1.0.0',
      description: 'Sends email notifications to users',
      schema: {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: {
          name: 'email_sender',
          version: '1.0.0',
          display_name: 'Email Sender',
          description: 'desc',
        },
        io_operations: [{ operation_id: 'send', direction: 'output', protocol: 'smtp' }],
      },
      metadata: {},
      createdBy: 'test-user',
      updatedBy: 'test-user',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    });

    it('should transition a complete draft to review status', async () => {
      const draftContract = makeContract();
      const reviewedContract = { ...draftContract, status: 'review', updatedAt: new Date() };

      mockDb.where.mockResolvedValueOnce([draftContract]);
      mockDb.returning.mockResolvedValue([reviewedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(200);

      expect(response.body.lifecycle_state).toBe('review');
      expect(response.body.contract.status).toBe('review');
    });

    it('should return 422 with review_gate_failed when description is missing', async () => {
      const draftContract = makeContract({ description: '' });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      expect(response.body.error).toBe('review_gate_failed');
      expect(response.body.gates).toBeInstanceOf(Array);
      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_description');
    });

    it('should return 422 when determinism_class is missing', async () => {
      const schemaWithoutDeterminism = {
        contract_schema_version: '1.0.0',
        node_identity: { name: 'email_sender', version: '1.0.0' },
        effect_surface: ['network'],
        io_operations: [{ operation_id: 'send', direction: 'output', protocol: 'smtp' }],
      };
      const draftContract = makeContract({
        schema: schemaWithoutDeterminism as Contract['schema'],
      });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      expect(response.body.error).toBe('review_gate_failed');
      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_determinism_class');
    });

    it('should return 422 when effect_surface is empty on effect-driven node', async () => {
      const schemaNoSurface = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: [],
        node_identity: { name: 'email_sender', version: '1.0.0' },
        io_operations: [{ operation_id: 'send', direction: 'output', protocol: 'smtp' }],
      };
      const draftContract = makeContract({ schema: schemaNoSurface as Contract['schema'] });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_effect_surface');
    });

    it('should return 422 when effect node has no io_operations', async () => {
      const schemaNoOps = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: { name: 'email_sender', version: '1.0.0' },
        io_operations: [],
      };
      const draftContract = makeContract({ schema: schemaNoOps as Contract['schema'] });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_io_operations');
    });

    it('should return 422 when node_identity is missing', async () => {
      const schemaNoIdentity = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        io_operations: [{ operation_id: 'send', direction: 'output', protocol: 'smtp' }],
      };
      const draftContract = makeContract({ schema: schemaNoIdentity as Contract['schema'] });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_node_identity');
    });

    it('should return 409 when contract is already in review state', async () => {
      const reviewContract = makeContract({ status: 'review' });
      mockDb.where.mockResolvedValue([reviewContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(409);

      expect(response.body.error).toBe('not_draft');
    });

    it('should return 409 when contract is published', async () => {
      const publishedContract = makeContract({ status: 'published' });
      mockDb.where.mockResolvedValue([publishedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(409);

      expect(response.body.error).toBe('not_draft');
    });

    it('should return 404 for non-existent contract', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/intelligence/contracts/non-existent/review')
        .expect(404);

      expect(response.body.error).toBe('not_found');
    });

    it('each gate violation should have code and message fields', async () => {
      const draftContract = makeContract({ description: '', schema: {} as Contract['schema'] });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/review')
        .expect(422);

      const gates = response.body.gates as Array<{ code: string; message: string }>;
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) {
        expect(gate).toHaveProperty('code');
        expect(gate).toHaveProperty('message');
        expect(typeof gate.code).toBe('string');
        expect(typeof gate.message).toBe('string');
      }
    });
  });

  describe('POST /:id/publish — REVIEW→PUBLISHED policy gate', () => {
    // Base schema that passes all AJV + policy gate checks.
    // io_operations is not required by the effect AJV schema.
    const validPublishSchema = {
      contract_schema_version: '1.0.0',
      determinism_class: 'effect-driven',
      effect_surface: ['network'],
      node_identity: {
        name: 'email_sender',
        display_name: 'Email Sender',
        version: '1.0.0',
        description: 'Sends email notifications to users via SMTP',
      },
    };

    const makeValidatedContract = (overrides: Partial<Contract> = {}): Contract => ({
      id: 'contract-1',
      contractId: 'email_sender',
      name: 'email_sender',
      displayName: 'Email Sender',
      type: 'effect',
      status: 'validated',
      version: '1.0.0',
      description: 'Sends email notifications to users',
      schema: validPublishSchema,
      metadata: {},
      createdBy: 'test-user',
      updatedBy: 'test-user',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    });

    it('should return 422 with publish_gate_failed when contract_schema_version is missing', async () => {
      const schemaNoCSV = {
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: {
          name: 'email_sender',
          display_name: 'Email Sender',
          version: '1.0.0',
          description: 'Sends email notifications to users via SMTP',
        },
      };
      const validatedContract = makeValidatedContract({
        schema: schemaNoCSV as Contract['schema'],
      });
      mockDb.where.mockResolvedValue([validatedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .expect(422);

      expect(response.body.error).toBe('publish_gate_failed');
      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('missing_contract_schema_version');
    });

    it('should return 422 when policy_envelope has empty validator strings', async () => {
      const schemaWithBadEnvelope = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: {
          name: 'email_sender',
          display_name: 'Email Sender',
          version: '1.0.0',
          description: 'Sends email notifications to users via SMTP',
        },
        policy_envelope: { validators: [''] },
      };
      const validatedContract = makeValidatedContract({
        schema: schemaWithBadEnvelope as Contract['schema'],
      });
      mockDb.where.mockResolvedValue([validatedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .expect(422);

      expect(response.body.error).toBe('publish_gate_failed');
      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('empty_policy_envelope_validator');
    });

    it('should return 422 when policy_envelope validator object has empty name', async () => {
      const schemaWithBadValidatorName = {
        contract_schema_version: '1.0.0',
        determinism_class: 'effect-driven',
        effect_surface: ['network'],
        node_identity: {
          name: 'email_sender',
          display_name: 'Email Sender',
          version: '1.0.0',
          description: 'Sends email notifications to users via SMTP',
        },
        policy_envelope: { validators: [{ name: '' }] },
      };
      const validatedContract = makeValidatedContract({
        schema: schemaWithBadValidatorName as Contract['schema'],
      });
      mockDb.where.mockResolvedValue([validatedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .expect(422);

      expect(response.body.error).toBe('publish_gate_failed');
      const codes = (response.body.gates as Array<{ code: string }>).map((g) => g.code);
      expect(codes).toContain('empty_policy_envelope_validator_name');
    });

    it('should publish successfully when all policy gates pass', async () => {
      const validatedContract = makeValidatedContract();
      const publishedContract = {
        ...validatedContract,
        status: 'published',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([validatedContract]);
      mockDb.returning.mockResolvedValue([publishedContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .send({ evidence: [] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.contract.status).toBe('published');
    });

    it('should return 409 when trying to publish a draft (not validated)', async () => {
      const draftContract = makeValidatedContract({ status: 'draft' });
      mockDb.where.mockResolvedValue([draftContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/publish')
        .expect(409);

      expect(response.body.error).toBe('not_validated_or_concurrent_publish');
    });
  });

  describe('PUT /:id — demotion from review state', () => {
    it('should demote a review contract back to draft on edit', async () => {
      const reviewContract: Contract = {
        id: 'contract-1',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'review',
        version: '1.0.0',
        description: 'Sends emails',
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const demotedContract = {
        ...reviewContract,
        status: 'draft',
        description: 'Updated',
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([reviewContract]);
      mockDb.returning.mockResolvedValue([demotedContract]);

      const response = await request(app)
        .put('/api/intelligence/contracts/contract-1')
        .send({ description: 'Updated' })
        .expect(200);

      expect(response.body.status).toBe('draft');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('Version Bumping', () => {
    it('should correctly bump patch version', () => {
      expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
      expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    });

    it('should correctly bump minor version', () => {
      expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
      expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('should correctly bump major version', () => {
      expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
      expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
    });
  });

  // ==========================================================================
  // Test Case Routes
  // ==========================================================================

  describe('GET /:id/test-cases', () => {
    it('should return test cases for a contract', async () => {
      const mockTestCases = [
        {
          id: 'tc-1',
          contractId: 'contract-1',
          name: 'Happy path',
          description: 'Validates happy path',
          inputs: { userId: 'abc' },
          expectedOutputs: { success: true },
          assertions: [],
          lastResult: 'passed',
          lastRunAt: new Date('2024-01-01'),
          lastRunBy: 'ci',
          createdBy: 'test-user',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockTestCases);

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/test-cases')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Happy path');
      expect(response.body[0].lastResult).toBe('passed');
    });

    it('should return 503 when database is unavailable', async () => {
      mockDb = null;

      const response = await request(app)
        .get('/api/intelligence/contracts/contract-1/test-cases')
        .expect(503);

      expect(response.body.error).toBe('Database unavailable');

      // Restore for other tests
      mockDb = createMockDb();
    });
  });

  describe('POST /:id/test-cases', () => {
    it('should create a test case when contract exists', async () => {
      const mockContract = {
        id: 'contract-1',
        contractId: 'user-auth-orchestrator',
        name: 'user-auth-orchestrator',
        displayName: 'User Authentication Orchestrator',
        type: 'orchestrator',
        status: 'draft',
        version: '0.1.0',
        description: null,
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newTestCase = {
        id: 'tc-new',
        contractId: 'contract-1',
        name: 'Error case',
        description: 'Tests error handling',
        inputs: {},
        expectedOutputs: {},
        assertions: [],
        lastResult: null,
        lastRunAt: null,
        lastRunBy: null,
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call returns the contract (existence check), second returns the inserted row
      mockDb.where.mockResolvedValueOnce([mockContract]);
      mockDb.returning.mockResolvedValueOnce([newTestCase]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/test-cases')
        .send({ name: 'Error case', description: 'Tests error handling', createdBy: 'test-user' })
        .expect(201);

      expect(response.body.name).toBe('Error case');
      expect(response.body.contractId).toBe('contract-1');
    });

    it('should return 400 when name is missing', async () => {
      const mockContract = {
        id: 'contract-1',
        contractId: 'user-auth-orchestrator',
        name: 'user-auth-orchestrator',
        displayName: 'User Auth',
        type: 'orchestrator',
        status: 'draft',
        version: '0.1.0',
        description: null,
        schema: {},
        metadata: {},
        createdBy: 'test-user',
        updatedBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.where.mockResolvedValueOnce([mockContract]);

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/test-cases')
        .send({ description: 'Missing name' })
        .expect(400);

      expect(response.body.error).toContain('required');
    });

    it('should return 404 when contract does not exist', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const response = await request(app)
        .post('/api/intelligence/contracts/nonexistent/test-cases')
        .send({ name: 'Some test' })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should return 503 when database is unavailable', async () => {
      mockDb = null;

      const response = await request(app)
        .post('/api/intelligence/contracts/contract-1/test-cases')
        .send({ name: 'Some test' })
        .expect(503);

      expect(response.body.error).toBe('Database unavailable');

      mockDb = createMockDb();
    });
  });

  describe('DELETE /:id/test-cases/:testCaseId', () => {
    it('should delete a test case that belongs to the contract', async () => {
      const deletedTestCase = {
        id: 'tc-1',
        contractId: 'contract-1',
        name: 'Happy path',
        description: null,
        inputs: {},
        expectedOutputs: {},
        assertions: [],
        lastResult: null,
        lastRunAt: null,
        lastRunBy: null,
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([deletedTestCase]);

      const response = await request(app)
        .delete('/api/intelligence/contracts/contract-1/test-cases/tc-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.deleted.id).toBe('tc-1');
    });

    it('should return 404 when test case does not exist or belongs to different contract', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const response = await request(app)
        .delete('/api/intelligence/contracts/contract-1/test-cases/nonexistent')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should return 503 when database is unavailable', async () => {
      mockDb = null;

      const response = await request(app)
        .delete('/api/intelligence/contracts/contract-1/test-cases/tc-1')
        .expect(503);

      expect(response.body.error).toBe('Database unavailable');

      mockDb = createMockDb();
    });
  });
});

// Helper function for version bumping (mirrors implementation in routes)
function bumpVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const parts = version.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}
