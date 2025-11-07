-- Add indexes for alert system performance optimization
-- These indexes dramatically improve time-based queries for alert metrics
-- Created: 2025-11-06

-- Index on agent_actions.created_at for error rate calculations
-- Speeds up queries filtering by time window (e.g., last 10 minutes)
CREATE INDEX IF NOT EXISTS idx_agent_actions_created_at
ON agent_actions(created_at DESC);

-- Composite index for error rate queries (created_at + action_type)
-- Optimizes COUNT(*) FILTER (WHERE action_type = 'error') queries
CREATE INDEX IF NOT EXISTS idx_agent_actions_created_at_action_type
ON agent_actions(created_at DESC, action_type);

-- Index on agent_manifest_injections.created_at for injection success rate
-- Speeds up queries filtering by time window (e.g., last hour)
CREATE INDEX IF NOT EXISTS idx_agent_manifest_injections_created_at
ON agent_manifest_injections(created_at DESC);

-- Composite index for injection success queries
-- Optimizes COUNT(*) FILTER (WHERE agent_execution_success = TRUE) queries
CREATE INDEX IF NOT EXISTS idx_agent_manifest_injections_created_at_success
ON agent_manifest_injections(created_at DESC, agent_execution_success);

-- Index on agent_routing_decisions.created_at for response time and success rate
-- Speeds up queries for avg response time and success rate calculations
CREATE INDEX IF NOT EXISTS idx_agent_routing_decisions_created_at
ON agent_routing_decisions(created_at DESC);

-- Composite index for success rate queries
-- Optimizes COUNT(*) FILTER (WHERE execution_succeeded = TRUE) queries
CREATE INDEX IF NOT EXISTS idx_agent_routing_decisions_created_at_success
ON agent_routing_decisions(created_at DESC, execution_succeeded);

-- Composite index for routing time queries
-- Optimizes AVG(routing_time_ms) queries with time filters
CREATE INDEX IF NOT EXISTS idx_agent_routing_decisions_created_at_routing_time
ON agent_routing_decisions(created_at DESC, routing_time_ms);

-- Verify indexes were created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('agent_actions', 'agent_manifest_injections', 'agent_routing_decisions')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
