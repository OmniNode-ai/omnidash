# Omnidash Dashboard → OmniClaude Data Mapping

**Purpose**: Exact mapping of each omnidash dashboard to specific OmniClaude data sources
**Date**: 2025-11-03

---

## Quick Reference Table

| Dashboard | Primary Tables | Kafka Topics | Views | Status |
|-----------|---------------|--------------|-------|--------|
| Agent Operations | `agent_routing_decisions`, `agent_actions` | `agent-routing-decisions`, `agent-actions` | `v_agent_execution_trace` | ✅ Ready |
| Pattern Learning | `agent_intelligence_usage`, `agent_manifest_injections` | N/A | `v_intelligence_effectiveness` | ✅ Ready |
| Intelligence Operations | `agent_manifest_injections`, `agent_prompts` | N/A | `v_manifest_injection_performance` | ✅ Ready |
| Code Intelligence | `agent_file_operations`, `agent_intelligence_usage` | N/A | `v_file_operation_history` | ✅ Ready |
| Event Flow | `agent_actions`, `v_agent_execution_trace` | `agent-actions`, `agent-routing-decisions` | `v_agent_execution_trace` | ⚠️ Partial |
| Knowledge Graph | `agent_intelligence_usage` | N/A | `v_intelligence_effectiveness` | ⚠️ External (Memgraph) |
| Platform Health | `agent_routing_decisions`, `router_performance_metrics` | `router-performance-metrics` | `v_routing_decision_accuracy` | ✅ Ready |
| Developer Experience | `agent_routing_decisions`, `agent_manifest_injections` | N/A | `v_agent_execution_trace` | ✅ Derivable |
| Chat | `agent_prompts` | N/A | N/A | ⚠️ New Feature |

---

## Dashboard 1: Agent Operations (`/`)

**Current Mock Data**:
- 52 AI agents monitoring
- Agent status (active/idle/error)
- Actions per agent
- Success rates
- Response times

### Data Sources

**Primary Table**: `agent_routing_decisions`
```sql
-- Agent selection frequency (last 24h)
SELECT
    selected_agent,
    COUNT(*) as times_selected,
    AVG(confidence_score) as avg_confidence,
    AVG(routing_time_ms) as avg_routing_time,
    COUNT(*) FILTER (WHERE actual_success = true) as successes,
    COUNT(*) FILTER (WHERE actual_success = false) as failures
FROM agent_routing_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY selected_agent
ORDER BY times_selected DESC;
```

**Secondary Table**: `agent_actions`
```sql
-- Agent activity metrics
SELECT
    agent_name,
    COUNT(*) as total_actions,
    COUNT(DISTINCT correlation_id) as unique_executions,
    AVG(duration_ms) as avg_action_duration,
    COUNT(*) FILTER (WHERE action_type = 'success') as success_count,
    COUNT(*) FILTER (WHERE action_type = 'error') as error_count,
    MAX(created_at) as last_activity
FROM agent_actions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name;
```

**Kafka Topics**:
- `agent-routing-decisions` - Real-time agent selection events
- `agent-actions` - Real-time tool call events

### API Endpoints to Create

```typescript
// GET /api/intelligence/agents/summary
interface AgentSummary {
  agentName: string;
  timesSelected: number;
  avgConfidence: number;
  avgRoutingTime: number;
  totalActions: number;
  successRate: number;
  lastActivity: Date;
  status: 'active' | 'idle' | 'error'; // Derived: <5min=active, <1h=idle, errors=error
}

// GET /api/intelligence/agents/:name/details
interface AgentDetails {
  agentName: string;
  recentExecutions: Array<{
    correlationId: string;
    userRequest: string;
    confidenceScore: number;
    success: boolean;
    timestamp: Date;
  }>;
  performanceMetrics: {
    avgRoutingTime: number;
    p95RoutingTime: number;
    avgConfidence: number;
    successRate: number;
  };
  topActions: Array<{
    actionName: string;
    count: number;
    avgDuration: number;
  }>;
}

// GET /api/intelligence/routing/live-stats
interface LiveStats {
  totalDecisions24h: number;
  avgConfidence: number;
  avgRoutingTime: number;
  decisionsLastHour: number;
  topAgents: string[];
}
```

### Component Updates

**Replace**:
```typescript
// OLD: Mock data
const agentData = useMemo(() => generateMockAgents(52), []);

// NEW: Real data
const { data: agentData } = useQuery({
  queryKey: ['agents', 'summary'],
  queryFn: () => fetch('/api/intelligence/agents/summary').then(r => r.json()),
  refetchInterval: 5000,
});
```

---

## Dashboard 2: Pattern Learning (`/patterns`)

**Current Mock Data**:
- 25,000+ code patterns
- Pattern usage frequency
- Confidence scores
- Application success rates

### Data Sources

**Primary Table**: `agent_intelligence_usage`
```sql
-- Top patterns by usage
SELECT
    intelligence_name,
    collection_name,
    intelligence_type,
    COUNT(*) as times_retrieved,
    SUM(CASE WHEN was_applied THEN 1 ELSE 0 END) as times_applied,
    AVG(confidence_score) as avg_confidence,
    AVG(quality_impact) FILTER (WHERE was_applied) as avg_quality_impact,
    (SUM(CASE WHEN was_applied THEN 1 ELSE 0 END)::float /
     NULLIF(COUNT(*), 0) * 100) as application_rate,
    array_agg(DISTINCT agent_name) as agents_using
FROM agent_intelligence_usage
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY intelligence_name, collection_name, intelligence_type
HAVING COUNT(*) > 1
ORDER BY times_applied DESC, avg_quality_impact DESC NULLS LAST
LIMIT 100;
```

**Secondary Table**: `agent_manifest_injections`
```sql
-- Pattern discovery trends
SELECT
    DATE_TRUNC('day', created_at) as day,
    AVG(patterns_count) as avg_patterns_per_injection,
    SUM(patterns_count) as total_patterns_discovered,
    AVG(debug_intelligence_successes) as avg_success_patterns,
    AVG(debug_intelligence_failures) as avg_failure_patterns,
    COUNT(*) as total_injections
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

**Views**: `v_intelligence_effectiveness`

### API Endpoints to Create

```typescript
// GET /api/intelligence/patterns/top-used
interface TopPattern {
  patternName: string;
  collectionName: string;
  timesRetrieved: number;
  timesApplied: number;
  applicationRate: number;
  avgConfidence: number;
  avgQualityImpact: number;
  agentsUsing: string[];
}

// GET /api/intelligence/patterns/trending
interface TrendingPattern {
  patternName: string;
  recentUsage: number; // Last 7 days
  growthRate: number; // vs previous 7 days
  avgQualityImpact: number;
}

// GET /api/intelligence/patterns/discovery-timeline
interface DiscoveryTimeline {
  timestamp: Date;
  patternsDiscovered: number;
  avgConfidence: number;
  injectionCount: number;
}
```

---

## Dashboard 3: Intelligence Operations (`/intelligence`)

**Current Mock Data**:
- 168+ AI operations
- Query performance
- Cache hit rates
- Intelligence source breakdown

### Data Sources

**Primary Table**: `agent_manifest_injections`
```sql
-- Manifest injection performance
SELECT
    agent_name,
    generation_source,
    COUNT(*) as total_injections,
    AVG(total_query_time_ms) as avg_query_time,
    AVG(patterns_count) as avg_patterns,
    AVG(debug_intelligence_successes + debug_intelligence_failures) as avg_debug_intel,
    COUNT(CASE WHEN is_fallback THEN 1 END) as fallback_count,
    COUNT(CASE WHEN cache_hit THEN 1 END) as cache_hits,
    AVG(agent_quality_score) as avg_quality,
    COUNT(CASE WHEN agent_execution_success THEN 1 END) as successes
FROM agent_manifest_injections
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name, generation_source
ORDER BY total_injections DESC;
```

**Secondary Table**: `agent_prompts`
```sql
-- Prompt and instruction statistics
SELECT
    agent_name,
    COUNT(*) as total_prompts,
    AVG(user_prompt_length) as avg_prompt_length,
    AVG(agent_instructions_length) as avg_instruction_length,
    COUNT(DISTINCT manifest_injection_id) as unique_manifests,
    array_agg(DISTINCT unnest(manifest_sections_included)) as sections_used
FROM agent_prompts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name;
```

**Views**: `v_manifest_injection_performance`

### API Endpoints to Create

```typescript
// GET /api/intelligence/manifests/performance
interface ManifestPerformance {
  agentName: string;
  totalInjections: number;
  avgQueryTime: number;
  avgPatternsCount: number;
  fallbackRate: number;
  cacheHitRate: number;
  avgQuality: number;
  successRate: number;
}

// GET /api/intelligence/operations/breakdown
interface OperationsBreakdown {
  totalOperations: number;
  bySource: {
    'archon-intelligence': number;
    'fallback': number;
  };
  bySection: {
    'patterns': number;
    'infrastructure': number;
    'models': number;
    'schemas': number;
    'debug_intelligence': number;
  };
  performanceMetrics: {
    avgQueryTime: number;
    p95QueryTime: number;
    cacheHitRate: number;
  };
}
```

---

## Dashboard 4: Code Intelligence (`/code`)

**Current Mock Data**:
- Semantic search results
- Quality gates status
- Code analysis metrics

### Data Sources

**Primary Table**: `agent_file_operations`
```sql
-- File operation statistics
SELECT
    file_extension,
    COUNT(*) as total_operations,
    COUNT(DISTINCT file_path_hash) as unique_files,
    SUM(CASE WHEN operation_type = 'read' THEN 1 ELSE 0 END) as reads,
    SUM(CASE WHEN operation_type = 'write' THEN 1 ELSE 0 END) as writes,
    SUM(CASE WHEN operation_type = 'edit' THEN 1 ELSE 0 END) as edits,
    SUM(CASE WHEN content_changed THEN 1 ELSE 0 END) as changes,
    AVG(duration_ms) as avg_duration,
    SUM(bytes_written) as total_bytes_written
FROM agent_file_operations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY file_extension
ORDER BY total_operations DESC;
```

```sql
-- Most modified files
SELECT
    file_path,
    file_name,
    file_extension,
    COUNT(*) as operation_count,
    COUNT(DISTINCT agent_name) as agents_touched,
    MIN(created_at) as first_operation,
    MAX(created_at) as last_operation,
    SUM(CASE WHEN content_changed THEN 1 ELSE 0 END) as change_count,
    array_agg(DISTINCT content_hash_after ORDER BY content_hash_after)
        FILTER (WHERE content_hash_after IS NOT NULL) as content_versions
FROM agent_file_operations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY file_path, file_name, file_extension
ORDER BY change_count DESC
LIMIT 50;
```

**Secondary Table**: `agent_intelligence_usage`
```sql
-- Pattern application to files
SELECT
    aiu.intelligence_name,
    COUNT(DISTINCT afo.file_path_hash) as files_affected,
    COUNT(*) as applications,
    AVG(aiu.quality_impact) as avg_impact
FROM agent_intelligence_usage aiu
JOIN LATERAL unnest(aiu.file_operations_using_this) AS fo_id ON true
JOIN agent_file_operations afo ON afo.id = fo_id
WHERE aiu.was_applied = true
  AND aiu.created_at > NOW() - INTERVAL '7 days'
GROUP BY aiu.intelligence_name
ORDER BY files_affected DESC;
```

**Views**: `v_file_operation_history`

### API Endpoints to Create

```typescript
// GET /api/intelligence/files/statistics
interface FileStatistics {
  fileExtension: string;
  totalOperations: number;
  uniqueFiles: number;
  reads: number;
  writes: number;
  edits: number;
  changes: number;
  avgDuration: number;
}

// GET /api/intelligence/files/most-modified
interface MostModifiedFile {
  filePath: string;
  fileName: string;
  operationCount: number;
  agentsTouched: string[];
  changeCount: number;
  firstOperation: Date;
  lastOperation: Date;
  contentVersions: string[]; // SHA-256 hashes
}

// GET /api/intelligence/files/semantic-search
// Note: This requires Qdrant integration (not in PostgreSQL)
// Alternative: Use file operation patterns as proxy
```

---

## Dashboard 5: Event Flow (`/events`)

**Current Mock Data**:
- Kafka event processing
- Consumer lag
- Event timeline

### Data Sources

**Primary View**: `v_agent_execution_trace`
```sql
-- Complete execution traces (workflow visualization)
SELECT
    correlation_id,
    user_request,
    selected_agent,
    confidence_score,
    routing_time_ms,
    patterns_count,
    total_query_time_ms,
    agent_execution_success,
    routing_time,
    manifest_time,
    execution_start_time,
    execution_end_time,
    EXTRACT(EPOCH FROM (execution_end_time - routing_time)) * 1000 as total_duration_ms
FROM v_agent_execution_trace
WHERE routing_time > NOW() - INTERVAL '24 hours'
ORDER BY routing_time DESC
LIMIT 100;
```

**Trace Detail Function**:
```sql
-- Get complete trace by correlation_id
SELECT * FROM get_complete_trace('correlation-id-here');
-- Returns: prompt, routing, manifest, actions, intelligence usage
```

**Secondary Table**: `agent_actions`
```sql
-- Action timeline for specific correlation
SELECT
    action_type,
    action_name,
    action_details,
    duration_ms,
    created_at
FROM agent_actions
WHERE correlation_id = 'correlation-id-here'
ORDER BY created_at;
```

**Kafka Topics** (for real-time):
- `agent-actions` - Real-time action stream
- `agent-routing-decisions` - Real-time routing stream
- `router-performance-metrics` - Performance events

### API Endpoints to Create

```typescript
// GET /api/intelligence/traces/recent
interface ExecutionTrace {
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  steps: Array<{
    type: 'routing' | 'manifest' | 'action' | 'completion';
    timestamp: Date;
    durationMs: number;
    details: any;
  }>;
  totalDurationMs: number;
  success: boolean;
}

// GET /api/intelligence/traces/:correlationId
interface DetailedTrace {
  correlationId: string;
  prompt: {
    userPrompt: string;
    agentInstructions: string;
    systemContext: any;
  };
  routing: {
    selectedAgent: string;
    confidenceScore: number;
    alternatives: any[];
    routingTimeMs: number;
  };
  manifest: {
    patternsCount: number;
    sections: string[];
    queryTimeMs: number;
  };
  actions: Array<{
    actionType: string;
    actionName: string;
    durationMs: number;
    timestamp: Date;
  }>;
  intelligenceUsed: Array<{
    patternName: string;
    wasApplied: boolean;
    qualityImpact: number;
  }>;
  outcome: {
    success: boolean;
    qualityScore: number;
    totalDurationMs: number;
  };
}

// GET /api/intelligence/events/stream (SSE or WebSocket)
// Real-time event stream from Kafka
```

---

## Dashboard 6: Knowledge Graph (`/knowledge`)

**Current Mock Data**:
- Code relationship visualization
- Dependency graphs
- Pattern relationships

### Data Sources

**Primary Table**: `agent_intelligence_usage`
```sql
-- Pattern relationship graph (co-occurrence)
WITH pattern_pairs AS (
  SELECT
    a.intelligence_name as pattern_a,
    b.intelligence_name as pattern_b,
    COUNT(*) as co_occurrences
  FROM agent_intelligence_usage a
  JOIN agent_intelligence_usage b
    ON a.correlation_id = b.correlation_id
    AND a.intelligence_name < b.intelligence_name
  WHERE a.was_applied = true
    AND b.was_applied = true
    AND a.created_at > NOW() - INTERVAL '30 days'
  GROUP BY a.intelligence_name, b.intelligence_name
  HAVING COUNT(*) > 1
)
SELECT * FROM pattern_pairs
ORDER BY co_occurrences DESC
LIMIT 100;
```

**External Source**: Memgraph (graph database)
- **Connection**: `bolt://localhost:7687`
- **Purpose**: Code relationship graphs, dependency tracking
- **Integration**: Requires Memgraph connector library

**Views**: `v_intelligence_effectiveness`

### API Endpoints to Create

```typescript
// GET /api/intelligence/knowledge/pattern-relationships
interface PatternRelationship {
  patternA: string;
  patternB: string;
  coOccurrences: number;
  strength: number; // 0-1 normalized
}

// GET /api/intelligence/knowledge/agent-patterns
// Which agents use which patterns
interface AgentPatternMap {
  agentName: string;
  patterns: Array<{
    patternName: string;
    usageCount: number;
    successRate: number;
  }>;
}

// GET /api/intelligence/knowledge/graph
// Full graph data for D3.js visualization
interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    type: 'agent' | 'pattern' | 'file';
    label: string;
    properties: any;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'uses' | 'produces' | 'relates_to';
    weight: number;
  }>;
}
```

**Note**: For full knowledge graph, consider creating a GraphQL endpoint or using Memgraph directly.

---

## Dashboard 7: Platform Health (`/health`)

**Current Mock Data**:
- System health monitoring
- Service status
- Error tracking
- Uptime metrics

### Data Sources

**Primary Query**: Derive health score from routing metrics
```sql
-- System health score calculation
WITH metrics AS (
  SELECT
    COUNT(*) as total_decisions,
    AVG(routing_time_ms) as avg_routing_time,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE actual_success = true) as successes,
    COUNT(*) FILTER (WHERE actual_success IS NOT NULL) as validated
  FROM agent_routing_decisions
  WHERE created_at > NOW() - INTERVAL '1 hour'
)
SELECT
  -- Routing performance (40% weight)
  (CASE
    WHEN avg_routing_time < 100 THEN 40
    WHEN avg_routing_time < 500 THEN 30
    ELSE 20
  END) +

  -- Confidence score (30% weight)
  (avg_confidence * 30) +

  -- Success rate (30% weight)
  (COALESCE(successes::float / NULLIF(validated, 0), 0) * 30)

  as health_score,
  *
FROM metrics;
```

**Error Tracking**:
```sql
-- Recent errors
SELECT
    agent_name,
    action_name,
    action_details->>'error' as error_message,
    COUNT(*) as error_count,
    MAX(created_at) as last_error
FROM agent_actions
WHERE action_type = 'error'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_name, action_name, action_details->>'error'
ORDER BY error_count DESC
LIMIT 20;
```

**Performance Degradation**:
```sql
-- Detect performance degradation
WITH hourly_metrics AS (
  SELECT
    DATE_TRUNC('hour', created_at) as hour,
    AVG(routing_time_ms) as avg_routing_time,
    AVG(confidence_score) as avg_confidence
  FROM agent_routing_decisions
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour
)
SELECT
  hour,
  avg_routing_time,
  avg_confidence,
  LAG(avg_routing_time) OVER (ORDER BY hour) as prev_routing_time,
  ((avg_routing_time - LAG(avg_routing_time) OVER (ORDER BY hour)) /
   NULLIF(LAG(avg_routing_time) OVER (ORDER BY hour), 0) * 100) as routing_time_change_pct
FROM hourly_metrics
ORDER BY hour DESC;
```

**Views**: `v_routing_decision_accuracy`

### API Endpoints to Create

```typescript
// GET /api/intelligence/health/score
interface HealthScore {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  components: {
    routingPerformance: number;
    confidenceScore: number;
    successRate: number;
  };
  metrics: {
    avgRoutingTime: number;
    avgConfidence: number;
    totalDecisions: number;
    successCount: number;
  };
}

// GET /api/intelligence/health/errors
interface ErrorSummary {
  agentName: string;
  errorType: string;
  errorCount: number;
  lastOccurrence: Date;
  sampleMessage: string;
}

// GET /api/intelligence/health/trends
interface HealthTrend {
  timestamp: Date;
  healthScore: number;
  avgRoutingTime: number;
  avgConfidence: number;
  changeFromPrevious: number; // Percentage change
}
```

---

## Dashboard 8: Developer Experience (`/developer`)

**Current Mock Data**:
- Workflow metrics
- Time saved
- Automation stats
- Developer productivity

### Data Sources

**Derivable from Existing Tables**:

```sql
-- Workflow efficiency metrics
SELECT
    DATE_TRUNC('day', ard.created_at) as day,
    COUNT(DISTINCT ard.correlation_id) as total_workflows,
    AVG(ard.routing_time_ms + ami.total_query_time_ms) as avg_setup_time,
    AVG(EXTRACT(EPOCH FROM (ami.completed_at - ami.created_at)) * 1000) as avg_execution_time,
    AVG(ard.confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE ami.agent_execution_success = true) as successful_workflows,
    AVG(ami.agent_quality_score) as avg_quality
FROM agent_routing_decisions ard
JOIN agent_manifest_injections ami ON ard.correlation_id = ami.correlation_id
WHERE ard.created_at > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

```sql
-- Developer time saved estimation
WITH workflow_metrics AS (
  SELECT
    COUNT(*) as total_workflows,
    AVG(patterns_count) as avg_patterns_used,
    AVG(agent_quality_score) as avg_quality,
    SUM(EXTRACT(EPOCH FROM (completed_at - created_at))) / 3600 as total_execution_hours
  FROM agent_manifest_injections
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND agent_execution_success = true
)
SELECT
  total_workflows,
  avg_patterns_used,
  total_execution_hours,
  -- Estimate: Without AI, each task would take 2x longer
  total_execution_hours as time_saved_hours,
  (total_execution_hours / 40) as weeks_of_work_saved
FROM workflow_metrics;
```

### API Endpoints to Create

```typescript
// GET /api/intelligence/developer/productivity
interface ProductivityMetrics {
  totalWorkflows: number;
  successRate: number;
  avgConfidence: number;
  avgQuality: number;
  timeMetrics: {
    avgSetupTime: number; // routing + manifest
    avgExecutionTime: number;
    totalTimeSaved: number; // estimated
  };
  trends: Array<{
    date: Date;
    workflows: number;
    successRate: number;
    avgQuality: number;
  }>;
}

// GET /api/intelligence/developer/automation-stats
interface AutomationStats {
  totalActionsAutomated: number;
  topAutomatedActions: Array<{
    actionName: string;
    count: number;
    avgDuration: number;
  }>;
  agentUsage: Array<{
    agentName: string;
    timesUsed: number;
    successRate: number;
  }>;
}
```

---

## Dashboard 9: Chat Interface (`/chat`)

**Current Mock Data**:
- AI query assistant
- Conversation history

### Data Sources

**Partial**: `agent_prompts` table contains user prompts

```sql
-- Recent user prompts (conversation history proxy)
SELECT
    user_prompt,
    agent_name,
    claude_session_id,
    conversation_history,
    created_at
FROM agent_prompts
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;
```

**Recommendation**: Chat interface is likely a **new feature** not currently tracked by OmniClaude. Consider:
1. Creating new chat-specific tables in omnidash database
2. Or integrating with `agent_prompts` as read-only conversation history viewer

---

## Implementation Priority

### Phase 1 (Week 1) - High Impact
1. ✅ **Agent Operations** - Core dashboard, high usage
2. ✅ **Platform Health** - Critical for monitoring
3. ✅ **Intelligence Operations** - Shows system performance

### Phase 2 (Week 2) - Medium Impact
4. ✅ **Pattern Learning** - Unique value, medium complexity
5. ✅ **Code Intelligence** - File operations tracking
6. ✅ **Event Flow** - Execution traces

### Phase 3 (Week 3+) - Lower Priority
7. ⚠️ **Knowledge Graph** - Requires Memgraph integration
8. ✅ **Developer Experience** - Derived metrics, lower priority
9. ⚠️ **Chat** - New feature, no existing data

---

## Summary Checklist

### Ready to Integrate (✅)
- [x] Agent Operations - `agent_routing_decisions`, `agent_actions`
- [x] Pattern Learning - `agent_intelligence_usage`
- [x] Intelligence Operations - `agent_manifest_injections`, `agent_prompts`
- [x] Code Intelligence - `agent_file_operations`
- [x] Platform Health - Derived from routing metrics
- [x] Developer Experience - Derived from execution data

### Partial Data (⚠️)
- [ ] Event Flow - Available via views, real-time via Kafka
- [ ] Knowledge Graph - Requires Memgraph connector

### New Feature (🆕)
- [ ] Chat - No existing data, build separately

---

## Next Steps

1. Start with **Agent Operations** dashboard (highest priority)
2. Create API endpoints in `server/intelligence-routes.ts`
3. Replace mock data with real queries in components
4. Test with real data from PostgreSQL
5. Add real-time updates via polling (5-second refetchInterval)
6. Iterate to other dashboards following priority order

**Total Integration Time**: 2-3 hours per dashboard × 6 ready dashboards = 12-18 hours total
