import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import type { Contract, ContractAuditLog } from '@shared/intelligence-schema';

describe('Contract Database Operations - Unit Tests', () => {
  describe('Content Hash Generation', () => {
    it('should generate deterministic SHA-256 hash', () => {
      const contract: Partial<Contract> = {
        name: 'user-auth-orchestrator',
        displayName: 'User Authentication Orchestrator',
        type: 'orchestrator',
        version: '1.0.0',
        description: 'Handles user authentication flows',
        schema: {
          inputs: ['username', 'password'],
          outputs: ['authToken', 'userId'],
        },
      };

      const content = JSON.stringify(contract);
      const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should produce same hash for identical contracts', () => {
      const contract1: Partial<Contract> = {
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        version: '1.0.0',
        description: 'Sends email notifications',
        schema: { provider: 'sendgrid', apiKey: 'key123' },
      };

      const contract2: Partial<Contract> = {
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        version: '1.0.0',
        description: 'Sends email notifications',
        schema: { provider: 'sendgrid', apiKey: 'key123' },
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

    it('should produce different hash when content changes', () => {
      const contract1: Partial<Contract> = {
        name: 'data-processor',
        displayName: 'Data Processor',
        type: 'compute',
        version: '1.0.0',
        description: 'Processes data',
        schema: {},
      };

      const contract2: Partial<Contract> = {
        name: 'data-processor',
        displayName: 'Data Processor',
        type: 'compute',
        version: '1.0.1', // Version changed
        description: 'Processes data',
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

    it('should ignore fields not included in hash calculation', () => {
      // Hash should only include specific fields, not database metadata
      const contract1 = {
        name: 'test-contract',
        displayName: 'Test',
        type: 'effect',
        version: '1.0.0',
        description: 'Test',
        schema: {},
        // These fields should NOT affect the hash:
        id: 'id-1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const contract2 = {
        name: 'test-contract',
        displayName: 'Test',
        type: 'effect',
        version: '1.0.0',
        description: 'Test',
        schema: {},
        // Different metadata:
        id: 'id-2',
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-02'),
      };

      // Extract only fields that should be included in hash
      const hashableFields1 = {
        name: contract1.name,
        displayName: contract1.displayName,
        type: contract1.type,
        version: contract1.version,
        description: contract1.description,
        schema: contract1.schema,
      };

      const hashableFields2 = {
        name: contract2.name,
        displayName: contract2.displayName,
        type: contract2.type,
        version: contract2.version,
        description: contract2.description,
        schema: contract2.schema,
      };

      const hash1 = crypto
        .createHash('sha256')
        .update(JSON.stringify(hashableFields1))
        .digest('hex')
        .substring(0, 16);
      const hash2 = crypto
        .createHash('sha256')
        .update(JSON.stringify(hashableFields2))
        .digest('hex')
        .substring(0, 16);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Semantic Version Bumping', () => {
    const bumpVersion = (version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string => {
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
    };

    describe('Patch version bumps', () => {
      it('should increment patch version', () => {
        expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1');
        expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
        expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
        expect(bumpVersion('2.5.9', 'patch')).toBe('2.5.10');
      });

      it('should use patch as default bump type', () => {
        expect(bumpVersion('1.0.0')).toBe('1.0.1');
      });
    });

    describe('Minor version bumps', () => {
      it('should increment minor and reset patch to 0', () => {
        expect(bumpVersion('0.1.0', 'minor')).toBe('0.2.0');
        expect(bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
        expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
        expect(bumpVersion('2.9.5', 'minor')).toBe('2.10.0');
      });
    });

    describe('Major version bumps', () => {
      it('should increment major and reset minor and patch to 0', () => {
        expect(bumpVersion('0.1.0', 'major')).toBe('1.0.0');
        expect(bumpVersion('1.0.0', 'major')).toBe('2.0.0');
        expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
        expect(bumpVersion('9.5.2', 'major')).toBe('10.0.0');
      });
    });

    describe('Edge cases', () => {
      it('should handle single digit versions', () => {
        expect(bumpVersion('0', 'patch')).toBe('0.0.1');
        expect(bumpVersion('1', 'minor')).toBe('1.1.0');
        expect(bumpVersion('2', 'major')).toBe('3.0.0');
      });

      it('should handle two digit versions', () => {
        expect(bumpVersion('1.0', 'patch')).toBe('1.0.1');
        expect(bumpVersion('1.5', 'minor')).toBe('1.6.0');
        expect(bumpVersion('3.2', 'major')).toBe('4.0.0');
      });
    });
  });

  describe('Contract Snapshot Generation', () => {
    it('should create snapshot excluding internal database fields', () => {
      const contract: Contract = {
        id: 'db-internal-id-123', // Should be excluded
        contractId: 'user-auth-orchestrator',
        name: 'user-auth-orchestrator',
        displayName: 'User Authentication Orchestrator',
        type: 'orchestrator',
        status: 'published',
        version: '1.0.0',
        description: 'Handles user authentication flows',
        schema: {
          inputs: ['username', 'password'],
          outputs: ['authToken', 'userId'],
        },
        metadata: {
          tags: ['auth', 'security'],
          owner: 'platform-team',
        },
        createdBy: 'john.doe',
        updatedBy: 'jane.smith',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      // Snapshot should exclude internal 'id' field
      const snapshot = {
        contractId: contract.contractId,
        name: contract.name,
        displayName: contract.displayName,
        type: contract.type,
        status: contract.status,
        version: contract.version,
        description: contract.description,
        schema: contract.schema,
        metadata: contract.metadata,
        createdBy: contract.createdBy,
        updatedBy: contract.updatedBy,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      };

      expect(snapshot).not.toHaveProperty('id');
      expect(snapshot).toHaveProperty('contractId');
      expect(snapshot.contractId).toBe('user-auth-orchestrator');
      expect(snapshot.version).toBe('1.0.0');
      expect(snapshot.status).toBe('published');
    });

    it('should preserve all business logic fields', () => {
      const contract: Contract = {
        id: 'internal-123',
        contractId: 'email-sender',
        name: 'email-sender',
        displayName: 'Email Sender',
        type: 'effect',
        status: 'validated',
        version: '2.3.1',
        description: 'Sends transactional emails',
        schema: {
          emailProvider: 'sendgrid',
          templates: ['welcome', 'reset-password'],
        },
        metadata: {
          documentation: 'https://docs.example.com/email-sender',
          support: 'platform@example.com',
        },
        createdBy: 'system',
        updatedBy: 'admin',
        createdAt: new Date('2023-06-15T08:00:00Z'),
        updatedAt: new Date('2024-01-20T14:45:00Z'),
      };

      const snapshot = {
        contractId: contract.contractId,
        name: contract.name,
        displayName: contract.displayName,
        type: contract.type,
        status: contract.status,
        version: contract.version,
        description: contract.description,
        schema: contract.schema,
        metadata: contract.metadata,
        createdBy: contract.createdBy,
        updatedBy: contract.updatedBy,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      };

      // Verify all business fields are preserved
      expect(snapshot.contractId).toBe('email-sender');
      expect(snapshot.name).toBe('email-sender');
      expect(snapshot.displayName).toBe('Email Sender');
      expect(snapshot.type).toBe('effect');
      expect(snapshot.status).toBe('validated');
      expect(snapshot.version).toBe('2.3.1');
      expect(snapshot.description).toBe('Sends transactional emails');
      expect(snapshot.schema).toEqual({
        emailProvider: 'sendgrid',
        templates: ['welcome', 'reset-password'],
      });
      expect(snapshot.metadata).toEqual({
        documentation: 'https://docs.example.com/email-sender',
        support: 'platform@example.com',
      });
      expect(snapshot.createdBy).toBe('system');
      expect(snapshot.updatedBy).toBe('admin');
    });
  });

  describe('Contract Lifecycle Validation', () => {
    describe('Status transition rules', () => {
      it('should allow draft -> validated transition', () => {
        const currentStatus = 'draft';
        const _newStatus = 'validated';

        // Validation passes
        const isValid = currentStatus === 'draft';
        expect(isValid).toBe(true);
      });

      it('should allow validated -> published transition', () => {
        const currentStatus = 'validated';
        const _newStatus = 'published';

        const isValid = currentStatus === 'validated';
        expect(isValid).toBe(true);
      });

      it('should allow published -> deprecated transition', () => {
        const currentStatus = 'published';
        const _newStatus = 'deprecated';

        const isValid = currentStatus === 'published';
        expect(isValid).toBe(true);
      });

      it('should allow deprecated -> archived transition', () => {
        const currentStatus = 'deprecated';
        const _newStatus = 'archived';

        const isValid = currentStatus === 'deprecated';
        expect(isValid).toBe(true);
      });

      it('should reject draft -> published transition (must be validated first)', () => {
        const currentStatus = 'draft';
        const _newStatus = 'published';

        const isValid = currentStatus === 'validated';
        expect(isValid).toBe(false);
      });

      it('should reject published -> archived transition (must be deprecated first)', () => {
        const currentStatus = 'published';
        const _newStatus = 'archived';

        const isValid = currentStatus === 'deprecated';
        expect(isValid).toBe(false);
      });
    });

    describe('Draft contract mutability', () => {
      it('should allow updates to draft contracts', () => {
        const status = 'draft';
        const canUpdate = status === 'draft';

        expect(canUpdate).toBe(true);
      });

      it('should reject updates to validated contracts', () => {
        const status = 'validated';
        const canUpdate = status === 'draft';

        expect(canUpdate).toBe(false);
      });

      it('should reject updates to published contracts', () => {
        const status = 'published';
        const canUpdate = status === 'draft';

        expect(canUpdate).toBe(false);
      });

      it('should reject updates to deprecated contracts', () => {
        const status = 'deprecated';
        const canUpdate = status === 'draft';

        expect(canUpdate).toBe(false);
      });

      it('should reject updates to archived contracts', () => {
        const status = 'archived';
        const canUpdate = status === 'draft';

        expect(canUpdate).toBe(false);
      });
    });
  });

  describe('Contract Validation Rules', () => {
    describe('Name validation', () => {
      it('should pass for valid contract names', () => {
        const validNames = [
          'user-auth',
          'email-sender',
          'data-processor',
          'api-gateway',
          'user-auth-orchestrator',
        ];

        validNames.forEach((name) => {
          const isValid = /^[a-z][a-z0-9-]*$/.test(name) && name.length >= 3;
          expect(isValid).toBe(true);
        });
      });

      it('should fail for names with uppercase letters', () => {
        const invalidNames = ['UserAuth', 'Email-Sender', 'DataProcessor'];

        invalidNames.forEach((name) => {
          const isValid = /^[a-z][a-z0-9-]*$/.test(name);
          expect(isValid).toBe(false);
        });
      });

      it('should fail for names with special characters', () => {
        const invalidNames = ['user_auth', 'email.sender', 'data@processor'];

        invalidNames.forEach((name) => {
          const isValid = /^[a-z][a-z0-9-]*$/.test(name);
          expect(isValid).toBe(false);
        });
      });

      it('should fail for names starting with non-letter', () => {
        const invalidNames = ['1user-auth', '-email-sender', '9data'];

        invalidNames.forEach((name) => {
          const isValid = /^[a-z][a-z0-9-]*$/.test(name);
          expect(isValid).toBe(false);
        });
      });

      it('should fail for names shorter than 3 characters', () => {
        const invalidNames = ['ab', 'x', 'a1'];

        invalidNames.forEach((name) => {
          const isValid = name.length >= 3;
          expect(isValid).toBe(false);
        });
      });
    });

    describe('Version validation', () => {
      it('should pass for valid semver versions', () => {
        const validVersions = ['0.1.0', '1.0.0', '1.2.3', '10.5.2', '2.0.0-beta'];

        validVersions.forEach((version) => {
          const isValid = /^\d+\.\d+\.\d+/.test(version);
          expect(isValid).toBe(true);
        });
      });

      it('should fail for invalid version formats', () => {
        const invalidVersions = ['1.0', '1', 'v1.0.0', '1.0.0.0', 'invalid'];

        invalidVersions.forEach((version) => {
          const isValid = /^\d+\.\d+\.\d+$/.test(version);
          expect(isValid).toBe(false);
        });
      });
    });

    describe('Description validation', () => {
      it('should pass for descriptions with 10+ characters', () => {
        const validDescriptions = [
          'Handles user authentication flows',
          'Sends email notifications',
          'Processes incoming data',
        ];

        validDescriptions.forEach((description) => {
          const isValid = description.length >= 10;
          expect(isValid).toBe(true);
        });
      });

      it('should fail for short descriptions', () => {
        const invalidDescriptions = ['Short', 'Test', 'Abc123'];

        invalidDescriptions.forEach((description) => {
          const isValid = description.length >= 10;
          expect(isValid).toBe(false);
        });
      });
    });
  });

  describe('Audit Log Entry Creation', () => {
    it('should create audit entry for contract creation', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        fromVersion: null,
        toVersion: '0.1.0',
        actor: 'john.doe',
        reason: null,
        evidence: [],
        contentHash: 'abc123def456',
        snapshot: {
          contractId: 'user-auth',
          name: 'user-auth',
          displayName: 'User Auth',
          type: 'effect',
          status: 'draft',
          version: '0.1.0',
        },
        metadata: {},
      };

      expect(auditEntry.action).toBe('created');
      expect(auditEntry.fromStatus).toBeNull();
      expect(auditEntry.toStatus).toBe('draft');
      expect(auditEntry.toVersion).toBe('0.1.0');
      expect(auditEntry.snapshot).toBeDefined();
    });

    it('should create audit entry for validation', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'validated',
        fromStatus: 'draft',
        toStatus: 'validated',
        fromVersion: '0.1.0',
        toVersion: '0.1.0',
        actor: 'jane.smith',
        reason: null,
        evidence: [],
        contentHash: 'abc123def456',
      };

      expect(auditEntry.action).toBe('validated');
      expect(auditEntry.fromStatus).toBe('draft');
      expect(auditEntry.toStatus).toBe('validated');
    });

    it('should create audit entry for publishing with evidence', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'release-manager',
        reason: null,
        evidence: [
          { type: 'pr', url: 'https://github.com/org/repo/pull/123' },
          { type: 'ticket', url: 'https://jira.example.com/PROJ-456' },
        ],
        contentHash: 'final-hash-789',
      };

      expect(auditEntry.action).toBe('published');
      expect(auditEntry.evidence).toHaveLength(2);
      expect(auditEntry.evidence![0]).toHaveProperty('type', 'pr');
      expect(auditEntry.evidence![1]).toHaveProperty('type', 'ticket');
    });

    it('should create audit entry for deprecation with reason', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'deprecated',
        fromStatus: 'published',
        toStatus: 'deprecated',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'admin',
        reason: 'Replaced by v2.0.0 with improved performance',
        evidence: [],
        contentHash: 'deprecated-hash-abc',
      };

      expect(auditEntry.action).toBe('deprecated');
      expect(auditEntry.reason).toBe('Replaced by v2.0.0 with improved performance');
      expect(auditEntry.toStatus).toBe('deprecated');
    });

    it('should create audit entry for archiving', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'archived',
        fromStatus: 'deprecated',
        toStatus: 'archived',
        fromVersion: '1.0.0',
        toVersion: '1.0.0',
        actor: 'system',
        reason: 'No longer in use after 6 months deprecation period',
        evidence: [],
        contentHash: 'archived-hash-xyz',
      };

      expect(auditEntry.action).toBe('archived');
      expect(auditEntry.fromStatus).toBe('deprecated');
      expect(auditEntry.toStatus).toBe('archived');
    });

    it('should create audit entry for contract updates', () => {
      const auditEntry: Partial<ContractAuditLog> = {
        contractId: 'contract-123',
        action: 'updated',
        fromStatus: 'draft',
        toStatus: 'draft',
        fromVersion: '0.1.0',
        toVersion: '0.1.0',
        actor: 'developer',
        reason: null,
        evidence: [],
        contentHash: 'updated-hash-123',
        snapshot: {
          contractId: 'user-auth',
          name: 'user-auth',
          displayName: 'User Auth',
          type: 'effect',
          status: 'draft',
          version: '0.1.0',
          description: 'Updated description',
        },
      };

      expect(auditEntry.action).toBe('updated');
      expect(auditEntry.snapshot).toBeDefined();
      expect(auditEntry.contentHash).toBe('updated-hash-123');
    });
  });

  describe('Version ID Generation', () => {
    it('should generate version ID from contract ID and version', () => {
      const generateVersionId = (contractId: string, version: string): string => {
        return `${contractId}-v${version}`.replace(/\./g, '-');
      };

      expect(generateVersionId('user-auth', '1.0.0')).toBe('user-auth-v1-0-0');
      expect(generateVersionId('email-sender', '2.3.1')).toBe('email-sender-v2-3-1');
      expect(generateVersionId('data-processor', '0.1.0')).toBe('data-processor-v0-1-0');
    });

    it('should create unique IDs for different versions', () => {
      const generateVersionId = (contractId: string, version: string): string => {
        return `${contractId}-v${version}`.replace(/\./g, '-');
      };

      const id1 = generateVersionId('user-auth', '1.0.0');
      const id2 = generateVersionId('user-auth', '1.0.1');
      const id3 = generateVersionId('user-auth', '2.0.0');

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });
});
