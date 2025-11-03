# Actual Data Available in PostgreSQL

**Generated**: 2025-11-03
**Database**: `omninode_bridge` at `192.168.86.200:5436`
**Note**: MCP functionality is no longer available.

---

## ⚠️ Reality Check

The previous research reports described aspirational schemas. This document shows **what actually exists** in the database right now.

---

## 📊 Actual Database Tables (16 tables)

```
connection_metrics
event_metrics              (0 rows - EMPTY)
event_processing_metrics
generation_performance_metrics
hook_events                (147 rows - UserPromptSubmit events only)
mixin_compatibility_matrix
pattern_ancestry_cache
pattern_feedback_log
pattern_lineage_edges      (1 row)
pattern_lineage_events
pattern_lineage_nodes      (1,056 rows - CODE PATTERNS!)
pattern_quality_metrics    (5 rows)
schema_migrations
security_audit_log
service_sessions
template_cache_metadata
```

---

## ✅ Data We Actually Have

### 1. **Pattern Lineage Data** (1,056 patterns) ✅

**Table**: `pattern_lineage_nodes`

**What it contains**:
- 1,056 code patterns (all `pattern_type = 'code'`)
- Python patterns (test files, scripts)
- Correlation IDs for tracing
- Pattern metadata and versions

**Schema**:
```sql
- id (uuid)
- pattern_id (varchar)
- pattern_name (varchar) - e.g., "test_source_node_id_overhead.py"
- pattern_type (varchar) - "code"
- pattern_version (varchar) - "1.0.0"
- lineage_id (uuid)
- generation (integer)
- pattern_data (jsonb) - actual pattern content
- metadata (jsonb)
- correlation_id (uuid) - traces back to execution
- created_at (timestamp)
- tool_name (varchar)
- file_path (text)
- language (varchar) - "python"
```

**Sample Query**:
```sql
SELECT
  pattern_name,
  pattern_version,
  language,
  created_at,
  correlation_id
FROM pattern_lineage_nodes
ORDER BY created_at DESC
LIMIT 10;
```

**Use Case**: Pattern Learning dashboard

---

### 2. **Hook Events** (147 events) ✅

**Table**: `hook_events`

**What it contains**:
- 147 UserPromptSubmit events
- Payload includes user prompts and agent routing info
- All events are `source='UserPromptSubmit', action='prompt_submitted'`

**Schema**:
```sql
- id (uuid)
- source (varchar) - "UserPromptSubmit"
- action (varchar) - "prompt_submitted"
- resource (varchar)
- resource_id (varchar)
- payload (jsonb) - contains prompt, agent selected, etc.
- metadata (jsonb)
- processed (boolean)
- processing_errors (text[])
- retry_count (integer)
- created_at (timestamp)
- processed_at (timestamp)
```

**Sample Query**:
```sql
SELECT
  id,
  source,
  action,
  payload->>'prompt' as user_prompt,
  payload->>'selectedAgent' as agent,
  created_at
FROM hook_events
ORDER BY created_at DESC
LIMIT 10;
```

**Use Case**: Agent Operations - recent user prompts and agent selection

---

### 3. **Pattern Quality Metrics** (5 rows) ⚠️

**Table**: `pattern_quality_metrics`

**What it contains**: Very limited data (only 5 rows)

**Use Case**: Pattern Learning - quality scoring (needs more data)

---

### 4. **Pattern Lineage Edges** (1 row) ⚠️

**Table**: `pattern_lineage_edges`

**What it contains**: Only 1 edge (not useful for visualization yet)

**Use Case**: Knowledge Graph - pattern relationships (needs more data)

---

## ❌ Data We DON'T Have

### Missing Tables (Expected but not present):
- `agent_routing_decisions` - ❌ Does not exist
- `agent_actions` - ❌ Does not exist
- `agent_manifest_injections` - ❌ Does not exist
- `agent_prompts` - ❌ Does not exist
- `agent_file_operations` - ❌ Does not exist
- `agent_intelligence_usage` - ❌ Does not exist
- `llm_calls` - ❌ Does not exist
- `workflow_steps` - ❌ Does not exist
- `success_events` / `error_events` - ❌ Does not exist

### Empty Tables:
- `event_metrics` - ✅ Exists but EMPTY (0 rows)

---

## 🎯 Dashboard Feasibility Assessment

| Dashboard | Feasibility | Data Source | Status |
|-----------|------------|-------------|---------|
| **Agent Operations** | ⚠️ Partial | `hook_events.payload` | Limited - only UserPromptSubmit |
| **Pattern Learning** | ✅ Good | `pattern_lineage_nodes` | 1,056 patterns available! |
| **Intelligence Operations** | ❌ No Data | N/A | Would need agent execution data |
| **Code Intelligence** | ⚠️ Partial | `pattern_lineage_nodes` | Patterns exist, no quality scores |
| **Event Flow** | ❌ No Data | `event_metrics` is empty | Would need event stream data |
| **Knowledge Graph** | ❌ Insufficient | `pattern_lineage_edges` (1 row) | Need more relationships |
| **Platform Health** | ❌ No Data | N/A | Would need service health metrics |
| **Developer Experience** | ❌ No Data | N/A | Would need workflow data |

---

## 💡 Realistic Integration Plan

### Phase 1: Pattern Learning Dashboard (Immediate - 2 hours)

**✅ CAN DO NOW** - We have 1,056 patterns!

**Endpoints to create**:
```typescript
// server/intelligence-routes.ts

// GET /api/patterns/summary
router.get('/api/patterns/summary', async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      COUNT(*) as total_patterns,
      COUNT(DISTINCT language) as languages,
      COUNT(DISTINCT correlation_id) as unique_executions
    FROM pattern_lineage_nodes
  `);
  res.json(result.rows[0]);
});

// GET /api/patterns/recent
router.get('/api/patterns/recent', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await db.execute(sql`
    SELECT
      pattern_name,
      pattern_version,
      language,
      created_at,
      correlation_id
    FROM pattern_lineage_nodes
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  res.json(result.rows);
});

// GET /api/patterns/by-language
router.get('/api/patterns/by-language', async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      language,
      COUNT(*) as pattern_count
    FROM pattern_lineage_nodes
    WHERE language IS NOT NULL
    GROUP BY language
    ORDER BY pattern_count DESC
  `);
  res.json(result.rows);
});
```

**Replace mock data in**:
- `client/src/pages/PatternLearning.tsx`
- `client/src/lib/data-sources/pattern-learning-source.ts`

---

### Phase 2: Agent Operations Dashboard (Limited - 3 hours)

**⚠️ LIMITED DATA** - Only UserPromptSubmit events

**Endpoints to create**:
```typescript
// GET /api/intelligence/prompts/recent
router.get('/api/intelligence/prompts/recent', async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      id,
      payload->>'prompt' as user_prompt,
      payload->>'selectedAgent' as selected_agent,
      payload->>'confidenceScore' as confidence,
      created_at
    FROM hook_events
    WHERE source = 'UserPromptSubmit'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  res.json(result.rows);
});

// GET /api/intelligence/agents/activity-summary
router.get('/api/intelligence/agents/activity-summary', async (req, res) => {
  const result = await db.execute(sql`
    SELECT
      payload->>'selectedAgent' as agent_name,
      COUNT(*) as total_requests,
      AVG((payload->>'confidenceScore')::numeric) as avg_confidence
    FROM hook_events
    WHERE source = 'UserPromptSubmit'
      AND payload->>'selectedAgent' IS NOT NULL
    GROUP BY payload->>'selectedAgent'
    ORDER BY total_requests DESC
  `);
  res.json(result.rows);
});
```

**Limitations**:
- No agent actions/tool calls (need to add those tables)
- No execution duration (not tracked in hook_events)
- No success/failure tracking (not in current schema)

---

### Phase 3: Build Missing Infrastructure (1-2 weeks)

**To enable full Agent Operations dashboard**, need to add:

1. **Agent Execution Tracking**:
   - Create `agent_actions` table
   - Track tool calls, decisions, errors
   - Add duration and status

2. **Agent Performance Metrics**:
   - Create `agent_routing_decisions` table
   - Track confidence scores, routing time
   - Track actual success/failure

3. **Event Streaming**:
   - Populate `event_metrics` table
   - Set up Kafka consumers
   - Real-time event processing

---

## 🔧 Quick Start (Pattern Learning)

### Step 1: Add Database Schema (10 min)

```typescript
// shared/intelligence-schema.ts
import { pgTable, uuid, varchar, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

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
```

### Step 2: Create API Endpoints (30 min)

Create `server/pattern-routes.ts` with endpoints above.

### Step 3: Replace Mock Data (20 min)

Update `pattern-learning-source.ts`:
```typescript
export const fetchPatternSummary = async () => {
  const response = await fetch('/api/patterns/summary');
  if (!response.ok) {
    return getMockPatternData(); // Fallback
  }
  return await response.json();
};
```

### Step 4: Test (10 min)

```bash
curl http://localhost:3000/api/patterns/summary
curl http://localhost:3000/api/patterns/recent?limit=10
curl http://localhost:3000/api/patterns/by-language
```

---

## 📈 Summary

### ✅ What We Can Do NOW:
1. **Pattern Learning Dashboard** - 1,056 patterns ready to display!
2. **Limited Agent Activity** - 147 user prompts with agent selection

### ⚠️ What Needs Work:
1. Agent execution tracking (no actions/tool calls yet)
2. Performance metrics (no duration/success tracking)
3. Event streaming (event_metrics is empty)
4. Knowledge graph (only 1 edge)

### ❌ What's Not Available:
1. Full agent operations (missing execution data)
2. Code intelligence scores (no quality data)
3. Real-time events (no event stream)
4. Platform health (no service metrics)
5. MCP functionality (no longer available)

### 🎯 Recommendation:

**START WITH PATTERN LEARNING** - we have real data (1,056 patterns) that can be displayed immediately. This gives us a quick win and demonstrates the value of integrating real data.

Then progressively build out agent execution tracking to enable the other dashboards.
