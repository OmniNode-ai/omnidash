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

      expect(response.body.error).toContain("Cannot update contract with status");
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
        schema: {},  // Missing required fields: contract_schema_version, determinism_class
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
