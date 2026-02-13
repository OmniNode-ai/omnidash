-- Migration: 0001_omnidash_analytics_read_model
-- Purpose: Create read-model tables for omnidash_analytics database (OMN-2061)
--
-- These tables are projections of events consumed from Kafka.
-- omnidash owns the schema, migrations, and consumers end-to-end.
-- No cross-repo SQL queries -- all data arrives via event-sourced projections.

-- ============================================================================
-- Agent Routing Decisions (read-model projection)
-- Source: Kafka topic agent-routing-decisions
-- ============================================================================
CREATE TABLE IF NOT EXISTS "agent_routing_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "correlation_id" uuid NOT NULL,
  "session_id" uuid,
  "user_request" text NOT NULL,
  "user_request_hash" text,
  "context_snapshot" jsonb,
  "selected_agent" text NOT NULL,
  "confidence_score" numeric(5, 4) NOT NULL,
  "routing_strategy" text NOT NULL,
  "trigger_confidence" numeric(5, 4),
  "context_confidence" numeric(5, 4),
  "capability_confidence" numeric(5, 4),
  "historical_confidence" numeric(5, 4),
  "alternatives" jsonb,
  "reasoning" text,
  "routing_time_ms" integer NOT NULL,
  "cache_hit" boolean DEFAULT false,
  "selection_validated" boolean DEFAULT false,
  "execution_succeeded" boolean,
  "actual_quality_score" numeric(5, 4),
  "created_at" timestamp DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ard_selected_agent" ON "agent_routing_decisions" ("selected_agent");
CREATE INDEX IF NOT EXISTS "idx_ard_created_at" ON "agent_routing_decisions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_ard_correlation_id" ON "agent_routing_decisions" ("correlation_id");

-- ============================================================================
-- Agent Actions (read-model projection)
-- Source: Kafka topic agent-actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS "agent_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "correlation_id" uuid NOT NULL,
  "agent_name" text NOT NULL,
  "action_type" text NOT NULL,
  "action_name" text NOT NULL,
  "action_details" jsonb DEFAULT '{}',
  "debug_mode" boolean DEFAULT true,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_aa_agent_name" ON "agent_actions" ("agent_name");
CREATE INDEX IF NOT EXISTS "idx_aa_created_at" ON "agent_actions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_aa_correlation_id" ON "agent_actions" ("correlation_id");

-- ============================================================================
-- Agent Transformation Events (read-model projection)
-- Source: Kafka topic agent-transformation-events
-- ============================================================================
CREATE TABLE IF NOT EXISTS "agent_transformation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_agent" text NOT NULL,
  "target_agent" text NOT NULL,
  "transformation_reason" text,
  "confidence_score" numeric(5, 4),
  "transformation_duration_ms" integer,
  "success" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "project_path" text,
  "project_name" text,
  "claude_session_id" text,
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ate_created_at" ON "agent_transformation_events" ("created_at");

-- ============================================================================
-- Agent Manifest Injections (read-model projection)
-- Source: Kafka events from intelligence system
-- ============================================================================
CREATE TABLE IF NOT EXISTS "agent_manifest_injections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "correlation_id" uuid NOT NULL,
  "routing_decision_id" uuid,
  "agent_name" text NOT NULL,
  "manifest_version" text NOT NULL,
  "generation_source" text NOT NULL,
  "is_fallback" boolean DEFAULT false,
  "patterns_count" integer DEFAULT 0,
  "infrastructure_services" integer DEFAULT 0,
  "debug_intelligence_successes" integer DEFAULT 0,
  "debug_intelligence_failures" integer DEFAULT 0,
  "query_times" jsonb NOT NULL,
  "total_query_time_ms" integer NOT NULL,
  "full_manifest_snapshot" jsonb NOT NULL,
  "agent_execution_success" boolean,
  "agent_execution_time_ms" integer,
  "agent_quality_score" numeric(5, 4),
  "created_at" timestamp DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ami_created_at" ON "agent_manifest_injections" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_ami_agent_name" ON "agent_manifest_injections" ("agent_name");

-- ============================================================================
-- Pattern Lineage Nodes (read-model projection)
-- Source: pattern discovery events
-- ============================================================================
CREATE TABLE IF NOT EXISTS "pattern_lineage_nodes" (
  "id" uuid PRIMARY KEY,
  "pattern_id" varchar(255) NOT NULL,
  "pattern_name" varchar(255) NOT NULL,
  "pattern_type" varchar(100) NOT NULL,
  "pattern_version" varchar(50) NOT NULL,
  "lineage_id" uuid NOT NULL,
  "generation" integer NOT NULL,
  "pattern_data" jsonb NOT NULL,
  "metadata" jsonb,
  "correlation_id" uuid NOT NULL,
  "created_at" timestamp with time zone,
  "language" varchar(50),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_pln_created_at" ON "pattern_lineage_nodes" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_pln_language" ON "pattern_lineage_nodes" ("language");

-- ============================================================================
-- Pattern Lineage Edges (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "pattern_lineage_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_node_id" uuid NOT NULL,
  "target_node_id" uuid NOT NULL,
  "edge_type" text NOT NULL,
  "edge_weight" numeric(10, 6),
  "transformation_type" text,
  "metadata" jsonb,
  "correlation_id" uuid,
  "created_at" timestamp DEFAULT now(),
  "created_by" text,
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ple_source" ON "pattern_lineage_edges" ("source_node_id");
CREATE INDEX IF NOT EXISTS "idx_ple_target" ON "pattern_lineage_edges" ("target_node_id");

-- ============================================================================
-- Pattern Quality Metrics (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "pattern_quality_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pattern_id" uuid NOT NULL UNIQUE,
  "quality_score" numeric(10, 6) NOT NULL,
  "confidence" numeric(10, 6) NOT NULL,
  "measurement_timestamp" timestamp with time zone NOT NULL DEFAULT now(),
  "version" text DEFAULT '1.0.0',
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Pattern Learning Artifacts (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "pattern_learning_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pattern_id" uuid NOT NULL,
  "pattern_name" varchar(255) NOT NULL,
  "pattern_type" varchar(100) NOT NULL,
  "language" varchar(50),
  "lifecycle_state" text NOT NULL DEFAULT 'candidate',
  "state_changed_at" timestamp with time zone,
  "composite_score" numeric(10, 6) NOT NULL,
  "scoring_evidence" jsonb NOT NULL,
  "signature" jsonb NOT NULL,
  "metrics" jsonb DEFAULT '{}',
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_patlearn_lifecycle_state" ON "pattern_learning_artifacts" ("lifecycle_state");
CREATE INDEX IF NOT EXISTS "idx_patlearn_composite_score" ON "pattern_learning_artifacts" ("composite_score");
CREATE INDEX IF NOT EXISTS "idx_patlearn_state_changed_at" ON "pattern_learning_artifacts" ("state_changed_at");
CREATE INDEX IF NOT EXISTS "idx_patlearn_created_at" ON "pattern_learning_artifacts" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_patlearn_updated_at" ON "pattern_learning_artifacts" ("updated_at");
CREATE INDEX IF NOT EXISTS "idx_patlearn_lifecycle_score" ON "pattern_learning_artifacts" ("lifecycle_state", "composite_score");

-- ============================================================================
-- ONEX Compliance Stamps (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "onex_compliance_stamps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_path" text NOT NULL,
  "compliance_status" text NOT NULL,
  "compliance_score" numeric(5, 4),
  "node_type" text,
  "violations" jsonb DEFAULT '[]',
  "metadata" jsonb DEFAULT '{}',
  "correlation_id" uuid,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Document Metadata (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "document_metadata" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "repository" text NOT NULL,
  "file_path" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "content_hash" text,
  "size_bytes" integer,
  "mime_type" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "deleted_at" timestamp,
  "access_count" integer NOT NULL DEFAULT 0,
  "last_accessed_at" timestamp,
  "vector_id" text,
  "graph_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Document Access Log (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "document_access_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL,
  "accessed_at" timestamp DEFAULT now(),
  "access_type" text NOT NULL,
  "correlation_id" uuid,
  "session_id" uuid,
  "query_text" text,
  "relevance_score" numeric(10, 6),
  "response_time_ms" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Node Service Registry (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "node_service_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "service_name" text NOT NULL UNIQUE,
  "service_url" text NOT NULL,
  "service_type" text,
  "health_status" text NOT NULL DEFAULT 'unknown',
  "last_health_check" timestamp,
  "health_check_interval_seconds" integer DEFAULT 60,
  "metadata" jsonb DEFAULT '{}',
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Task Completion Metrics (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "task_completion_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamp DEFAULT now(),
  "correlation_id" uuid,
  "task_type" text,
  "task_description" text,
  "completion_time_ms" integer NOT NULL,
  "success" boolean DEFAULT true,
  "agent_name" text,
  "metadata" jsonb DEFAULT '{}',
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Learned Patterns (read-model projection)
-- Source: PATLEARN system events
-- ============================================================================
CREATE TABLE IF NOT EXISTS "learned_patterns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pattern_signature" text NOT NULL,
  "domain_id" varchar(50) NOT NULL,
  "domain_version" varchar(20) NOT NULL,
  "domain_candidates" jsonb NOT NULL DEFAULT '[]',
  "keywords" text[],
  "confidence" numeric(10, 6) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'candidate',
  "promoted_at" timestamp with time zone,
  "deprecated_at" timestamp with time zone,
  "deprecation_reason" text,
  "source_session_ids" uuid[] NOT NULL DEFAULT '{}',
  "recurrence_count" integer NOT NULL DEFAULT 1,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "distinct_days_seen" integer NOT NULL DEFAULT 1,
  "quality_score" numeric(10, 6) DEFAULT '0.5',
  "injection_count_rolling_20" integer DEFAULT 0,
  "success_count_rolling_20" integer DEFAULT 0,
  "failure_count_rolling_20" integer DEFAULT 0,
  "failure_streak" integer DEFAULT 0,
  "version" integer NOT NULL DEFAULT 1,
  "is_current" boolean NOT NULL DEFAULT true,
  "supersedes" uuid,
  "superseded_by" uuid,
  "compiled_snippet" text,
  "compiled_token_count" integer,
  "compiled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "signature_hash" text NOT NULL,
  "projected_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Injection Effectiveness (read-model projection)
-- Source: extraction pipeline events
-- ============================================================================
CREATE TABLE IF NOT EXISTS "injection_effectiveness" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "correlation_id" uuid NOT NULL,
  "cohort" text NOT NULL,
  "injection_occurred" boolean NOT NULL DEFAULT false,
  "agent_name" text,
  "detection_method" text,
  "utilization_score" numeric(10, 6),
  "utilization_method" text,
  "agent_match_score" numeric(10, 6),
  "user_visible_latency_ms" integer,
  "session_outcome" text,
  "routing_time_ms" integer,
  "retrieval_time_ms" integer,
  "injection_time_ms" integer,
  "patterns_count" integer,
  "cache_hit" boolean DEFAULT false,
  "event_type" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ie_session_id" ON "injection_effectiveness" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_ie_created_at" ON "injection_effectiveness" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_ie_injection_occurred" ON "injection_effectiveness" ("injection_occurred");
CREATE INDEX IF NOT EXISTS "idx_ie_cohort" ON "injection_effectiveness" ("cohort");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ie_session_correlation_type" ON "injection_effectiveness" ("session_id", "correlation_id", "event_type");

-- ============================================================================
-- Latency Breakdowns (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "latency_breakdowns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "prompt_id" uuid NOT NULL,
  "routing_time_ms" integer,
  "retrieval_time_ms" integer,
  "injection_time_ms" integer,
  "user_visible_latency_ms" integer,
  "cohort" text NOT NULL,
  "cache_hit" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_lb_session_id" ON "latency_breakdowns" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_lb_created_at" ON "latency_breakdowns" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_lb_cohort" ON "latency_breakdowns" ("cohort");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_lb_session_prompt_cohort" ON "latency_breakdowns" ("session_id", "prompt_id", "cohort");

-- ============================================================================
-- Pattern Hit Rates (read-model projection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "pattern_hit_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "pattern_id" uuid NOT NULL,
  "utilization_score" numeric(10, 6),
  "utilization_method" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_phr_session_id" ON "pattern_hit_rates" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_phr_pattern_id" ON "pattern_hit_rates" ("pattern_id");
CREATE INDEX IF NOT EXISTS "idx_phr_created_at" ON "pattern_hit_rates" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_phr_session_pattern" ON "pattern_hit_rates" ("session_id", "pattern_id");

-- ============================================================================
-- Projection Watermarks (tracks consumer progress)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "projection_watermarks" (
  "projection_name" text PRIMARY KEY,
  "last_offset" bigint NOT NULL DEFAULT 0,
  "last_event_id" uuid,
  "last_projected_at" timestamp DEFAULT now(),
  "events_projected" bigint NOT NULL DEFAULT 0,
  "errors_count" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamp DEFAULT now()
);

-- ============================================================================
-- Validation tables (read-model projection)
-- Source: ONEX validation run events
-- ============================================================================
CREATE TABLE IF NOT EXISTS "validation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'running',
  "scope" text,
  "started_at" timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone,
  "total_files" integer DEFAULT 0,
  "violations_count" integer DEFAULT 0,
  "clean_count" integer DEFAULT 0,
  "error_count" integer DEFAULT 0,
  "metadata" jsonb DEFAULT '{}',
  "projected_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "validation_violations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" text NOT NULL,
  "file_path" text NOT NULL,
  "rule_id" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'warning',
  "message" text NOT NULL,
  "line" integer,
  "column" integer,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now(),
  "projected_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_vv_run_id" ON "validation_violations" ("run_id");
CREATE INDEX IF NOT EXISTS "idx_vv_severity" ON "validation_violations" ("severity");
