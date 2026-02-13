import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  serial,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

/**
 * Agent Routing Decisions Table
 * Tracks all routing decisions made by the polymorphic agent system
 * with confidence scoring and performance metrics
 */
export const agentRoutingDecisions = pgTable(
  'agent_routing_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: uuid('correlation_id').notNull(),
    sessionId: uuid('session_id'),
    userRequest: text('user_request').notNull(),
    userRequestHash: text('user_request_hash'),
    contextSnapshot: jsonb('context_snapshot'),
    selectedAgent: text('selected_agent').notNull(),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
    routingStrategy: text('routing_strategy').notNull(),
    triggerConfidence: numeric('trigger_confidence', { precision: 5, scale: 4 }),
    contextConfidence: numeric('context_confidence', { precision: 5, scale: 4 }),
    capabilityConfidence: numeric('capability_confidence', { precision: 5, scale: 4 }),
    historicalConfidence: numeric('historical_confidence', { precision: 5, scale: 4 }),
    alternatives: jsonb('alternatives'),
    reasoning: text('reasoning'),
    routingTimeMs: integer('routing_time_ms').notNull(),
    cacheHit: boolean('cache_hit').default(false),
    selectionValidated: boolean('selection_validated').default(false),
    actualSuccess: boolean('actual_success'), // @deprecated Use executionSucceeded instead
    executionSucceeded: boolean('execution_succeeded'),
    actualQualityScore: numeric('actual_quality_score', { precision: 5, scale: 4 }),
    createdAt: timestamp('created_at').defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [uniqueIndex('idx_agent_routing_decisions_correlation').on(table.correlationId)]
);

/**
 * Agent Actions Table
 * Tracks all actions executed by agents for observability
 * and debugging purposes
 */
export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: uuid('correlation_id').notNull(),
    agentName: text('agent_name').notNull(),
    actionType: text('action_type').notNull(),
    actionName: text('action_name').notNull(),
    actionDetails: jsonb('action_details').default({}),
    debugMode: boolean('debug_mode').default(true),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at').defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [uniqueIndex('idx_agent_actions_correlation').on(table.correlationId)]
);

// Export Zod schemas for validation
export const insertAgentRoutingDecisionSchema = createInsertSchema(agentRoutingDecisions);
export const insertAgentActionSchema = createInsertSchema(agentActions);

/**
 * Agent Transformation Events Table
 * Tracks polymorphic agent transformations between roles
 */
export const agentTransformationEvents = pgTable(
  'agent_transformation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceAgent: text('source_agent').notNull(),
    targetAgent: text('target_agent').notNull(),
    transformationReason: text('transformation_reason'),
    confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }),
    transformationDurationMs: integer('transformation_duration_ms'),
    success: boolean('success').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    projectPath: text('project_path'),
    projectName: text('project_name'),
    claudeSessionId: text('claude_session_id'),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_ate_source_target_created').on(
      table.sourceAgent,
      table.targetAgent,
      table.createdAt
    ),
  ]
);

export const insertAgentTransformationEventSchema = createInsertSchema(agentTransformationEvents);

/**
 * Agent Manifest Injections Table
 * Tracks manifest generation with pattern discovery metrics
 * and intelligence query performance
 */
export const agentManifestInjections = pgTable('agent_manifest_injections', {
  id: uuid('id').primaryKey().defaultRandom(),
  correlationId: uuid('correlation_id').notNull(),
  routingDecisionId: uuid('routing_decision_id'),
  agentName: text('agent_name').notNull(),
  manifestVersion: text('manifest_version').notNull(),
  generationSource: text('generation_source').notNull(),
  isFallback: boolean('is_fallback').default(false),
  patternsCount: integer('patterns_count').default(0),
  infrastructureServices: integer('infrastructure_services').default(0),
  debugIntelligenceSuccesses: integer('debug_intelligence_successes').default(0),
  debugIntelligenceFailures: integer('debug_intelligence_failures').default(0),
  queryTimes: jsonb('query_times').notNull(),
  totalQueryTimeMs: integer('total_query_time_ms').notNull(),
  fullManifestSnapshot: jsonb('full_manifest_snapshot').notNull(),
  agentExecutionSuccess: boolean('agent_execution_success'),
  agentExecutionTimeMs: integer('agent_execution_time_ms'),
  agentQualityScore: numeric('agent_quality_score', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow(),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertAgentManifestInjectionSchema = createInsertSchema(agentManifestInjections);

/**
 * Pattern Lineage Nodes Table
 * Tracks code patterns discovered and their lineage
 */
export const patternLineageNodes = pgTable('pattern_lineage_nodes', {
  id: uuid('id').primaryKey(),
  patternId: varchar('pattern_id', { length: 255 }).notNull(),
  patternName: varchar('pattern_name', { length: 255 }).notNull(),
  patternType: varchar('pattern_type', { length: 100 }).notNull(),
  patternVersion: varchar('pattern_version', { length: 50 }).notNull(),
  lineageId: uuid('lineage_id').notNull(),
  generation: integer('generation').notNull(),
  patternData: jsonb('pattern_data').notNull(),
  metadata: jsonb('metadata'),
  correlationId: uuid('correlation_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  language: varchar('language', { length: 50 }),
  projectedAt: timestamp('projected_at').defaultNow(),
});

/**
 * Pattern Lineage Edges Table
 * Tracks relationships between patterns
 */
export const patternLineageEdges = pgTable('pattern_lineage_edges', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceNodeId: uuid('source_node_id').notNull(),
  targetNodeId: uuid('target_node_id').notNull(),
  edgeType: text('edge_type').notNull(),
  edgeWeight: numeric('edge_weight', { precision: 10, scale: 6 }),
  transformationType: text('transformation_type'),
  metadata: jsonb('metadata'),
  correlationId: uuid('correlation_id'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by'),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertPatternLineageNodeSchema = createInsertSchema(patternLineageNodes);
export const insertPatternLineageEdgeSchema = createInsertSchema(patternLineageEdges);

/**
 * Pattern Quality Metrics Table
 * Tracks quality scores and confidence metrics for patterns
 */
export const patternQualityMetrics = pgTable('pattern_quality_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  patternId: uuid('pattern_id').notNull().unique(),
  qualityScore: numeric('quality_score', { precision: 10, scale: 6 }).notNull(),
  confidence: numeric('confidence', { precision: 10, scale: 6 }).notNull(),
  measurementTimestamp: timestamp('measurement_timestamp', { withTimezone: true })
    .notNull()
    .defaultNow(),
  version: text('version').default('1.0.0'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  projectedAt: timestamp('projected_at').defaultNow(),
});

export const insertPatternQualityMetricsSchema = createInsertSchema(patternQualityMetrics);

/**
 * Pattern Learning Artifacts Table
 * Stores complete PATLEARN output objects as JSONB for dashboard consumption.
 *
 * Design: Projection table, not normalized. UI reads directly from stored shape.
 */
export const patternLearningArtifacts = pgTable(
  'pattern_learning_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patternId: uuid('pattern_id').notNull(),
    patternName: varchar('pattern_name', { length: 255 }).notNull(),
    patternType: varchar('pattern_type', { length: 100 }).notNull(),
    language: varchar('language', { length: 50 }),

    // Lifecycle (indexed for filtering)
    lifecycleState: text('lifecycle_state').notNull().default('candidate'),
    stateChangedAt: timestamp('state_changed_at', { withTimezone: true }),

    // Composite score (indexed for sorting)
    compositeScore: numeric('composite_score', { precision: 10, scale: 6 }).notNull(),

    // JSONB fields for full evidence
    scoringEvidence: jsonb('scoring_evidence').notNull(),
    signature: jsonb('signature').notNull(),
    metrics: jsonb('metrics').default({}),
    metadata: jsonb('metadata').default({}),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    // Index for lifecycle state filtering (WHERE lifecycle_state = ?)
    index('idx_patlearn_lifecycle_state').on(table.lifecycleState),
    // Index for composite score sorting (ORDER BY composite_score DESC)
    index('idx_patlearn_composite_score').on(table.compositeScore),
    // Index for state change time filtering (promotions/deprecations)
    index('idx_patlearn_state_changed_at').on(table.stateChangedAt),
    // Index for created_at sorting
    index('idx_patlearn_created_at').on(table.createdAt),
    // Index for updated_at sorting
    index('idx_patlearn_updated_at').on(table.updatedAt),
    // Compound index for filtered sorts (WHERE lifecycle_state = ? ORDER BY composite_score)
    index('idx_patlearn_lifecycle_score').on(table.lifecycleState, table.compositeScore),
  ]
);

export const insertPatternLearningArtifactSchema = createInsertSchema(patternLearningArtifacts);

/**
 * ONEX Compliance Stamps Table
 * Tracks ONEX architectural compliance status for files
 */
export const onexComplianceStamps = pgTable('onex_compliance_stamps', {
  id: uuid('id').primaryKey().defaultRandom(),
  filePath: text('file_path').notNull(),
  complianceStatus: text('compliance_status').notNull(), // 'compliant', 'non_compliant', 'pending'
  complianceScore: numeric('compliance_score', { precision: 5, scale: 4 }),
  nodeType: text('node_type'), // 'effect', 'compute', 'reducer', 'orchestrator'
  violations: jsonb('violations').default([]),
  metadata: jsonb('metadata').default({}),
  correlationId: uuid('correlation_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertOnexComplianceStampSchema = createInsertSchema(onexComplianceStamps);

// Export TypeScript types
export type AgentRoutingDecision = typeof agentRoutingDecisions.$inferSelect;
export type InsertAgentRoutingDecision = typeof agentRoutingDecisions.$inferInsert;
export type AgentAction = typeof agentActions.$inferSelect;
export type InsertAgentAction = typeof agentActions.$inferInsert;
export type AgentTransformationEvent = typeof agentTransformationEvents.$inferSelect;
export type InsertAgentTransformationEvent = typeof agentTransformationEvents.$inferInsert;
export type AgentManifestInjection = typeof agentManifestInjections.$inferSelect;
export type InsertAgentManifestInjection = typeof agentManifestInjections.$inferInsert;
export type PatternLineageNode = typeof patternLineageNodes.$inferSelect;
export type InsertPatternLineageNode = typeof patternLineageNodes.$inferInsert;
export type PatternLineageEdge = typeof patternLineageEdges.$inferSelect;
export type InsertPatternLineageEdge = typeof patternLineageEdges.$inferInsert;
export type PatternLearningArtifact = typeof patternLearningArtifacts.$inferSelect;
export type InsertPatternLearningArtifact = typeof patternLearningArtifacts.$inferInsert;
export type OnexComplianceStamp = typeof onexComplianceStamps.$inferSelect;
export type InsertOnexComplianceStamp = typeof onexComplianceStamps.$inferInsert;

/**
 * Document Metadata Table
 * Tracks documents in the knowledge base with access statistics
 */
export const documentMetadata = pgTable('document_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  repository: text('repository').notNull(),
  filePath: text('file_path').notNull(),
  status: text('status').notNull().default('active'),
  contentHash: text('content_hash'),
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: timestamp('last_accessed_at'),
  vectorId: text('vector_id'),
  graphId: text('graph_id'),
  metadata: jsonb('metadata').notNull().default({}),
  projectedAt: timestamp('projected_at').defaultNow(),
});

/**
 * Document Access Log Table
 * Tracks document access events for analytics
 */
export const documentAccessLog = pgTable('document_access_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull(),
  accessedAt: timestamp('accessed_at').defaultNow(),
  accessType: text('access_type').notNull(),
  correlationId: uuid('correlation_id'),
  sessionId: uuid('session_id'),
  queryText: text('query_text'),
  relevanceScore: numeric('relevance_score', { precision: 10, scale: 6 }),
  responseTimeMs: integer('response_time_ms'),
  metadata: jsonb('metadata').notNull().default({}),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertDocumentMetadataSchema = createInsertSchema(documentMetadata);
export const insertDocumentAccessLogSchema = createInsertSchema(documentAccessLog);

/**
 * Node Service Registry Table
 * Tracks service discovery and health status for platform monitoring
 */
export const nodeServiceRegistry = pgTable('node_service_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceName: text('service_name').notNull().unique(),
  serviceUrl: text('service_url').notNull(),
  serviceType: text('service_type'), // e.g., 'api', 'database', 'cache', 'queue'
  healthStatus: text('health_status').notNull().default('unknown'), // 'healthy', 'degraded', 'unhealthy'
  lastHealthCheck: timestamp('last_health_check'),
  healthCheckIntervalSeconds: integer('health_check_interval_seconds').default(60),
  metadata: jsonb('metadata').default({}),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schema for validation
export const insertNodeServiceRegistrySchema = createInsertSchema(nodeServiceRegistry);

/**
 * Task Completion Metrics Table
 * Tracks task completion statistics for developer productivity analysis
 */
export const taskCompletionMetrics = pgTable('task_completion_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow(),
  correlationId: uuid('correlation_id'),
  taskType: text('task_type'),
  taskDescription: text('task_description'),
  completionTimeMs: integer('completion_time_ms').notNull(),
  success: boolean('success').default(true),
  agentName: text('agent_name'),
  metadata: jsonb('metadata').default({}),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schema for validation
export const insertTaskCompletionMetricsSchema = createInsertSchema(taskCompletionMetrics);

// Export TypeScript types
export type TaskCompletionMetric = typeof taskCompletionMetrics.$inferSelect;
export type InsertTaskCompletionMetric = typeof taskCompletionMetrics.$inferInsert;
export type DocumentMetadata = typeof documentMetadata.$inferSelect;
export type InsertDocumentMetadata = typeof documentMetadata.$inferInsert;
export type DocumentAccessLog = typeof documentAccessLog.$inferSelect;
export type InsertDocumentAccessLog = typeof documentAccessLog.$inferInsert;
export type NodeServiceRegistry = typeof nodeServiceRegistry.$inferSelect;
export type InsertNodeServiceRegistry = typeof nodeServiceRegistry.$inferInsert;

/**
 * API Response Interfaces for Pattern Lineage
 */

/**
 * Pattern Summary
 * Overview metrics for pattern discovery and analysis
 */
export interface PatternSummary {
  total_patterns: number;
  languages: number;
  unique_executions: number;
}

/**
 * Recent Pattern
 * Individual pattern record with execution context
 */
export interface RecentPattern {
  pattern_name: string;
  pattern_version: string;
  language: string | null;
  created_at: Date;
  correlation_id: string;
}

/**
 * Language Breakdown
 * Pattern distribution by programming language
 */
export interface LanguageBreakdown {
  language: string;
  pattern_count: number;
}

/**
 * Learned Patterns Table
 * Tracks patterns discovered through PATLEARN system with lifecycle management
 * and rolling metrics for injection success tracking
 */
export const learnedPatterns = pgTable('learned_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  patternSignature: text('pattern_signature').notNull(),
  domainId: varchar('domain_id', { length: 50 }).notNull(),
  domainVersion: varchar('domain_version', { length: 20 }).notNull(),
  domainCandidates: jsonb('domain_candidates').notNull().default([]),
  keywords: text('keywords').array(),
  confidence: numeric('confidence', { precision: 10, scale: 6 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('candidate'),
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  deprecationReason: text('deprecation_reason'),
  sourceSessionIds: uuid('source_session_ids').array().notNull().default([]),
  recurrenceCount: integer('recurrence_count').notNull().default(1),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  distinctDaysSeen: integer('distinct_days_seen').notNull().default(1),
  qualityScore: numeric('quality_score', { precision: 10, scale: 6 }).default('0.5'),
  injectionCountRolling20: integer('injection_count_rolling_20').default(0),
  successCountRolling20: integer('success_count_rolling_20').default(0),
  failureCountRolling20: integer('failure_count_rolling_20').default(0),
  failureStreak: integer('failure_streak').default(0),
  version: integer('version').notNull().default(1),
  isCurrent: boolean('is_current').notNull().default(true),
  supersedes: uuid('supersedes'),
  supersededBy: uuid('superseded_by'),
  compiledSnippet: text('compiled_snippet'),
  compiledTokenCount: integer('compiled_token_count'),
  compiledAt: timestamp('compiled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  signatureHash: text('signature_hash').notNull(),
  projectedAt: timestamp('projected_at').defaultNow(),
});

// Export Zod schema for validation
export const insertLearnedPatternSchema = createInsertSchema(learnedPatterns);

// Export TypeScript types
export type LearnedPattern = typeof learnedPatterns.$inferSelect;
export type InsertLearnedPattern = typeof learnedPatterns.$inferInsert;

/**
 * API Response Interfaces for Learned Patterns
 */

/**
 * Pattern List Item
 * Individual pattern in paginated list response
 */
export interface PatternListItem {
  id: string;
  name: string; // domain_id
  signature: string; // pattern_signature
  status: 'candidate' | 'provisional' | 'validated' | 'deprecated';
  confidence: number;
  quality_score: number;
  usage_count_rolling_20: number;
  success_rate_rolling_20: number | null; // null when sample_size is 0
  sample_size_rolling_20: number;
  created_at: string;
  updated_at: string;
}

/**
 * Paginated Patterns Response
 */
export interface PaginatedPatternsResponse {
  patterns: PatternListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Pattern Extraction Pipeline Tables (OMN-1804 / OMN-1890)
//
// These tables track extraction pipeline observability: injection effectiveness,
// latency breakdowns, and pattern hit rates. They exist in PostgreSQL but are
// currently empty — the pipeline lights up when omniclaude producers start emitting.
// ============================================================================

/**
 * Injection Effectiveness Table
 * Tracks per-session extraction outcomes: utilization scores, agent match quality,
 * and per-stage latency breakdowns for the inject → route → retrieve pipeline.
 */
export const injectionEffectiveness = pgTable(
  'injection_effectiveness',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    cohort: text('cohort').notNull(),
    injectionOccurred: boolean('injection_occurred').notNull().default(false),
    agentName: text('agent_name'),
    detectionMethod: text('detection_method'),
    utilizationScore: numeric('utilization_score', { precision: 10, scale: 6 }),
    utilizationMethod: text('utilization_method'),
    agentMatchScore: numeric('agent_match_score', { precision: 10, scale: 6 }),
    userVisibleLatencyMs: integer('user_visible_latency_ms'),
    sessionOutcome: text('session_outcome'),
    routingTimeMs: integer('routing_time_ms'),
    retrievalTimeMs: integer('retrieval_time_ms'),
    injectionTimeMs: integer('injection_time_ms'),
    patternsCount: integer('patterns_count'),
    cacheHit: boolean('cache_hit').default(false),
    eventType: text('event_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    index('idx_ie_session_id').on(table.sessionId),
    index('idx_ie_created_at').on(table.createdAt),
    index('idx_ie_injection_occurred').on(table.injectionOccurred),
    index('idx_ie_cohort').on(table.cohort),
    uniqueIndex('uq_ie_session_correlation_type').on(
      table.sessionId,
      table.correlationId,
      table.eventType
    ),
  ]
);

export const insertInjectionEffectivenessSchema = createInsertSchema(injectionEffectiveness);
export type InjectionEffectivenessRow = typeof injectionEffectiveness.$inferSelect;
export type InsertInjectionEffectiveness = typeof injectionEffectiveness.$inferInsert;

/**
 * Latency Breakdowns Table
 * Per-prompt latency decomposition across the extraction pipeline stages.
 * Supports percentile queries (P50/P95/P99) via PERCENTILE_CONT in SQL.
 */
export const latencyBreakdowns = pgTable(
  'latency_breakdowns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    promptId: uuid('prompt_id').notNull(),
    routingTimeMs: integer('routing_time_ms'),
    retrievalTimeMs: integer('retrieval_time_ms'),
    injectionTimeMs: integer('injection_time_ms'),
    userVisibleLatencyMs: integer('user_visible_latency_ms'),
    cohort: text('cohort').notNull(),
    cacheHit: boolean('cache_hit').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    index('idx_lb_session_id').on(table.sessionId),
    index('idx_lb_created_at').on(table.createdAt),
    index('idx_lb_cohort').on(table.cohort),
    uniqueIndex('uq_lb_session_prompt_cohort').on(table.sessionId, table.promptId, table.cohort),
  ]
);

export const insertLatencyBreakdownSchema = createInsertSchema(latencyBreakdowns);
export type LatencyBreakdownRow = typeof latencyBreakdowns.$inferSelect;
export type InsertLatencyBreakdown = typeof latencyBreakdowns.$inferInsert;

/**
 * Pattern Hit Rates Table
 * Tracks which patterns were matched/utilized during extraction,
 * with utilization scores and methods for hit-rate analysis.
 */
export const patternHitRates = pgTable(
  'pattern_hit_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    patternId: uuid('pattern_id').notNull(),
    utilizationScore: numeric('utilization_score', { precision: 10, scale: 6 }),
    utilizationMethod: text('utilization_method'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  // DEPLOYMENT: These indexes require `npm run db:push` against the intelligence DB.
  // Drizzle's push will skip indexes that already exist.
  (table) => [
    index('idx_phr_session_id').on(table.sessionId),
    index('idx_phr_pattern_id').on(table.patternId),
    index('idx_phr_created_at').on(table.createdAt),
    uniqueIndex('uq_phr_session_pattern').on(table.sessionId, table.patternId),
  ]
);

export const insertPatternHitRateSchema = createInsertSchema(patternHitRates);
export type PatternHitRateRow = typeof patternHitRates.$inferSelect;
export type InsertPatternHitRate = typeof patternHitRates.$inferInsert;

// ============================================================================
// Cross-Repo Validation Tables (OMN-1907)
//
// These tables live in the omnidash_analytics read-model database.
// To create them, run:
//   npm run db:push
// or apply the SQL migration manually against omnidash_analytics.
// ============================================================================

/**
 * Validation Runs Table
 * Tracks cross-repo validation run lifecycle from started -> completed.
 * Populated by Kafka events consumed from ONEX validation topics.
 */
export const validationRuns = pgTable(
  'validation_runs',
  {
    runId: text('run_id').primaryKey(),
    repos: jsonb('repos').notNull().$type<string[]>(),
    validators: jsonb('validators').notNull().$type<string[]>(),
    triggeredBy: text('triggered_by'),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    totalViolations: integer('total_violations').notNull().default(0),
    violationsBySeverity: jsonb('violations_by_severity')
      .notNull()
      .default({})
      .$type<Record<string, number>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    index('idx_validation_runs_status').on(table.status),
    index('idx_validation_runs_started_at').on(table.startedAt),
    index('idx_validation_runs_repos_gin').using('gin', table.repos),
  ]
);

/**
 * Validation Violations Table
 * Individual violations discovered during a validation run.
 * Linked to a run via run_id. batch_index tracks Kafka batch origin
 * to enable idempotent replay.
 */
export const validationViolations = pgTable(
  'validation_violations',
  {
    id: serial('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => validationRuns.runId, { onDelete: 'cascade' }),
    batchIndex: integer('batch_index').notNull(),
    ruleId: text('rule_id').notNull(),
    severity: text('severity').notNull(),
    message: text('message').notNull(),
    repo: text('repo').notNull(),
    filePath: text('file_path'),
    line: integer('line'),
    validator: text('validator').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    projectedAt: timestamp('projected_at').defaultNow(),
  },
  (table) => [
    index('idx_validation_violations_run_id').on(table.runId),
    index('idx_validation_violations_run_batch').on(table.runId, table.batchIndex),
    index('idx_validation_violations_severity').on(table.severity),
  ]
);

// Export Zod schemas for validation
export const insertValidationRunSchema = createInsertSchema(validationRuns);
export const insertValidationViolationSchema = createInsertSchema(validationViolations);

// Export TypeScript types
export type ValidationRunRow = typeof validationRuns.$inferSelect;
export type InsertValidationRun = typeof validationRuns.$inferInsert;
export type ValidationViolationRow = typeof validationViolations.$inferSelect;
export type InsertValidationViolation = typeof validationViolations.$inferInsert;

// NOTE: Injection Effectiveness tables (OMN-1891) are defined in the
// Pattern Extraction Pipeline section above (OMN-1804) which shares
// injectionEffectiveness, latencyBreakdowns, and patternHitRates.
