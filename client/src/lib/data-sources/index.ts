// Backward compatibility - TODO: Migrate consumers to dashboard-schema widgets
// @deprecated - Import from _archive directly if needed during migration
export * from '../_archive/data-sources/index';

// ===========================
// Fresh Data Sources (OMN-1699)
// ===========================

// PATLEARN lifecycle model (new API) - distinct from legacy patternLearningSource
export {
  patlearnSource,
  type PatlearnListParams,
  type PatlearnDetailResponse,
} from './pattern-learning-source';

export type { PatlearnArtifact, PatlearnSummary, LifecycleState } from './pattern-learning-source';

// Validation dashboard data source (OMN-1907)
export {
  validationSource,
  type ValidationSummary,
  type RunSummary,
  type RunsListResponse,
} from './validation-source';

// Contract builder data sources (OMN-2358)
export {
  contractRegistrySource,
  type Contract,
  type ContractType,
  type ContractStatus,
  type GateViolation,
  type GateCheckResult,
} from './contract-registry-source';
export { contractSchemaSource, type ContractSchemas } from './contract-schema-source';
