import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

/**
 * Agent Routing Decisions Table
 * Tracks all routing decisions made by the polymorphic agent system
 * with confidence scoring and performance metrics
 */
export const agentRoutingDecisions = pgTable('agent_routing_decisions', {
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
});

/**
 * Agent Actions Table
 * Tracks all actions executed by agents for observability
 * and debugging purposes
 */
export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(),
  actionName: text('action_name').notNull(),
  actionDetails: jsonb('action_details').default({}),
  debugMode: boolean('debug_mode').default(true),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertAgentRoutingDecisionSchema = createInsertSchema(agentRoutingDecisions);
export const insertAgentActionSchema = createInsertSchema(agentActions);

/**
 * Agent Transformation Events Table
 * Tracks polymorphic agent transformations between roles
 */
export const agentTransformationEvents = pgTable('agent_transformation_events', {
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
});

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
});

export const insertPatternQualityMetricsSchema = createInsertSchema(patternQualityMetrics);

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
 * Contracts Table
 * Tracks ONEX contract definitions with lifecycle management
 * Supports the Contract Builder UI for creating, validating, and publishing contracts
 */
export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: text('contract_id').notNull(), // Logical ID (e.g., 'user-auth-orchestrator')
  name: text('name').notNull(), // Machine-readable name
  displayName: text('display_name').notNull(), // Human-readable name
  type: text('type').notNull(), // 'orchestrator' | 'effect' | 'reducer' | 'compute'
  status: text('status').notNull().default('draft'), // 'draft' | 'validated' | 'published' | 'deprecated' | 'archived'
  version: text('version').notNull().default('0.1.0'), // Semantic version
  description: text('description'),
  schema: jsonb('schema').default({}), // JSON Schema definition for the contract
  metadata: jsonb('metadata').default({}), // Additional metadata (tags, dependencies, etc.)
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Contract Audit Log Table
 * Tracks all lifecycle transitions for provenance and compliance
 */
export const contractAuditLog = pgTable('contract_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull(), // FK to contracts.id
  action: text('action').notNull(), // 'created' | 'validated' | 'published' | 'deprecated' | 'archived' | 'updated'
  fromStatus: text('from_status'), // Previous status (null for 'created')
  toStatus: text('to_status').notNull(), // New status
  fromVersion: text('from_version'), // Previous version (for version bumps)
  toVersion: text('to_version'), // New version
  actor: text('actor'), // User/system that performed the action
  reason: text('reason'), // Optional reason for the transition
  evidence: jsonb('evidence').default([]), // Links to evidence (PRs, tickets, etc.)
  contentHash: text('content_hash'), // Hash of contract content at time of action
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

// Export Zod schemas for validation
export const insertContractSchema = createInsertSchema(contracts);
export const insertContractAuditLogSchema = createInsertSchema(contractAuditLog);

// Export TypeScript types
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;
export type ContractAuditLog = typeof contractAuditLog.$inferSelect;
export type InsertContractAuditLog = typeof contractAuditLog.$inferInsert;

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
