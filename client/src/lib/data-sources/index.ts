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
