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

// Export TypeScript types
export type AgentRoutingDecision = typeof agentRoutingDecisions.$inferSelect;
export type InsertAgentRoutingDecision = typeof agentRoutingDecisions.$inferInsert;
export type AgentAction = typeof agentActions.$inferSelect;
export type InsertAgentAction = typeof agentActions.$inferInsert;
