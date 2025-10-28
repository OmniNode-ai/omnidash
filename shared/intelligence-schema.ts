import { pgTable, uuid, text, integer, numeric, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
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
  actualSuccess: boolean('actual_success'),
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
  patternId: text('pattern_id').notNull(),
  patternName: text('pattern_name').notNull(),
  patternType: text('pattern_type').notNull(),
  patternVersion: text('pattern_version'),
  lineageId: uuid('lineage_id'),
  generation: integer('generation'),
  sourceSystem: text('source_system'),
  sourceUser: text('source_user'),
  sourceEventId: uuid('source_event_id'),
  patternData: jsonb('pattern_data'),
  metadata: jsonb('metadata'),
  correlationId: uuid('correlation_id'),
  createdAt: timestamp('created_at').defaultNow(),
  eventType: text('event_type'),
  toolName: text('tool_name'),
  filePath: text('file_path'),
  language: text('language'),
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
