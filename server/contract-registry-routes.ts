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
 * - PUT /contracts/:id - Update a draft or validated contract
 * - POST /contracts/:id/validate - Validate a contract (AJV + gate checks)
 * - POST /contracts/:id/publish - Publish a validated contract (atomic SQL gate)
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
import Ajv from 'ajv';
import { contractEventEmitter } from './contract-event-emitter';

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

type GateViolation = {
  code: string;
  message: string;
  path?: string;
  severity?: 'error' | 'warning';
};

type CanonicalContractPayload = {
  name: string;
  displayName: string;
  type: string;
  version: string;
  description: string | null;
  schema: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type LifecycleStatus = 'draft' | 'review' | 'validated' | 'published' | 'deprecated' | 'archived';

// ============================================================================
// Lifecycle State Machine
// ============================================================================

const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  draft: ['review', 'validated'],
  review: ['draft', 'validated'],
  validated: ['draft', 'published'],
  published: [],
  deprecated: ['archived'],
  archived: [],
};

function assertTransitionAllowed(from: LifecycleStatus, to: LifecycleStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid lifecycle transition: ${from} → ${to}`);
  }
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
 * Normalize determinism_class values from various UI/alias forms to canonical form
 */
function normalizeDeterminism(uiValue: string): string {
  const map: Record<string, string> = {
    deterministic: 'deterministic',
    nondeterministic: 'nondeterministic',
    'effect-driven': 'effect-driven',
    // lowercase variants
    effect_driven: 'effect-driven',
    non_deterministic: 'nondeterministic',
    'non-deterministic': 'nondeterministic',
  };
  return map[uiValue?.toLowerCase()] ?? uiValue;
}

/**
 * Convert contract to canonical payload for hashing
 */
function toCanonicalPayload(record: Contract): CanonicalContractPayload {
  return {
    name: record.name,
    displayName: record.displayName,
    type: record.type,
    version: record.version,
    description: record.description ?? null,
    schema: (record.schema as Record<string, unknown>) ?? {},
    metadata: (record.metadata as Record<string, unknown>) ?? {},
  };
}

/**
 * Recursively sort object keys for canonical serialization
 */
function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((obj as Record<string, unknown>)[k])])
    );
  }
  return obj;
}

/**
 * Produce canonical YAML string for a contract payload (stable across field ordering)
 */
function canonicalizeContract(payload: CanonicalContractPayload): string {
  return (
    yaml.dump(sortKeysDeep(payload) as object, {
      sortKeys: true,
      lineWidth: -1,
      noRefs: true,
    }) + '\n'
  );
}

/**
 * Generate full SHA-256 content hash from canonical payload
 */
function contentHash(payload: CanonicalContractPayload): string {
  return crypto.createHash('sha256').update(canonicalizeContract(payload)).digest('hex');
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
 * Load schema for a contract type — loads the type-specific schema file
 */
function loadSchema(type: ContractType): ContractSchemaDefinition | null {
  try {
    const schemasDir = path.resolve(__dirname, '../client/src/components/contract-builder/schemas');
    const jsonSchemaPath = path.join(schemasDir, `${type}-schema.json`);
    const uiSchemaPath = path.join(schemasDir, `${type}-uischema.json`);
    if (!fs.existsSync(jsonSchemaPath)) return null;
    const jsonSchema = JSON.parse(fs.readFileSync(jsonSchemaPath, 'utf8'));
    const uiSchema = fs.existsSync(uiSchemaPath)
      ? JSON.parse(fs.readFileSync(uiSchemaPath, 'utf8'))
      : {};
    return { type, jsonSchema, uiSchema };
  } catch (error) {
    console.error(`Error loading schema for ${type}:`, error);
    return null;
  }
}

/**
 * Run AJV-based server-side validation against the contract schema data
 * Returns a sorted list of GateViolation entries (empty = passes all gates)
 */
function runServerValidation(
  schemaData: Record<string, unknown>,
  contractType: ContractType
): GateViolation[] {
  const violations: GateViolation[] = [];

  // 1. Load schema for this type
  const contractSchema = loadSchema(contractType);
  if (!contractSchema) {
    violations.push({
      code: 'schema_not_found',
      message: `No schema found for node type: ${contractType}`,
      severity: 'error',
    });
    return violations;
  }

  // 2. AJV validation
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(contractSchema.jsonSchema);
  const valid = validate(schemaData);
  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      violations.push({
        code: 'schema_validation',
        message: err.message || 'Schema validation failed',
        path: err.instancePath || undefined,
        severity: 'error',
      });
    }
  }

  // 3. Determinism checks
  const determinismClass = schemaData.determinism_class as string | undefined;
  if (!determinismClass) {
    violations.push({
      code: 'missing_determinism_class',
      message: 'determinism_class is required',
      path: '/determinism_class',
      severity: 'error',
    });
  } else {
    const canonical = normalizeDeterminism(determinismClass);
    const validValues = ['deterministic', 'nondeterministic', 'effect-driven'];
    if (!validValues.includes(canonical)) {
      violations.push({
        code: 'invalid_determinism_class',
        message: `determinism_class must be one of: ${validValues.join(', ')}`,
        path: '/determinism_class',
        severity: 'error',
      });
    }
    // 4. effect_surface required for effect-driven
    if (canonical === 'effect-driven') {
      const effectSurface = schemaData.effect_surface as string[] | undefined;
      if (!effectSurface || effectSurface.length === 0) {
        violations.push({
          code: 'missing_effect_surface',
          message: 'effect_surface must be non-empty when determinism_class is effect-driven',
          path: '/effect_surface',
          severity: 'error',
        });
      }
    }
  }

  // Sort stably: by path + code + message
  return violations.sort((a, b) => {
    const keyA = `${a.path ?? ''}|${a.code}|${a.message}`;
    const keyB = `${b.path ?? ''}|${b.code}|${b.message}`;
    return keyA.localeCompare(keyB);
  });
}

/**
 * Run DRAFT → REVIEW completeness gate checks.
 *
 * These are lighter than the full publish gates: required fields filled,
 * determinism declared, effect surface declared when needed.
 * Returns a sorted list of GateViolation entries (empty = passes all gates).
 */
function runReviewGates(
  schemaData: Record<string, unknown>,
  contractType: ContractType,
  contractMeta: { name: string; displayName: string; description: string | null; version: string }
): GateViolation[] {
  const violations: GateViolation[] = [];

  // 1. Required top-level metadata
  if (!contractMeta.name || contractMeta.name.trim() === '') {
    violations.push({
      code: 'missing_name',
      message: 'Contract name is required',
      path: '/name',
      severity: 'error',
    });
  }
  if (!contractMeta.displayName || contractMeta.displayName.trim() === '') {
    violations.push({
      code: 'missing_display_name',
      message: 'Contract display name is required',
      path: '/displayName',
      severity: 'error',
    });
  }
  if (!contractMeta.description || contractMeta.description.trim() === '') {
    violations.push({
      code: 'missing_description',
      message: 'Description is required before sending to review',
      path: '/description',
      severity: 'error',
    });
  }

  // 2. Version format
  if (!/^\d+\.\d+\.\d+$/.test(contractMeta.version)) {
    violations.push({
      code: 'invalid_version',
      message: 'Version must follow semantic versioning format (e.g., 1.0.0)',
      path: '/version',
      severity: 'error',
    });
  }

  // 3. Determinism class must be declared
  const determinismClass = schemaData.determinism_class as string | undefined;
  if (!determinismClass || determinismClass.trim() === '') {
    violations.push({
      code: 'missing_determinism_class',
      message: 'determinism_class must be declared before review',
      path: '/schema/determinism_class',
      severity: 'error',
    });
  } else {
    const canonical = normalizeDeterminism(determinismClass);
    const validValues = ['deterministic', 'nondeterministic', 'effect-driven'];
    if (!validValues.includes(canonical)) {
      violations.push({
        code: 'invalid_determinism_class',
        message: `determinism_class must be one of: ${validValues.join(', ')}`,
        path: '/schema/determinism_class',
        severity: 'error',
      });
    }

    // 4. Effect surface required for effect-driven nodes
    if (canonical === 'effect-driven') {
      const effectSurface = schemaData.effect_surface as string[] | undefined;
      if (!effectSurface || effectSurface.length === 0) {
        violations.push({
          code: 'missing_effect_surface',
          message:
            'effect_surface must declare at least one surface when determinism_class is effect-driven',
          path: '/schema/effect_surface',
          severity: 'error',
        });
      }
    }
  }

  // 5. Node identity block required (at minimum the nested name/version)
  const nodeIdentity = schemaData.node_identity as Record<string, unknown> | undefined;
  if (!nodeIdentity || typeof nodeIdentity !== 'object') {
    violations.push({
      code: 'missing_node_identity',
      message: 'node_identity block is required (must include name and version)',
      path: '/schema/node_identity',
      severity: 'error',
    });
  } else {
    if (!nodeIdentity.name) {
      violations.push({
        code: 'missing_node_identity_name',
        message: 'node_identity.name is required',
        path: '/schema/node_identity/name',
        severity: 'error',
      });
    }
    if (!nodeIdentity.version) {
      violations.push({
        code: 'missing_node_identity_version',
        message: 'node_identity.version is required',
        path: '/schema/node_identity/version',
        severity: 'error',
      });
    }
  }

  // Type-specific: effect nodes must declare at least one io_operation
  if (contractType === 'effect') {
    const ioOps = schemaData.io_operations as unknown[] | undefined;
    if (!ioOps || ioOps.length === 0) {
      violations.push({
        code: 'missing_io_operations',
        message: 'Effect nodes must declare at least one io_operation before review',
        path: '/schema/io_operations',
        severity: 'error',
      });
    }
  }

  return violations.sort((a, b) => {
    const keyA = `${a.path ?? ''}|${a.code}|${a.message}`;
    const keyB = `${b.path ?? ''}|${b.code}|${b.message}`;
    return keyA.localeCompare(keyB);
  });
}

/**
 * Run REVIEW → PUBLISHED full policy gate checks.
 *
 * These are stricter than the review gates and run in addition to the
 * AJV-based schema validation already performed by runServerValidation().
 * Returns a sorted list of GateViolation entries (empty = passes all gates).
 */
function runPublishPolicyGates(
  schemaData: Record<string, unknown>,
  _contractType: ContractType
): GateViolation[] {
  const violations: GateViolation[] = [];

  // 1. Policy envelope: if present, validator references must not be empty strings
  const policyEnvelope = schemaData.policy_envelope as Record<string, unknown> | undefined;
  if (policyEnvelope !== undefined && policyEnvelope !== null) {
    const validators = policyEnvelope.validators as unknown[] | undefined;
    if (validators !== undefined) {
      if (!Array.isArray(validators)) {
        violations.push({
          code: 'invalid_policy_envelope_validators',
          message: 'policy_envelope.validators must be an array',
          path: '/schema/policy_envelope/validators',
          severity: 'error',
        });
      } else {
        for (let i = 0; i < validators.length; i++) {
          const v = validators[i];
          if (typeof v === 'string' && v.trim() === '') {
            violations.push({
              code: 'empty_policy_envelope_validator',
              message: `policy_envelope.validators[${i}] must not be an empty string`,
              path: `/schema/policy_envelope/validators/${i}`,
              severity: 'error',
            });
          } else if (typeof v === 'object' && v !== null) {
            const vObj = v as Record<string, unknown>;
            if (!vObj.name || (typeof vObj.name === 'string' && vObj.name.trim() === '')) {
              violations.push({
                code: 'empty_policy_envelope_validator_name',
                message: `policy_envelope.validators[${i}].name must not be empty`,
                path: `/schema/policy_envelope/validators/${i}/name`,
                severity: 'error',
              });
            }
          }
        }
      }
    }
  }

  // 2. contract_schema_version must be present and non-empty
  const csvRaw = schemaData.contract_schema_version as string | undefined;
  if (!csvRaw || String(csvRaw).trim() === '') {
    violations.push({
      code: 'missing_contract_schema_version',
      message: 'contract_schema_version is required for publishing',
      path: '/schema/contract_schema_version',
      severity: 'error',
    });
  }

  // 3. Metadata tags must be valid strings if present
  const metadataRaw = schemaData.metadata as Record<string, unknown> | undefined;
  if (metadataRaw !== undefined && metadataRaw !== null && typeof metadataRaw === 'object') {
    const tags = metadataRaw.tags as unknown[] | undefined;
    if (tags !== undefined && Array.isArray(tags)) {
      for (let i = 0; i < tags.length; i++) {
        if (typeof tags[i] === 'string' && (tags[i] as string).trim() === '') {
          violations.push({
            code: 'empty_metadata_tag',
            message: `metadata.tags[${i}] must not be an empty string`,
            path: `/schema/metadata/tags/${i}`,
            severity: 'error',
          });
        }
      }
    }
  }

  return violations.sort((a, b) => {
    const keyA = `${a.path ?? ''}|${a.code}|${a.message}`;
    const keyB = `${b.path ?? ''}|${b.code}|${b.message}`;
    return keyA.localeCompare(keyB);
  });
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
    contentHash: contentHash(toCanonicalPayload(contract)),
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
// Routes: Version-Based Lookup and Diff
// (registered before /:id to prevent shadowing)
// ============================================================================

/**
 * GET /versions/:contractId/:version - Read a specific contract version by logical ID + semver
 *
 * Implements `read_contract_version` from the OMN-2534 spec.
 * Looks up a contract by its stable contractId (e.g. 'user-auth-orchestrator') and
 * a specific semantic version string (e.g. '1.2.0').
 *
 * Returns 404 if no matching version exists.
 *
 * IMPORTANT: Must be registered before GET /:id to avoid route shadowing.
 */
router.get('/versions/:contractId/:version', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { contractId, version } = req.params;

    const result = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.contractId, contractId), eq(contracts.version, version)));

    if (result.length === 0) {
      return res.status(404).json({
        error: 'Contract version not found',
        contractId,
        version,
      });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error fetching contract version:', error);
    res.status(500).json({ error: 'Failed to fetch contract version' });
  }
});

// ============================================================================
// Breaking Change Detection (shared by diff-versions)
// ============================================================================

/**
 * Schema field descriptor extracted from a JSON Schema definition.
 */
interface FieldDescriptor {
  path: string;
  type: string | string[];
  required: boolean;
}

/**
 * Result of breaking change analysis between two contract schemas.
 */
interface BreakingChangeAnalysis {
  hasBreakingChanges: boolean;
  breakingChanges: BreakingChangeEntry[];
  nonBreakingChanges: NonBreakingChangeEntry[];
}

interface BreakingChangeEntry {
  type: 'removed_required_field' | 'type_changed' | 'capability_removed' | 'required_added';
  path: string;
  description: string;
  fromValue?: unknown;
  toValue?: unknown;
}

interface NonBreakingChangeEntry {
  type: 'field_added' | 'required_removed' | 'description_changed' | 'default_changed' | 'other';
  path: string;
  description: string;
  fromValue?: unknown;
  toValue?: unknown;
}

/**
 * Flatten a JSON Schema `properties` block into a path→descriptor map.
 * Handles nested objects recursively and tracks required fields.
 */
function flattenSchemaFields(
  schema: Record<string, unknown>,
  prefix = '',
  requiredFields: Set<string> = new Set()
): Map<string, FieldDescriptor> {
  const fields = new Map<string, FieldDescriptor>();

  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = (schema.required as string[] | undefined) ?? [];

  for (const req of required) {
    requiredFields.add(prefix ? `${prefix}.${req}` : req);
  }

  if (!properties) return fields;

  for (const [key, value] of Object.entries(properties)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const fieldDef = value as Record<string, unknown>;
    const fieldType = fieldDef.type as string | string[] | undefined;

    fields.set(fieldPath, {
      path: fieldPath,
      type: fieldType ?? 'any',
      required: requiredFields.has(fieldPath),
    });

    // Recurse into nested objects
    if (fieldDef.properties) {
      const nested = flattenSchemaFields(
        fieldDef as Record<string, unknown>,
        fieldPath,
        requiredFields
      );
      for (const [nestedPath, nestedDesc] of Array.from(nested)) {
        fields.set(nestedPath, nestedDesc);
      }
    }
  }

  return fields;
}

/**
 * Normalize a JSON Schema type value to a stable comparison string.
 */
function typeToString(t: string | string[] | undefined): string {
  if (!t) return 'any';
  return Array.isArray(t) ? [...t].sort().join('|') : t;
}

/**
 * Detect breaking and non-breaking changes between two contract JSON Schemas.
 *
 * Breaking changes (per OMN-2534 spec):
 * - Removed required fields — consumers relying on this field will break
 * - Changed field type — incompatible type change
 * - Capability removals — items removed from effect_surface
 * - New required field — existing producers can no longer satisfy the schema
 *
 * Non-breaking changes:
 * - Added optional fields
 * - Required constraint removed (widening)
 * - Description / default changes
 */
function detectBreakingChanges(
  fromSchema: Record<string, unknown>,
  toSchema: Record<string, unknown>
): BreakingChangeAnalysis {
  const fromFields = flattenSchemaFields(fromSchema);
  const toFields = flattenSchemaFields(toSchema);

  const breakingChanges: BreakingChangeEntry[] = [];
  const nonBreakingChanges: NonBreakingChangeEntry[] = [];

  // Check fields that existed in `from`
  for (const [path, fromDesc] of Array.from(fromFields)) {
    const toDesc = toFields.get(path);

    if (!toDesc) {
      // Field was removed
      if (fromDesc.required) {
        breakingChanges.push({
          type: 'removed_required_field',
          path,
          description: `Required field '${path}' was removed`,
          fromValue: fromDesc.type,
          toValue: undefined,
        });
      } else {
        nonBreakingChanges.push({
          type: 'other',
          path,
          description: `Optional field '${path}' was removed`,
          fromValue: fromDesc.type,
          toValue: undefined,
        });
      }
    } else {
      // Field exists in both — check type changes
      const fromType = typeToString(fromDesc.type as string | string[] | undefined);
      const toType = typeToString(toDesc.type as string | string[] | undefined);

      if (fromType !== toType && fromType !== 'any' && toType !== 'any') {
        breakingChanges.push({
          type: 'type_changed',
          path,
          description: `Field '${path}' type changed from '${fromType}' to '${toType}'`,
          fromValue: fromType,
          toValue: toType,
        });
      }

      // Required removed (widening — non-breaking)
      if (fromDesc.required && !toDesc.required) {
        nonBreakingChanges.push({
          type: 'required_removed',
          path,
          description: `Field '${path}' is no longer required (widening)`,
        });
      }
    }
  }

  // Check fields added in `to`
  for (const [path, toDesc] of Array.from(toFields)) {
    if (!fromFields.has(path)) {
      if (toDesc.required) {
        // New required field — existing producers cannot satisfy this
        breakingChanges.push({
          type: 'required_added',
          path,
          description: `New required field '${path}' was added`,
          toValue: toDesc.type,
        });
      } else {
        nonBreakingChanges.push({
          type: 'field_added',
          path,
          description: `New optional field '${path}' was added`,
          toValue: toDesc.type,
        });
      }
    }
  }

  // Check capability removals (effect_surface array)
  const fromCapabilities = (fromSchema.effect_surface as string[] | undefined) ?? [];
  const toCapabilities = (toSchema.effect_surface as string[] | undefined) ?? [];
  const removedCapabilities = fromCapabilities.filter((c) => !toCapabilities.includes(c));

  for (const cap of removedCapabilities) {
    breakingChanges.push({
      type: 'capability_removed',
      path: 'effect_surface',
      description: `Capability '${cap}' was removed from effect_surface`,
      fromValue: cap,
      toValue: undefined,
    });
  }

  return {
    hasBreakingChanges: breakingChanges.length > 0,
    breakingChanges,
    nonBreakingChanges,
  };
}

/**
 * GET /diff-versions - Diff two contract version UUIDs with breaking change detection
 *
 * Implements `diff_versions` from the OMN-2534 spec.
 * Takes two contract version UUIDs (database primary keys) and returns:
 * - A line-by-line diff of the canonical contract JSON
 * - Structured breaking change analysis (removed required fields, type changes, capability removals)
 *
 * Query params:
 * - from: UUID of the "older" contract version
 * - to:   UUID of the "newer" contract version
 *
 * IMPORTANT: Must be registered before GET /:id to avoid route shadowing.
 */
router.get('/diff-versions', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { from, to } = req.query;

    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({
        error: 'Missing required query parameters: from and to (contract version UUIDs)',
      });
    }

    // Fetch both contract versions in parallel
    const [fromResults, toResults] = await Promise.all([
      db.select().from(contracts).where(eq(contracts.id, from)),
      db.select().from(contracts).where(eq(contracts.id, to)),
    ]);

    if (fromResults.length === 0) {
      return res.status(404).json({ error: 'Source contract version not found', id: from });
    }
    if (toResults.length === 0) {
      return res.status(404).json({ error: 'Target contract version not found', id: to });
    }

    const fromContract = fromResults[0];
    const toContract = toResults[0];

    // Build display-friendly contract objects (excludes DB internals)
    const fromObj = contractToSnapshot(fromContract);
    const toObj = contractToSnapshot(toContract);

    // Line-by-line diff (same Myers algorithm as ContractDiff.tsx)
    const diff = computeDiff(fromObj, toObj);

    // Detect breaking changes between the two contract schemas
    const fromSchema = (fromContract.schema as Record<string, unknown>) ?? {};
    const toSchema = (toContract.schema as Record<string, unknown>) ?? {};
    const breakingChangeAnalysis = detectBreakingChanges(fromSchema, toSchema);

    res.json({
      from: {
        id: fromContract.id,
        contractId: fromContract.contractId,
        version: fromContract.version,
        status: fromContract.status,
        updatedAt: fromContract.updatedAt,
      },
      to: {
        id: toContract.id,
        contractId: toContract.contractId,
        version: toContract.version,
        status: toContract.status,
        updatedAt: toContract.updatedAt,
      },
      diff,
      breakingChanges: breakingChangeAnalysis,
    });
  } catch (error) {
    console.error('Error computing version diff:', error);
    res.status(500).json({ error: 'Failed to compute version diff' });
  }
});

// ============================================================================
// Routes: Contract CRUD
// ============================================================================

/**
 * GET / - List all contracts with optional filters
 * Query params: type, status, search
 *
 * Static fallback is only used when DB is completely unavailable.
 * When DB is available but returns no results, returns empty array.
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

    // DB is available; return whatever it has (may be empty)
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
 *
 * Static fallback is only used when DB is completely unavailable.
 * When DB is available but contract not found, returns 404.
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
      return res.status(404).json({ error: 'Contract not found' });
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

    const hash = contentHash(toCanonicalPayload(created));
    await logAuditEntry(
      db,
      {
        contractId: created.id,
        action: 'created',
        fromStatus: null,
        toStatus: 'draft',
        toVersion: created.version,
        contentHash: hash,
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
 * PUT /:id - Update a draft or validated contract
 * - Validated contracts are demoted to draft on any edit
 * - Published, deprecated, and archived contracts are immutable
 * - Normalizes determinism_class in schema if present
 */
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const updates = req.body;

    const existing = await db.select().from(contracts).where(eq(contracts.id, id));
    if (existing.length === 0) return res.status(404).json({ error: 'Contract not found' });

    const contract = existing[0];

    if (
      contract.status === 'published' ||
      contract.status === 'deprecated' ||
      contract.status === 'archived'
    ) {
      return res.status(409).json({
        error: `Cannot update contract with status '${contract.status}'. Only drafts, review, and validated contracts can be updated.`,
      });
    }

    // Editing a contract in review or validated state demotes it back to draft
    const wasDemoted = contract.status === 'validated' || contract.status === 'review';
    const { id: _id, contractId: _contractId, createdAt: _createdAt, ...allowedUpdates } = updates;

    // Normalize determinism in schema if present
    if (allowedUpdates.schema && typeof allowedUpdates.schema === 'object') {
      const schemaObj = allowedUpdates.schema as Record<string, unknown>;
      if (schemaObj.determinism_class) {
        schemaObj.determinism_class = normalizeDeterminism(schemaObj.determinism_class as string);
      }
    }

    // Always demote validated → draft on any edit
    const newStatus = wasDemoted ? 'draft' : contract.status;

    const result = await db
      .update(contracts)
      .set({ ...allowedUpdates, status: newStatus, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();

    const updated = result[0];
    const hash = contentHash(toCanonicalPayload(updated));

    if (wasDemoted) {
      await logAuditEntry(
        db,
        {
          contractId: id,
          action: 'demoted',
          fromStatus: contract.status, // may be 'validated' or 'review'
          toStatus: 'draft',
          fromVersion: contract.version,
          toVersion: updated.version,
          contentHash: hash,
        },
        updated
      );
    } else {
      await logAuditEntry(
        db,
        {
          contractId: id,
          action: 'updated',
          fromStatus: contract.status,
          toStatus: updated.status,
          fromVersion: contract.version,
          toVersion: updated.version,
          contentHash: hash,
        },
        updated
      );
    }

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
 * POST /:id/review - Submit a draft contract for review (DRAFT → REVIEW gate)
 *
 * Enforces completeness gates before the DRAFT→REVIEW transition:
 *   - required metadata fields filled (name, displayName, description, version)
 *   - determinism_class declared and valid
 *   - effect_surface declared for effect-driven nodes
 *   - node_identity block present with name + version
 *   - effect nodes have at least one io_operation
 *
 * Returns 200 + { lifecycle_state: 'review', contract } on success
 * Returns 422 + { error: 'review_gate_failed', gates: GateViolation[] } on failure
 * Returns 409 if contract is not in draft state
 */
router.post('/:id/review', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) return res.status(404).json({ error: 'not_found' });

    const contract = existing[0];

    if (contract.status !== 'draft') {
      return res.status(409).json({
        error: 'not_draft',
        message: `Contract must be in draft state to submit for review. Current state: '${contract.status}'.`,
      });
    }

    const schemaData = (contract.schema as Record<string, unknown>) ?? {};
    const violations = runReviewGates(schemaData, contract.type as ContractType, {
      name: contract.name,
      displayName: contract.displayName,
      description: contract.description ?? null,
      version: contract.version,
    });

    if (violations.length > 0) {
      await logAuditEntry(db, {
        contractId: id,
        action: 'review_gate_failed',
        fromStatus: contract.status,
        toStatus: contract.status,
        toVersion: contract.version,
        contentHash: contentHash(toCanonicalPayload(contract)),
      });
      return res.status(422).json({ error: 'review_gate_failed', gates: violations });
    }

    // Transition to 'review' — stored as the contract status
    const result = await db
      .update(contracts)
      .set({ status: 'review', updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.status, 'draft')))
      .returning();

    if (result.length === 0) {
      return res.status(409).json({
        error: 'concurrent_modification',
        message: 'Contract was concurrently modified. Please refresh and try again.',
      });
    }

    const reviewed = result[0];
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'review_submitted',
        fromStatus: 'draft',
        toStatus: 'review',
        toVersion: contract.version,
        contentHash: contentHash(toCanonicalPayload(reviewed)),
      },
      reviewed
    );

    return res.status(200).json({ lifecycle_state: 'review', contract: reviewed });
  } catch (error) {
    console.error('Error submitting contract for review:', error);
    res.status(500).json({ error: 'Failed to submit contract for review' });
  }
});

/**
 * POST /:id/validate - Validate a contract using AJV + gate checks
 * Returns 200 + { lifecycle_state, contract } on success
 * Returns 422 + { error, gates } on validation failure
 */
router.post('/:id/validate', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const existing = await db.select().from(contracts).where(eq(contracts.id, id));

    if (existing.length === 0) return res.status(404).json({ error: 'not_found' });

    const contract = existing[0];

    if (contract.status === 'published') {
      return res.status(409).json({ error: 'already_published' });
    }

    const schemaData = (contract.schema as Record<string, unknown>) ?? {};
    const violations = runServerValidation(schemaData, contract.type as ContractType);

    if (violations.length > 0) {
      await logAuditEntry(db, {
        contractId: id,
        action: 'validate_failed',
        fromStatus: contract.status,
        toStatus: contract.status,
        toVersion: contract.version,
        contentHash: contentHash(toCanonicalPayload(contract)),
      });
      return res.status(422).json({ error: 'validation_failed', gates: violations });
    }

    const result = await db
      .update(contracts)
      .set({ status: 'validated', updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();

    const validated = result[0];
    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'validated',
        fromStatus: contract.status,
        toStatus: 'validated',
        toVersion: contract.version,
        contentHash: contentHash(toCanonicalPayload(validated)),
      },
      validated
    );

    return res.status(200).json({ lifecycle_state: 'validated', contract: validated });
  } catch (error) {
    console.error('Error validating contract:', error);
    res.status(500).json({ error: 'Failed to validate contract' });
  }
});

/**
 * POST /:id/publish - Publish a validated contract (REVIEW → PUBLISHED gate)
 *
 * Enforces full policy gates before the REVIEW→PUBLISHED transition:
 *   1. Schema must pass AJV validation (runServerValidation — defense-in-depth)
 *   2. Policy envelope references must be valid (runPublishPolicyGates)
 *   3. contract_schema_version must be present
 *   4. Metadata tags must not contain empty strings
 *
 * Returns 200 + { success, contract, content_hash } on success
 * Returns 422 + { error: 'publish_gate_failed', gates: GateViolation[] } on gate failure
 * Returns 409 if contract is not in validated state
 *
 * Uses atomic SQL gate: only publishes if status is still 'validated'
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });

    const { id } = req.params;
    const { evidence } = req.body;

    // Pre-flight: check contract exists and run gate validation
    const existing = await db.select().from(contracts).where(eq(contracts.id, id));
    if (existing.length === 0) return res.status(404).json({ error: 'not_found' });

    const contract = existing[0];

    // Check lifecycle state FIRST before running validation
    if (contract.status !== 'validated') {
      return res.status(409).json({
        error: 'not_validated_or_concurrent_publish',
        message: `Contract must be in validated state to publish. Current state: '${contract.status}'.`,
      });
    }

    const schemaData = (contract.schema as Record<string, unknown>) ?? {};

    // Layer 1: AJV schema validation + determinism gates (defense-in-depth)
    const schemaViolations = runServerValidation(schemaData, contract.type as ContractType);

    // Layer 2: Policy-specific publish gate checks
    const policyViolations = runPublishPolicyGates(schemaData, contract.type as ContractType);

    const violations = [...schemaViolations, ...policyViolations];

    if (violations.length > 0) {
      await logAuditEntry(db, {
        contractId: id,
        action: 'publish_gate_failed',
        fromStatus: contract.status,
        toStatus: contract.status,
        toVersion: contract.version,
        contentHash: contentHash(toCanonicalPayload(contract)),
      });
      return res.status(422).json({ error: 'publish_gate_failed', gates: violations });
    }

    const hash = contentHash(toCanonicalPayload(contract));

    // Atomic SQL gate: only publishes if status is still 'validated' (handles concurrent races)
    const result = await db
      .update(contracts)
      .set({ status: 'published', updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.status, 'validated')))
      .returning();

    if (result.length === 0) {
      return res.status(409).json({
        error: 'not_validated_or_concurrent_publish',
        message: 'Contract was concurrently modified or already published.',
      });
    }

    const published = result[0];

    await logAuditEntry(
      db,
      {
        contractId: id,
        action: 'published',
        fromStatus: 'validated',
        toStatus: 'published',
        toVersion: contract.version,
        contentHash: hash,
        evidence: evidence || [],
      },
      published
    );

    // Emit contract_published event (non-blocking, fire-and-forget)
    void contractEventEmitter.emit('contract_published', {
      contractId: published.id,
      contractLogicalId: published.contractId,
      version: published.version,
      actor: req.body?.actor || 'system',
      contentHash: hash,
    });

    res.json({
      success: true,
      contract: published,
      content_hash: hash,
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
        contentHash: contentHash(toCanonicalPayload(deprecated)),
      },
      deprecated
    );

    // Emit contract_deprecated event (non-blocking, fire-and-forget)
    void contractEventEmitter.emit('contract_deprecated', {
      contractId: deprecated.id,
      contractLogicalId: deprecated.contractId,
      version: deprecated.version,
      actor: req.body?.actor || reason || 'system',
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
        contentHash: contentHash(toCanonicalPayload(archived)),
      },
      archived
    );

    // Emit contract_archived event (non-blocking, fire-and-forget)
    void contractEventEmitter.emit('contract_archived', {
      contractId: archived.id,
      contractLogicalId: archived.contractId,
      version: archived.version,
      actor: req.body?.actor || reason || 'system',
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
    const exportHash = contentHash(toCanonicalPayload(contract));
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

Content hash: ${exportHash}

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

// ============================================================================
// Phase 3: Base profile + overlay resolve proxy endpoints
// ============================================================================

/**
 * GET /profiles - List available base profiles per node type.
 *
 * Proxies to the contract resolver bridge service at http://omninode-contract-resolver:8091
 * Falls back to a static profile list when the bridge is unreachable.
 */
router.get('/profiles', async (req, res) => {
  const BRIDGE_URL =
    process.env.CONTRACT_RESOLVER_URL ?? 'http://omninode-contract-resolver:8091';
  try {
    const upstream = await fetch(`${BRIDGE_URL}/api/nodes/profiles`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) {
      throw new Error(`Bridge returned ${upstream.status}`);
    }
    const data = await upstream.json();
    return res.json(data);
  } catch {
    // Bridge unavailable — return static profile catalogue so the UI stays functional.
    const staticProfiles = {
      orchestrator: [
        { id: 'orchestrator_safe', label: 'orchestrator_safe', version: '1.0.0' },
      ],
      effect: [
        { id: 'effect_idempotent', label: 'effect_idempotent', version: '1.0.0' },
        { id: 'effect_streaming', label: 'effect_streaming', version: '1.0.0' },
      ],
      reducer: [
        { id: 'reducer_aggregate', label: 'reducer_aggregate', version: '1.0.0' },
      ],
      compute: [
        { id: 'compute_pure', label: 'compute_pure', version: '1.0.0' },
      ],
    };
    return res.json(staticProfiles);
  }
});

/**
 * POST /resolve - Resolve a base profile + overlay patch into a full contract.
 *
 * Body: { base_profile: string, base_version: string, overlay: Record<string, unknown> }
 * Proxies to http://omninode-contract-resolver:8091/api/nodes/contract.resolve
 *
 * Falls back to a simple client-side merge when the bridge is unreachable.
 */
router.post('/resolve', async (req, res) => {
  const BRIDGE_URL =
    process.env.CONTRACT_RESOLVER_URL ?? 'http://omninode-contract-resolver:8091';
  try {
    const upstream = await fetch(`${BRIDGE_URL}/api/nodes/contract.resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => 'Unknown error');
      return res.status(upstream.status).json({ error: text });
    }
    const data = await upstream.json();
    return res.json(data);
  } catch {
    // Bridge unreachable: perform a simple shallow merge so the Preview remains useful.
    try {
      const { overlay = {} } = req.body as { overlay?: Record<string, unknown> };
      const resolved = {
        _note: 'Bridge unavailable — shallow merge only',
        ...overlay,
      };
      return res.json({ resolved });
    } catch {
      return res.status(503).json({ error: 'Contract resolver bridge is unavailable' });
    }
  }
});

export default router;
