/**
 * Contract Registry Routes
 *
 * REST API endpoints for the Contract Builder.
 * Provides contract CRUD operations, schema retrieval, and validation.
 *
 * API Endpoints:
 * - GET /contracts - List all contracts (with optional filters)
 * - GET /contracts/types - List available contract types
 * - GET /contracts/schema/:type - Get schema for a contract type
 * - GET /contracts/:id - Get a specific contract by ID
 * - POST /contracts - Create a new draft contract
 * - PUT /contracts/:id - Update a draft contract
 * - POST /contracts/:id/validate - Validate a contract
 * - POST /contracts/:id/publish - Publish a validated contract
 * - POST /contracts/:id/deprecate - Deprecate a published contract
 * - POST /contracts/:id/archive - Archive a deprecated contract
 *
 * Storage: PostgreSQL via Drizzle ORM
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { eq, and, ilike, desc } from 'drizzle-orm';
import { getIntelligenceDb } from './storage';
import { contracts, contractAuditLog } from '@shared/intelligence-schema';
import type { Contract, InsertContract, InsertContractAuditLog } from '@shared/intelligence-schema';
import crypto from 'crypto';

const router = Router();

// ESM compatibility: reconstruct __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

type ContractType = 'orchestrator' | 'effect' | 'reducer' | 'compute';
type ContractStatus = 'draft' | 'validated' | 'published' | 'deprecated' | 'archived';

interface ContractSchemaDefinition {
  type: ContractType;
  jsonSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get database instance with error handling
 */
function getDb() {
  try {
    return getIntelligenceDb();
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
}

/**
 * Generate content hash for audit purposes
 */
function generateContentHash(contract: Partial<Contract>): string {
  const content = JSON.stringify({
    name: contract.name,
    displayName: contract.displayName,
    type: contract.type,
    version: contract.version,
    description: contract.description,
    schema: contract.schema,
  });
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Log audit entry for contract lifecycle changes
 */
async function logAuditEntry(
  db: ReturnType<typeof getIntelligenceDb>,
  entry: InsertContractAuditLog
): Promise<void> {
  try {
    await db.insert(contractAuditLog).values(entry);
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

/**
 * Load static contracts from JSON file (fallback when DB unavailable)
 */
function loadStaticContracts(): Contract[] {
  try {
    const contractsPath = path.resolve(
      __dirname,
      '../client/src/components/contract-builder/models/contracts.json'
    );
    const data = fs.readFileSync(contractsPath, 'utf8');
    const jsonContracts = JSON.parse(data);
    // Map JSON fields to database schema fields
    return jsonContracts.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      contractId: c.contractId as string,
      name: c.name as string,
      displayName: c.displayName as string,
      type: c.type as string,
      status: c.status as string,
      version: c.version as string,
      description: c.description as string | null,
      schema: {},
      metadata: {},
      createdBy: c.createdBy as string | null,
      updatedBy: c.updatedBy as string | null,
      createdAt: c.createdAt ? new Date(c.createdAt as string) : new Date(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt as string) : new Date(),
    }));
  } catch (error) {
    console.error('Error loading static contracts:', error);
    return [];
  }
}

/**
 * Load schema for a contract type
 */
function loadSchema(type: ContractType): ContractSchemaDefinition | null {
  try {
    const schemasDir = path.resolve(__dirname, '../client/src/components/contract-builder/schemas');

    // Currently only effect schema exists; others use it as placeholder
    const jsonSchemaPath = path.join(schemasDir, 'effect-schema.json');
    const uiSchemaPath = path.join(schemasDir, 'effect-uischema.json');

    if (!fs.existsSync(jsonSchemaPath)) {
      return null;
    }

    const jsonSchema = JSON.parse(fs.readFileSync(jsonSchemaPath, 'utf8'));
    const uiSchema = fs.existsSync(uiSchemaPath)
      ? JSON.parse(fs.readFileSync(uiSchemaPath, 'utf8'))
      : {};

    return {
      type,
      jsonSchema,
      uiSchema,
    };
  } catch (error) {
    console.error(`Error loading schema for ${type}:`, error);
    return null;
  }
}

/**
 * Bump semantic version
 */
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

/**
 * Generate unique version ID
 */
function generateVersionId(contractId: string, version: string): string {
  return `${contractId}-v${version}`.replace(/\./g, '-');
}

// ============================================================================
// Routes: Contract Types & Schemas
// ============================================================================

/**
 * GET /types - List available contract types
 */
router.get('/types', (_req, res) => {
  try {
    const types: ContractType[] = ['orchestrator', 'effect', 'reducer', 'compute'];
    res.json(types);
  } catch (error) {
    console.error('Error fetching contract types:', error);
    res.status(500).json({ error: 'Failed to fetch contract types' });
  }
});

/**
 * GET /schema/:type - Get schema for a contract type
 */
router.get('/schema/:type', (req, res) => {
  try {
    const { type } = req.params;
    const validTypes: ContractType[] = ['orchestrator', 'effect', 'reducer', 'compute'];

    if (!validTypes.includes(type as ContractType)) {
      return res.status(400).json({ error: `Invalid contract type: ${type}` });
    }

    const schema = loadSchema(type as ContractType);
    if (!schema) {
      return res.status(404).json({ error: `Schema not found for type: ${type}` });
    }

    res.json({
      jsonSchema: schema.jsonSchema,
      uiSchema: schema.uiSchema,
    });
  } catch (error) {
    console.error('Error fetching schema:', error);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

// ============================================================================
// Routes: Contract CRUD
// ============================================================================

/**
 * GET / - List all contracts with optional filters
 * Query params: type, status, search
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      // Fallback to static contracts if DB unavailable
      console.warn('Database unavailable, using static contracts');
      const staticContracts = loadStaticContracts();
      return res.json(staticContracts);
    }

    const { type, status, search } = req.query;

    // Build query conditions
    const conditions = [];
    if (type && typeof type === 'string') {
      conditions.push(eq(contracts.type, type));
    }
    if (status && typeof status === 'string') {
      conditions.push(eq(contracts.status, status));
    }
    if (search && typeof search === 'string') {
      conditions.push(ilike(contracts.name, `%${search}%`));
    }

    let query = db.select().from(contracts);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    const result = await query.orderBy(desc(contracts.updatedAt));

    // If no contracts in DB, seed from static file
    if (result.length === 0) {
      console.log('No contracts in database, returning static contracts');
      const staticContracts = loadStaticContracts();
      return res.json(staticContracts);
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    // Fallback to static on error
    const staticContracts = loadStaticContracts();
    res.json(staticContracts);
  }
});

/**
 * GET /:id - Get a specific contract by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    if (!db) {
      // Fallback to static contracts
      const staticContracts = loadStaticContracts();
      const contract = staticContracts.find((c) => c.id === id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found' });
      }
      return res.json(contract);
    }

    const result = await db.select().from(contracts).where(eq(contracts.id, id));

    if (result.length === 0) {
      // Try static contracts as fallback
      const staticContracts = loadStaticContracts();
      const contract = staticContracts.find((c) => c.id === id);
      if (!contract) {
        return res.status(404).json({ error: 'Contract not found' });
      }
      return res.json(contract);
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

/**
 * POST / - Create a new draft contract
 * Body: { name, displayName, type, description?, sourceContractId?, versionBump? }
 */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const {
      name,
      displayName,
      type,
      description,
      sourceContractId,
      versionBump = 'patch',
    } = req.body;

    // Validate required fields
    if (!name || !displayName || !type) {
      return res.status(400).json({
        error: 'Missing required fields: name, displayName, type',
      });
    }

    const validTypes: ContractType[] = ['orchestrator', 'effect', 'reducer', 'compute'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid contract type: ${type}` });
    }

    let newContract: InsertContract;

    if (sourceContractId) {
      // Creating a new version based on existing contract
      const sourceResult = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, sourceContractId));

      if (sourceResult.length === 0) {
        return res.status(404).json({ error: 'Source contract not found' });
      }

      const sourceContract = sourceResult[0];
      const newVersion = bumpVersion(sourceContract.version, versionBump);

      newContract = {
        contractId: sourceContract.contractId,
        name: sourceContract.name,
        displayName: sourceContract.displayName,
        type: sourceContract.type,
        status: 'draft',
        version: newVersion,
        description: description || sourceContract.description,
        schema: sourceContract.schema,
        metadata: sourceContract.metadata,
      };
    } else {
      // Creating a brand new contract
      const contractId = name.toLowerCase().replace(/\s+/g, '-');

      newContract = {
        contractId,
        name,
        displayName,
        type,
        status: 'draft',
        version: '0.1.0',
        description: description || '',
        schema: {},
        metadata: {},
      };
    }

    const result = await db.insert(contracts).values(newContract).returning();
    const created = result[0];

    // Log audit entry
    await logAuditEntry(db, {
      contractId: created.id,
      action: 'created',
      fromStatus: null,
      toStatus: 'draft',
      toVersion: created.version,
      contentHash: generateContentHash(created),
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

/**
 * PUT /:id - Update a draft contract
 * Only drafts can be updated; other statuses are immutable
 */
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const updates = req.body;

    // Find the contract
    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = existing[0];

    // Only drafts can be updated
    if (contract.status !== 'draft') {
      return res.status(400).json({
        error: `Cannot update contract with status '${contract.status}'. Only drafts can be updated.`,
      });
    }

    // Prevent changing immutable fields
    const { id: _id, contractId: _contractId, createdAt: _createdAt, ...allowedUpdates } = updates;

    const result = await db
      .update(contracts)
      .set({
        ...allowedUpdates,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning();

    const updated = result[0];

    // Log audit entry
    await logAuditEntry(db, {
      contractId: id,
      action: 'updated',
      fromStatus: contract.status,
      toStatus: updated.status,
      fromVersion: contract.version,
      toVersion: updated.version,
      contentHash: generateContentHash(updated),
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// ============================================================================
// Routes: Validation & Publishing
// ============================================================================

/**
 * POST /:id/validate - Validate a contract
 * Returns validation result with errors/warnings
 */
router.post('/:id/validate', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;

    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = existing[0];

    // Basic validation rules
    const errors: string[] = [];
    const warnings: string[] = [];

    // Name validation
    if (!contract.name || contract.name.length < 3) {
      errors.push('Contract name must be at least 3 characters');
    }

    if (!/^[a-z][a-z0-9-]*$/.test(contract.name)) {
      errors.push(
        'Contract name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens'
      );
    }

    // Description validation
    if (!contract.description || contract.description.length < 10) {
      warnings.push('Description should be at least 10 characters');
    }

    // Version validation
    if (!/^\d+\.\d+\.\d+$/.test(contract.version)) {
      errors.push('Version must be in semver format (e.g., 1.0.0)');
    }

    const isValid = errors.length === 0;

    // Update status if valid and currently draft
    let updatedContract = contract;
    if (isValid && contract.status === 'draft') {
      const result = await db
        .update(contracts)
        .set({
          status: 'validated',
          updatedAt: new Date(),
        })
        .where(eq(contracts.id, id))
        .returning();

      updatedContract = result[0];

      // Log audit entry
      await logAuditEntry(db, {
        contractId: id,
        action: 'validated',
        fromStatus: 'draft',
        toStatus: 'validated',
        toVersion: contract.version,
        contentHash: generateContentHash(updatedContract),
      });
    }

    res.json({
      isValid,
      errors,
      warnings,
      contract: updatedContract,
    });
  } catch (error) {
    console.error('Error validating contract:', error);
    res.status(500).json({ error: 'Failed to validate contract' });
  }
});

/**
 * POST /:id/publish - Publish a validated contract
 * Only validated contracts can be published
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const { evidence } = req.body;

    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = existing[0];

    if (contract.status !== 'validated') {
      return res.status(400).json({
        error: `Cannot publish contract with status '${contract.status}'. Contract must be validated first.`,
      });
    }

    const result = await db
      .update(contracts)
      .set({
        status: 'published',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning();

    const published = result[0];

    // Log audit entry with evidence
    await logAuditEntry(db, {
      contractId: id,
      action: 'published',
      fromStatus: 'validated',
      toStatus: 'published',
      toVersion: contract.version,
      contentHash: generateContentHash(published),
      evidence: evidence || [],
    });

    res.json({
      success: true,
      contract: published,
      message: `Contract ${contract.name} v${contract.version} published successfully`,
    });
  } catch (error) {
    console.error('Error publishing contract:', error);
    res.status(500).json({ error: 'Failed to publish contract' });
  }
});

/**
 * POST /:id/deprecate - Deprecate a published contract
 */
router.post('/:id/deprecate', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = existing[0];

    if (contract.status !== 'published') {
      return res.status(400).json({
        error: `Cannot deprecate contract with status '${contract.status}'. Only published contracts can be deprecated.`,
      });
    }

    const result = await db
      .update(contracts)
      .set({
        status: 'deprecated',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning();

    const deprecated = result[0];

    // Log audit entry
    await logAuditEntry(db, {
      contractId: id,
      action: 'deprecated',
      fromStatus: 'published',
      toStatus: 'deprecated',
      toVersion: contract.version,
      reason: reason || null,
      contentHash: generateContentHash(deprecated),
    });

    res.json({
      success: true,
      contract: deprecated,
    });
  } catch (error) {
    console.error('Error deprecating contract:', error);
    res.status(500).json({ error: 'Failed to deprecate contract' });
  }
});

/**
 * POST /:id/archive - Archive a deprecated contract
 */
router.post('/:id/archive', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const contract = existing[0];

    if (contract.status !== 'deprecated') {
      return res.status(400).json({
        error: `Cannot archive contract with status '${contract.status}'. Only deprecated contracts can be archived.`,
      });
    }

    const result = await db
      .update(contracts)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id))
      .returning();

    const archived = result[0];

    // Log audit entry
    await logAuditEntry(db, {
      contractId: id,
      action: 'archived',
      fromStatus: 'deprecated',
      toStatus: 'archived',
      toVersion: contract.version,
      reason: reason || null,
      contentHash: generateContentHash(archived),
    });

    res.json({
      success: true,
      contract: archived,
    });
  } catch (error) {
    console.error('Error archiving contract:', error);
    res.status(500).json({ error: 'Failed to archive contract' });
  }
});

/**
 * GET /:id/audit - Get audit history for a contract
 */
router.get('/:id/audit', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;

    const result = await db
      .select()
      .from(contractAuditLog)
      .where(eq(contractAuditLog.contractId, id))
      .orderBy(desc(contractAuditLog.createdAt));

    res.json(result);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

export default router;
