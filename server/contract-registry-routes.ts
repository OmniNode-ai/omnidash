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
 *
 * Phase 1: File-based storage (JSON/YAML)
 * Phase 2: PostgreSQL via Drizzle ORM
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();

// ESM compatibility: reconstruct __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

type ContractType = 'orchestrator' | 'effect' | 'reducer' | 'compute';
type ContractStatus = 'draft' | 'validated' | 'published' | 'deprecated' | 'archived';

interface Contract {
  id: string;
  contractId: string;
  name: string;
  displayName: string;
  type: ContractType;
  status: ContractStatus;
  version: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

interface ContractSchemaDefinition {
  type: ContractType;
  jsonSchema: Record<string, unknown>;
  uiSchema: Record<string, unknown>;
}

// ============================================================================
// Data Loading
// ============================================================================

// In-memory store for dynamic contracts (drafts, updates)
// Phase 2 will replace this with database persistence
let dynamicContracts: Contract[] = [];

/**
 * Load static contracts from JSON file
 * In Phase 2, this will query the database
 */
function loadStaticContracts(): Contract[] {
  try {
    const contractsPath = path.resolve(
      __dirname,
      '../client/src/components/contract-builder/models/contracts.json'
    );
    const data = fs.readFileSync(contractsPath, 'utf8');
    return JSON.parse(data) as Contract[];
  } catch (error) {
    console.error('Error loading contracts:', error);
    return [];
  }
}

/**
 * Get all contracts (static + dynamic)
 * Dynamic contracts override static ones with the same ID
 */
function getAllContracts(): Contract[] {
  const staticContracts = loadStaticContracts();
  // Filter out static contracts that have dynamic versions (state changes move to dynamic)
  const dynamicIds = new Set(dynamicContracts.map((c) => c.id));
  const filteredStatic = staticContracts.filter((c) => !dynamicIds.has(c.id));
  return [...filteredStatic, ...dynamicContracts];
}

/**
 * Load schema for a contract type
 * In Phase 2, this could come from omnibase_core or database
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
router.get('/', (req, res) => {
  try {
    const { type, status, search } = req.query;
    let contracts = getAllContracts();

    // Filter by type
    if (type && typeof type === 'string') {
      contracts = contracts.filter((c) => c.type === type);
    }

    // Filter by status
    if (status && typeof status === 'string') {
      contracts = contracts.filter((c) => c.status === status);
    }

    // Search by name, displayName, or description
    if (search && typeof search === 'string') {
      const lowerSearch = search.toLowerCase();
      contracts = contracts.filter(
        (c) =>
          c.name.toLowerCase().includes(lowerSearch) ||
          c.displayName.toLowerCase().includes(lowerSearch) ||
          c.description?.toLowerCase().includes(lowerSearch)
      );
    }

    res.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

/**
 * GET /:id - Get a specific contract by ID
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const contracts = getAllContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

/**
 * POST / - Create a new draft contract
 * Body: { name, displayName, type, description?, sourceContractId?, versionBump? }
 */
router.post('/', (req, res) => {
  try {
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

    const now = new Date().toISOString();
    let newContract: Contract;

    if (sourceContractId) {
      // Creating a new version based on existing contract
      const contracts = getAllContracts();
      const sourceContract = contracts.find((c) => c.id === sourceContractId);

      if (!sourceContract) {
        return res.status(404).json({ error: 'Source contract not found' });
      }

      const newVersion = bumpVersion(sourceContract.version, versionBump);

      newContract = {
        ...sourceContract,
        id: generateVersionId(sourceContract.contractId, newVersion),
        version: newVersion,
        status: 'draft',
        description: description || sourceContract.description,
        createdAt: now,
        updatedAt: now,
        createdBy: undefined, // Would come from auth in production
      };
    } else {
      // Creating a brand new contract
      const contractId = name.toLowerCase().replace(/\s+/g, '-');

      newContract = {
        id: generateVersionId(contractId, '0.1.0'),
        contractId,
        name,
        displayName,
        type,
        status: 'draft',
        version: '0.1.0',
        description: description || '',
        createdAt: now,
        updatedAt: now,
      };
    }

    dynamicContracts.push(newContract);
    res.status(201).json(newContract);
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

/**
 * PUT /:id - Update a draft contract
 * Only drafts can be updated; other statuses are immutable
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Find the contract
    const dynamicIndex = dynamicContracts.findIndex((c) => c.id === id);
    const staticContracts = loadStaticContracts();
    const staticContract = staticContracts.find((c) => c.id === id);

    let contract: Contract | undefined;

    if (dynamicIndex >= 0) {
      contract = dynamicContracts[dynamicIndex];
    } else if (staticContract) {
      contract = staticContract;
    }

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only drafts can be updated
    if (contract.status !== 'draft') {
      return res.status(400).json({
        error: `Cannot update contract with status '${contract.status}'. Only drafts can be updated.`,
      });
    }

    // Prevent changing immutable fields
    const { id: _id, contractId: _contractId, createdAt: _createdAt, ...allowedUpdates } = updates;

    const updatedContract: Contract = {
      ...contract,
      ...allowedUpdates,
      updatedAt: new Date().toISOString(),
    };

    if (dynamicIndex >= 0) {
      dynamicContracts[dynamicIndex] = updatedContract;
    } else {
      // Move static contract to dynamic for updates
      dynamicContracts.push(updatedContract);
    }

    res.json(updatedContract);
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
router.post('/:id/validate', (req, res) => {
  try {
    const { id } = req.params;
    const contracts = getAllContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

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
      updatedContract = {
        ...contract,
        status: 'validated' as ContractStatus,
        updatedAt: new Date().toISOString(),
      };

      const dynamicIndex = dynamicContracts.findIndex((c) => c.id === id);
      if (dynamicIndex >= 0) {
        dynamicContracts[dynamicIndex] = updatedContract;
      } else {
        // Move static contract to dynamic storage for state changes
        dynamicContracts.push(updatedContract);
      }
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
router.post('/:id/publish', (req, res) => {
  try {
    const { id } = req.params;
    const { evidence: _evidence } = req.body; // Optional evidence links (TODO: implement)

    const contracts = getAllContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status !== 'validated') {
      return res.status(400).json({
        error: `Cannot publish contract with status '${contract.status}'. Contract must be validated first.`,
      });
    }

    const now = new Date().toISOString();
    const publishedContract: Contract = {
      ...contract,
      status: 'published',
      updatedAt: now,
    };

    // Update in dynamic contracts
    const dynamicIndex = dynamicContracts.findIndex((c) => c.id === id);
    if (dynamicIndex >= 0) {
      dynamicContracts[dynamicIndex] = publishedContract;
    } else {
      dynamicContracts.push(publishedContract);
    }

    // TODO: In Phase 2, store audit entry with evidence links
    // auditLog.append({
    //   action: 'publish',
    //   actor: req.user?.id,
    //   timestamp: now,
    //   fromVersion: null,
    //   toVersion: contract.version,
    //   contentHash: hash(contract),
    //   evidence: evidence || [],
    // });

    res.json({
      success: true,
      contract: publishedContract,
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
router.post('/:id/deprecate', (req, res) => {
  try {
    const { id } = req.params;
    const contracts = getAllContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status !== 'published') {
      return res.status(400).json({
        error: `Cannot deprecate contract with status '${contract.status}'. Only published contracts can be deprecated.`,
      });
    }

    const deprecatedContract: Contract = {
      ...contract,
      status: 'deprecated',
      updatedAt: new Date().toISOString(),
    };

    const dynamicIndex = dynamicContracts.findIndex((c) => c.id === id);
    if (dynamicIndex >= 0) {
      dynamicContracts[dynamicIndex] = deprecatedContract;
    } else {
      dynamicContracts.push(deprecatedContract);
    }

    res.json({
      success: true,
      contract: deprecatedContract,
    });
  } catch (error) {
    console.error('Error deprecating contract:', error);
    res.status(500).json({ error: 'Failed to deprecate contract' });
  }
});

/**
 * POST /:id/archive - Archive a deprecated contract
 */
router.post('/:id/archive', (req, res) => {
  try {
    const { id } = req.params;
    const contracts = getAllContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status !== 'deprecated') {
      return res.status(400).json({
        error: `Cannot archive contract with status '${contract.status}'. Only deprecated contracts can be archived.`,
      });
    }

    const archivedContract: Contract = {
      ...contract,
      status: 'archived',
      updatedAt: new Date().toISOString(),
    };

    const dynamicIndex = dynamicContracts.findIndex((c) => c.id === id);
    if (dynamicIndex >= 0) {
      dynamicContracts[dynamicIndex] = archivedContract;
    } else {
      dynamicContracts.push(archivedContract);
    }

    res.json({
      success: true,
      contract: archivedContract,
    });
  } catch (error) {
    console.error('Error archiving contract:', error);
    res.status(500).json({ error: 'Failed to archive contract' });
  }
});

export default router;
