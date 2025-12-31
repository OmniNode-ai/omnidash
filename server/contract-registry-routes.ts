/**
 * Contract Registry Routes
 *
 * REST API endpoints for the Contract Builder.
 * Provides contract CRUD operations, schema retrieval, validation, and export.
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
 * - GET /contracts/:id/audit - Get audit history for a contract
 * - GET /contracts/:id/audit/:auditId/snapshot - Get snapshot for an audit entry
 * - GET /contracts/:id/diff - Compute diff between two audit entries
 * - GET /contracts/:id/export - Export contract as ZIP bundle (with YAML files)
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
import type {
  Contract,
  InsertContract,
  InsertContractAuditLog,
  ContractAuditLog,
} from '@shared/intelligence-schema';
import crypto from 'crypto';
import { diffLines, type Change } from 'diff';
import archiver from 'archiver';
import yaml from 'js-yaml';

const router = Router();

// ESM compatibility: reconstruct __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

type ContractType = 'orchestrator' | 'effect' | 'reducer' | 'compute';
type _ContractStatus = 'draft' | 'validated' | 'published' | 'deprecated' | 'archived';

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
 * Convert contract to snapshot format (excludes internal database IDs)
 * Pattern: Same approach as contractToDisplayObject() in ContractDiff.tsx
 */
function contractToSnapshot(contract: Contract): Record<string, unknown> {
  return {
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
}

/**
 * Log audit entry for contract lifecycle changes
 * Pattern: Non-blocking - audit failures don't break main operations
 */
async function logAuditEntry(
  db: ReturnType<typeof getIntelligenceDb>,
  entry: InsertContractAuditLog,
  contractSnapshot?: Contract // Optional snapshot of contract state at time of action
): Promise<void> {
  try {
    await db.insert(contractAuditLog).values({
      ...entry,
      snapshot: contractSnapshot ? contractToSnapshot(contractSnapshot) : null,
    });
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
function _generateVersionId(contractId: string, version: string): string {
  return `${contractId}-v${version}`.replace(/\./g, '-');
}

// ============================================================================
// Bundle Export Helpers
// ============================================================================

/**
 * Bundle file structure for contract export
 */
interface ContractBundle {
  contract: Record<string, unknown>;
  schema: Record<string, unknown>;
  provenance: Record<string, unknown>;
  auditLog: Record<string, unknown>[];
  tests: {
    testCases: Record<string, unknown>;
    testResults: Record<string, unknown>;
  };
}

/**
 * Convert contract to YAML-friendly format for export
 */
function contractToExportFormat(contract: Contract): Record<string, unknown> {
  return {
    contractId: contract.contractId,
    name: contract.name,
    displayName: contract.displayName,
    type: contract.type,
    version: contract.version,
    status: contract.status,
    description: contract.description || '',
    metadata: contract.metadata || {},
    createdBy: contract.createdBy || 'unknown',
    updatedBy: contract.updatedBy || 'unknown',
    createdAt: contract.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: contract.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Generate provenance information for export
 */
function generateProvenance(
  contract: Contract,
  auditEntries: ContractAuditLog[]
): Record<string, unknown> {
  const publishEntry = auditEntries.find((e) => e.action === 'published');
  const _createEntry = auditEntries.find((e) => e.action === 'created');

  // Build version lineage from audit entries
  const versionLineage = auditEntries
    .filter((e) => e.toVersion)
    .map((e) => ({
      version: e.toVersion,
      action: e.action,
      timestamp: e.createdAt?.toISOString() || new Date().toISOString(),
      actor: e.actor || 'unknown',
      contentHash: e.contentHash || null,
    }))
    .reverse(); // Oldest first

  return {
    contractId: contract.contractId,
    currentVersion: contract.version,
    contentHash: generateContentHash(contract),
    createdAt: contract.createdAt?.toISOString() || new Date().toISOString(),
    createdBy: contract.createdBy || 'unknown',
    publishedAt: publishEntry?.createdAt?.toISOString() || null,
    publishedBy: publishEntry?.actor || null,
    versionLineage,
    evidence: publishEntry?.evidence || [],
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Convert audit entries to export format
 */
function auditEntriesToExportFormat(entries: ContractAuditLog[]): Record<string, unknown>[] {
  return entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    fromVersion: entry.fromVersion,
    toVersion: entry.toVersion,
    actor: entry.actor || 'unknown',
    reason: entry.reason || null,
    evidence: entry.evidence || [],
    contentHash: entry.contentHash || null,
    createdAt: entry.createdAt?.toISOString() || new Date().toISOString(),
    // Note: snapshots are included if available
    hasSnapshot: !!entry.snapshot,
  }));
}

/**
 * Generate placeholder test structure
 */
function generateTestPlaceholders(): {
  testCases: Record<string, unknown>;
  testResults: Record<string, unknown>;
} {
  return {
    testCases: {
      version: '1.0.0',
      cases: [],
      note: 'Test cases can be added here. Each case should include inputs, expected outputs, and assertions.',
    },
    testResults: {
      version: '1.0.0',
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      note: 'Test results will be populated when tests are executed.',
    },
  };
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

    // Log audit entry with snapshot
    await logAuditEntry(
      db,
      {
        contractId: created.id,
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        toVersion: created.version,
        contentHash: generateContentHash(created),
      },
      created
    );

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

    // Log audit entry with snapshot
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'updated',
        fromStatus: contract.status,
        toStatus: updated.status,
        fromVersion: contract.version,
        toVersion: updated.version,
        contentHash: generateContentHash(updated),
      },
      updated
    );

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

      // Log audit entry with snapshot
      await logAuditEntry(
        db,
        {
          contractId: id,
          action: 'validated',
          fromStatus: 'draft',
          toStatus: 'validated',
          toVersion: contract.version,
          contentHash: generateContentHash(updatedContract),
        },
        updatedContract
      );
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

    // Log audit entry with evidence and snapshot
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        toVersion: contract.version,
        contentHash: generateContentHash(published),
        evidence: evidence || [],
      },
      published
    );

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

    // Log audit entry with snapshot
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'deprecated',
        fromStatus: 'published',
        toStatus: 'deprecated',
        toVersion: contract.version,
        reason: reason || null,
        contentHash: generateContentHash(deprecated),
      },
      deprecated
    );

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

    // Log audit entry with snapshot
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'archived',
        fromStatus: 'deprecated',
        toStatus: 'archived',
        toVersion: contract.version,
        reason: reason || null,
        contentHash: generateContentHash(archived),
      },
      archived
    );

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

/**
 * Diff line representation for audit snapshot comparison
 */
interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null;
}

/**
 * Compute diff between two snapshots
 * Pattern: Same approach as ContractDiff.tsx (Myers algorithm via 'diff' library)
 */
function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { lines: DiffLine[]; additions: number; deletions: number } {
  const oldJson = JSON.stringify(oldObj, null, 2);
  const newJson = JSON.stringify(newObj, null, 2);

  const changes: Change[] = diffLines(oldJson, newJson);

  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let lineNumber = 1;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    for (const text of changeLines) {
      if (change.added) {
        lines.push({ text, type: 'added', lineNumber });
        additions++;
        lineNumber++;
      } else if (change.removed) {
        lines.push({ text, type: 'removed', lineNumber: null });
        deletions++;
      } else {
        lines.push({ text, type: 'unchanged', lineNumber });
        lineNumber++;
      }
    }
  }

  return { lines, additions, deletions };
}

/**
 * GET /:id/diff - Compute diff between two audit entries
 * Query params: from (auditId), to (auditId)
 */
router.get('/:id/diff', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const { from, to } = req.query;

    // Validate required parameters
    if (!from || !to) {
      return res.status(400).json({
        error: 'Missing required query parameters: from and to (audit entry IDs)',
      });
    }

    // Fetch both audit entries
    const [fromEntries, toEntries] = await Promise.all([
      db
        .select()
        .from(contractAuditLog)
        .where(and(eq(contractAuditLog.id, from as string), eq(contractAuditLog.contractId, id))),
      db
        .select()
        .from(contractAuditLog)
        .where(and(eq(contractAuditLog.id, to as string), eq(contractAuditLog.contractId, id))),
    ]);

    if (fromEntries.length === 0 || toEntries.length === 0) {
      return res.status(404).json({ error: 'One or both audit entries not found' });
    }

    const fromEntry = fromEntries[0];
    const toEntry = toEntries[0];

    // Check snapshots exist
    if (!fromEntry.snapshot || !toEntry.snapshot) {
      return res.status(400).json({
        error: 'Snapshots not available for one or both audit entries',
        details: {
          fromHasSnapshot: !!fromEntry.snapshot,
          toHasSnapshot: !!toEntry.snapshot,
        },
      });
    }

    // Compute diff using same approach as ContractDiff.tsx
    const diff = computeDiff(
      fromEntry.snapshot as Record<string, unknown>,
      toEntry.snapshot as Record<string, unknown>
    );

    res.json({
      from: {
        auditId: fromEntry.id,
        version: fromEntry.toVersion,
        timestamp: fromEntry.createdAt,
        action: fromEntry.action,
      },
      to: {
        auditId: toEntry.id,
        version: toEntry.toVersion,
        timestamp: toEntry.createdAt,
        action: toEntry.action,
      },
      diff,
    });
  } catch (error) {
    console.error('Error computing diff:', error);
    res.status(500).json({ error: 'Failed to compute diff' });
  }
});

/**
 * GET /:id/audit/:auditId/snapshot - Get snapshot for a specific audit entry
 */
router.get('/:id/audit/:auditId/snapshot', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id, auditId } = req.params;

    const result = await db
      .select()
      .from(contractAuditLog)
      .where(and(eq(contractAuditLog.id, auditId), eq(contractAuditLog.contractId, id)));

    if (result.length === 0) {
      return res.status(404).json({ error: 'Audit entry not found' });
    }

    const entry = result[0];

    if (!entry.snapshot) {
      return res.status(404).json({
        error: 'Snapshot not available for this audit entry',
        auditId: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
      });
    }

    res.json({
      auditId: entry.id,
      action: entry.action,
      version: entry.toVersion,
      timestamp: entry.createdAt,
      snapshot: entry.snapshot,
    });
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// ============================================================================
// Routes: Contract Export Bundle
// ============================================================================

/**
 * GET /:id/export - Export contract as a ZIP bundle
 *
 * Creates a ZIP archive containing:
 * - contract.yaml: Main contract definition
 * - schema.yaml: JSON Schema for the contract type
 * - provenance.yaml: Content hash, creation info, version lineage
 * - audit_log.yaml: Full audit trail
 * - tests/test_cases.yaml: Test case definitions (placeholder)
 * - tests/test_results.yaml: Test execution results (placeholder)
 *
 * Query params:
 * - format: 'zip' (default) or 'json' (returns bundle structure as JSON)
 * - include_snapshots: 'true' to include full snapshots in audit log (larger file)
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'zip', include_snapshots = 'false' } = req.query;
    const includeSnapshots = include_snapshots === 'true';

    let contract: Contract | undefined;
    let auditResult: ContractAuditLog[] = [];

    // Try database first, with error handling for connection failures
    try {
      const db = getDb();
      if (db) {
        const contractResult = await db.select().from(contracts).where(eq(contracts.id, id));
        if (contractResult.length > 0) {
          contract = contractResult[0];
          // Fetch audit log
          auditResult = await db
            .select()
            .from(contractAuditLog)
            .where(eq(contractAuditLog.contractId, id))
            .orderBy(desc(contractAuditLog.createdAt));
        }
      }
    } catch (_dbError) {
      console.warn('Database unavailable for export, falling back to static contracts');
    }

    // Fallback to static contracts if not found in DB or DB unavailable
    if (!contract) {
      const staticContracts = loadStaticContracts();
      contract = staticContracts.find((c) => c.id === id);
      // Static contracts don't have audit logs
      auditResult = [];
    }

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Load schema for this contract type
    const schema = loadSchema(contract.type as ContractType);

    // Build bundle
    const bundle: ContractBundle = {
      contract: contractToExportFormat(contract),
      schema: schema
        ? {
            type: contract.type,
            jsonSchema: schema.jsonSchema,
            uiSchema: schema.uiSchema,
          }
        : {
            type: contract.type,
            jsonSchema: {},
            uiSchema: {},
            note: `Schema not available for type: ${contract.type}`,
          },
      provenance: generateProvenance(contract, auditResult),
      auditLog: includeSnapshots
        ? auditResult.map((entry) => ({
            ...auditEntriesToExportFormat([entry])[0],
            snapshot: entry.snapshot || null,
          }))
        : auditEntriesToExportFormat(auditResult),
      tests: generateTestPlaceholders(),
    };

    // If JSON format requested, return the bundle as JSON
    if (format === 'json') {
      return res.json(bundle);
    }

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Generate filename
    const safeContractId = contract.contractId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeVersion = contract.version.replace(/\./g, '-');
    const filename = `contract_bundle_${safeContractId}_v${safeVersion}.zip`;

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      // Response may already be partially sent, so we can't send error JSON
      res.end();
    });

    // Add files to archive
    // 1. Contract definition
    archive.append(
      yaml.dump(bundle.contract, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      }),
      { name: 'contract.yaml' }
    );

    // 2. Schema
    archive.append(
      yaml.dump(bundle.schema, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      }),
      { name: 'schema.yaml' }
    );

    // 3. Provenance
    archive.append(
      yaml.dump(bundle.provenance, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      }),
      { name: 'provenance.yaml' }
    );

    // 4. Audit log
    archive.append(
      yaml.dump(
        { entries: bundle.auditLog },
        {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
        }
      ),
      { name: 'audit_log.yaml' }
    );

    // 5. Tests directory
    archive.append(
      yaml.dump(bundle.tests.testCases, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      }),
      { name: 'tests/test_cases.yaml' }
    );

    archive.append(
      yaml.dump(bundle.tests.testResults, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      }),
      { name: 'tests/test_results.yaml' }
    );

    // 6. Add a README
    const readme = `# Contract Bundle: ${contract.displayName}

## Contract ID: ${contract.contractId}
## Version: ${contract.version}
## Type: ${contract.type}
## Status: ${contract.status}

## Bundle Contents

- \`contract.yaml\` - Main contract definition
- \`schema.yaml\` - JSON Schema for validation
- \`provenance.yaml\` - Content hash and version lineage
- \`audit_log.yaml\` - Complete audit trail
- \`tests/\` - Test cases and results

## Exported

- Date: ${new Date().toISOString()}
- Exporter: ONEX Contract Registry

## Verification

Content hash: ${generateContentHash(contract)}

To verify the contract integrity, recompute the hash using:
1. Extract contract.yaml
2. Compute SHA-256 hash of the canonical JSON representation
3. Compare with the hash in provenance.yaml
`;

    archive.append(readme, { name: 'README.md' });

    // Finalize the archive
    await archive.finalize();
  } catch (error) {
    console.error('Error exporting contract:', error);
    // Only send error if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export contract' });
    }
  }
});

export default router;
