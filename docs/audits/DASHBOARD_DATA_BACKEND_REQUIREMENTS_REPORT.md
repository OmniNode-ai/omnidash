# Dashboard Data & Backend Requirements Report

**Date**: 2025-10-28
**Analysis Type**: Data Quality & Responsibility Separation
**Dashboards Analyzed**: Agent Operations, Pattern Learning

---

## Executive Summary

- **Total issues found**: 13
- **Backend/data changes required**: 5 (critical data quality issues)
- **Frontend fixes (our responsibility)**: 8 (display logic, UX improvements)
- **Immediate fixes available**: 4 (< 1 hour, can do now)
- **Blocked on backend**: 3 (require infrastructure team changes)

**Critical Finding**: Pattern Learning dashboard is displaying **filename patterns** (e.g., "test_filesystem_manifest.py") instead of **semantic code patterns** (e.g., "Repository Pattern", "Factory Pattern"). This fundamentally misrepresents the dashboard's purpose.

---

## 🔴 Backend/Data Changes Required (External Dependencies)

### Issue Category 1: Intelligence Database Schema/Data Quality

#### CRITICAL-1: Pattern Lineage Nodes Lack Quality Metrics

- **Issue**: `pattern_lineage_nodes` table has no quality score column
- **Current State**: Frontend mocks quality as 0.85 for all patterns (line 392 `intelligence-routes.ts`)
- **Data Source**: `pattern_lineage_nodes` table in PostgreSQL
- **Required Change**:
  1. Add `quality_score NUMERIC(5,4)` column to `pattern_lineage_nodes`
  2. Populate quality scores during pattern discovery (intelligence infrastructure)
  3. Ensure quality scores are based on: code complexity, usage frequency, test coverage, maintainability metrics
- **Impact**: **HIGH** - Quality trend chart is completely flat, making it useless for monitoring pattern quality evolution
- **Owner**: Intelligence Infrastructure Team (Omniarchon/Pattern Discovery Service)
- **Priority**: **HIGH**
- **Blocking**: Quality Trends chart visualization, Pattern quality-based filtering

#### CRITICAL-2: Pattern Names Are File Paths, Not Semantic Patterns

- **Issue**: Patterns are stored as file paths (e.g., "test_filesystem_manifest.py") instead of semantic pattern names
- **Current State**: Dashboard shows filenames instead of meaningful pattern names like "Repository Pattern", "Singleton Pattern", etc.
- **Data Source**: `pattern_lineage_nodes.pattern_name` column
- **Required Change**:
  1. Pattern discovery service should extract **semantic pattern types** from code analysis
  2. Store both `file_path` (for traceability) and `semantic_pattern_name` (for display)
  3. Options:
     - AST analysis to detect design patterns
     - Static analysis to identify architectural patterns
     - Code structure analysis for recurring patterns
- **Impact**: **CRITICAL** - Dashboard is fundamentally misleading users about what "patterns" means
- **Owner**: Intelligence Infrastructure Team (Pattern Discovery Service)
- **Priority**: **CRITICAL**
- **Example Expected Values**:
  - "Repository Pattern (Python)"
  - "Singleton Pattern (TypeScript)"
  - "Factory Method (Java)"
  - "Observer Pattern (Python)"

#### MEDIUM-1: Pattern Usage Counts Are Not Tracked

- **Issue**: No usage tracking for patterns - all show "1x"
- **Current State**: Hardcoded as `usage = 1` (line 396 `intelligence-routes.ts`)
- **Data Source**: Missing from `pattern_lineage_nodes` table
- **Required Change**:
  1. Add `usage_count INT DEFAULT 1` column to `pattern_lineage_nodes`
  2. Increment usage_count when:
     - Pattern is referenced in new code
     - Pattern is imported/used in codebase
     - Agent recommends this pattern
  3. Track via Kafka events: `pattern-usage-events` topic
- **Impact**: **MEDIUM** - Cannot identify "Top Performing Patterns" by actual usage
- **Owner**: Intelligence Infrastructure Team
- **Priority**: **MEDIUM**

### Issue Category 2: Kafka Event Stream Data

#### MEDIUM-2: Agent Success/Error Events May Be Incomplete

- **Issue**: Success rate calculation falls back to confidence score proxy
- **Current State**: Lines 271-282 `event-consumer.ts` - Uses confidence as success rate if no success/error events
- **Data Source**: `agent-actions` Kafka topic
- **Required Change**: Ensure all agent executions emit success/error events to Kafka
- **Impact**: **MEDIUM** - Success rate may not reflect actual agent performance
- **Owner**: Agent Execution Framework Team
- **Priority**: **MEDIUM**
- **Validation Query**:

```sql
-- Check if success/error events exist for all routing decisions
SELECT
  r.selected_agent,
  COUNT(r.id) as routing_count,
  COUNT(CASE WHEN a.action_type IN ('success', 'error') THEN 1 END) as outcome_count
FROM agent_routing_decisions r
LEFT JOIN agent_actions a ON r.correlation_id = a.correlation_id
GROUP BY r.selected_agent
HAVING COUNT(r.id) > COUNT(CASE WHEN a.action_type IN ('success', 'error') THEN 1 END);
```

### Issue Category 3: Performance Issues

#### HIGH-1: Routing Time Consistently Above Threshold (1992ms avg)

- **Issue**: Average routing time is 1992ms (19.9x over 100ms threshold)
- **Current State**: Real data from `agent_routing_decisions.routing_time_ms`
- **Data Source**: Routing decision latency tracking
- **Required Investigation**:
  1. Is 100ms threshold realistic for multi-agent routing with RAG/vector search?
  2. Break down routing time components:
     - Enhanced fuzzy matching time
     - Capability index lookup time
     - Database query time (if any)
     - Network latency (if distributed)
  3. Identify optimization opportunities:
     - Cache routing decisions for similar queries
     - Pre-build routing indexes
     - Optimize confidence scoring algorithms
- **Impact**: **HIGH** - Slow routing degrades user experience
- **Owner**: Polymorphic Agent / Routing Infrastructure Team
- **Priority**: **HIGH**
- **Recommendation**: Either optimize routing OR adjust threshold to 2000ms based on actual production metrics

---

## 🟢 Frontend Issues (Our Responsibility)

### Issue Category 1: Display Logic Bugs

#### IMMEDIATE-1: Quality Display Format Is Actually Correct!

- **Issue**: **FALSE ALARM** - Quality displays correctly as "85%" in metric card
- **Current State**: Screenshot shows "85%" which is correct (line 137 `PatternLearning.tsx`)
- **Root Cause**: Previous analysis was incorrect
- **Status**: ✅ **NO FIX NEEDED** - Working as designed
- **Note**: Pattern network nodes also display quality correctly (line 172-175 `PatternNetwork.tsx`)

#### IMMEDIATE-2: "Active Agents" Label Is Misleading

- **Issue**: "Active Agents" shows 24h count, not real-time active agents
- **Current State**: Counts agents with activity in last 24h (line 264 `event-consumer.ts`)
- **Root Cause**: Label doesn't match data semantics
- **Required Fix**: Change label to clarify time window
- **File**: `/client/src/pages/AgentOperations.tsx:184`
- **Fix**:

```tsx
// FROM:
<MetricCard
  label="Active Agents"
  value={activeAgents}
  icon={Activity}
  status="healthy"
/>

// TO:
<MetricCard
  label="Active Agents (24h)"
  value={activeAgents}
  icon={Activity}
  status="healthy"
  tooltip="Agents with activity in last 24 hours"
/>
```

- **Effort**: 5 minutes
- **Priority**: **HIGH** (misleading users)

#### IMMEDIATE-3: Pattern Quality Score Display in List

- **Issue**: TopPatternsList expects `quality` as percentage (0-100), receives decimal (0.85)
- **Current State**: Line 55 `TopPatternsList.tsx` displays `{pattern.quality}%`
- **Root Cause**: API returns 0.85 (decimal), but list component expects 85 (percentage)
- **Required Fix**: Transform quality in frontend
- **File**: `/client/src/pages/PatternLearning.tsx:175-179`
- **Fix**:

```tsx
// FROM:
patterns={(patterns || []).map(p => ({
  ...p,
  usageCount: p.usage,
  trend: p.trendPercentage
}))}

// TO:
patterns={(patterns || []).map(p => ({
  ...p,
  quality: Math.round(p.quality * 100), // Convert 0.85 → 85
  usageCount: p.usage,
  trend: p.trendPercentage
}))}
```

- **Effort**: 2 minutes
- **Priority**: **MEDIUM**

### Issue Category 2: Missing Features

#### SHORT-TERM-1: No Threshold Indicators on Agent Operations

- **Issue**: Users can't see 100ms response time threshold or 90% success rate threshold
- **Current State**: Thresholds only in code (line 199, 205 `AgentOperations.tsx`)
- **Required Fix**: Add threshold lines or visual indicators
- **File**: `/client/src/pages/AgentOperations.tsx:181-207`
- **Implementation Options**:
  1. **Tooltip approach** (quick):
     ```tsx
     <MetricCard
       label="Avg Response Time"
       value={`${Math.round(avgResponseTime)}ms`}
       icon={Clock}
       status={avgResponseTime < 100 ? 'healthy' : 'warning'}
       tooltip="Target: < 100ms"
     />
     ```
  2. **Visual indicator** (better UX):
     - Add threshold line to chart
     - Show percentage of threshold (1992ms = 1992% of 100ms target)
- **Effort**: 1-2 hours
- **Priority**: **MEDIUM**

#### SHORT-TERM-2: No Status Legend for Agent Colors

- **Issue**: Green/yellow/red dots on agent cards have no legend
- **Current State**: Colors defined in `AgentStatusGrid.tsx:22-29` but not explained
- **Required Fix**: Add legend component
- **File**: `/client/src/pages/AgentOperations.tsx:224-234`
- **Fix**:

```tsx
// Add before AgentStatusGrid component:
<Card className="p-4 mb-4">
  <div className="flex items-center gap-6">
    <span className="text-sm text-muted-foreground">Status:</span>
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-status-healthy" />
      <span className="text-xs">Active (>90% success)</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-status-idle" />
      <span className="text-xs">Idle (70-90% success)</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-status-error" />
      <span className="text-xs">Error (<70% success)</span>
    </div>
  </div>
</Card>
```

- **Effort**: 30 minutes
- **Priority**: **LOW** (nice-to-have)

#### SHORT-TERM-3: No Search/Filter UI for Patterns

- **Issue**: 1,119 patterns with no way to search or filter
- **Current State**: PatternLearning shows top 50 patterns only
- **Required Fix**: Add search input and category filter
- **File**: `/client/src/pages/PatternLearning.tsx:53-79`
- **Implementation**:
  1. Add search input state
  2. Add category filter dropdown
  3. Filter patterns client-side OR add query params to API
- **Effort**: 2-3 hours
- **Priority**: **MEDIUM**

### Issue Category 3: UX Improvements

#### MEDIUM-3: Flat Quality Trend Chart Is Uninformative

- **Issue**: Quality trend chart shows flat line at 85% (no variation over time)
- **Current State**: All data points are 0.85 due to mocked quality scores
- **Root Cause**: Backend has no real quality variation (see CRITICAL-1)
- **Temporary Fix**: Add message explaining data limitation
- **File**: `/client/src/pages/PatternLearning.tsx:159-167`
- **Fix**:

```tsx
<RealtimeChart
  title="Average Quality Score"
  data={(qualityData || []).map((d) => ({
    time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: d.avgQuality * 100,
  }))}
  color="hsl(var(--chart-3))"
  footer={
    // Check if all values are same (flat line)
    qualityData &&
    qualityData.every((d) => Math.abs(d.avgQuality - qualityData[0].avgQuality) < 0.01)
      ? '⚠ Quality tracking not yet enabled - showing baseline'
      : undefined
  }
/>
```

- **Effort**: 30 minutes
- **Priority**: **LOW** (blocked on backend)

#### MEDIUM-4: Pattern Names Need Truncation and Tooltips

- **Issue**: Long filenames overflow in PatternNetwork visualization
- **Current State**: Already truncated to 15 chars (line 157-160 `PatternNetwork.tsx`)
- **Enhancement**: Add hover tooltip showing full name
- **File**: `/client/src/components/PatternNetwork.tsx:222-235`
- **Effort**: 1 hour (need to implement tooltip overlay)
- **Priority**: **LOW**

#### LOW-1: No Loading States for Chart Transitions

- **Issue**: Charts show empty space while loading new time window data
- **Current State**: useQuery shows loading state, but charts don't indicate data is updating
- **Required Fix**: Add skeleton loader or shimmer effect
- **Files**: `/client/src/pages/PatternLearning.tsx:149-167`
- **Effort**: 1-2 hours
- **Priority**: **LOW**

---

## 📋 Prioritized Action Plan

### ⚡ Immediate Fixes (< 1 hour, we can do now):

1. **[IMMEDIATE-2]** Fix "Active Agents" misleading label → "Active Agents (24h)"
   - **File**: `client/src/pages/AgentOperations.tsx:184`
   - **Time**: 5 minutes

2. **[IMMEDIATE-3]** Fix quality display in TopPatternsList (decimal → percentage)
   - **File**: `client/src/pages/PatternLearning.tsx:175-179`
   - **Time**: 2 minutes

3. **[SHORT-TERM-1]** Add threshold tooltips to metric cards
   - **File**: `client/src/pages/AgentOperations.tsx:189-206`
   - **Time**: 30 minutes

4. **[MEDIUM-3]** Add "quality tracking not enabled" message to flat chart
   - **File**: `client/src/pages/PatternLearning.tsx:159-167`
   - **Time**: 15 minutes

**Total Time**: ~52 minutes

### 📅 Short-term (1-4 hours, we can do this week):

1. **[SHORT-TERM-2]** Add status legend for agent colors
   - **File**: `client/src/pages/AgentOperations.tsx:224-234`
   - **Time**: 30 minutes

2. **[SHORT-TERM-3]** Add search/filter UI for patterns
   - **File**: `client/src/pages/PatternLearning.tsx:53-79`
   - **Time**: 2-3 hours

3. **[MEDIUM-4]** Add hover tooltips for truncated pattern names
   - **File**: `client/src/components/PatternNetwork.tsx`
   - **Time**: 1 hour

4. **[LOW-1]** Add loading skeletons for chart transitions
   - **File**: `client/src/pages/PatternLearning.tsx:149-167`
   - **Time**: 1-2 hours

**Total Time**: ~5-7 hours

### 🚫 Requires Backend Changes (blocked on infrastructure team):

1. **[CRITICAL-2]** Pattern names are file paths, not semantic patterns
   - **Blocker**: Pattern Discovery Service needs to extract semantic pattern types
   - **Owner**: Intelligence Infrastructure Team
   - **Expected Timeline**: 2-3 weeks (requires AST analysis implementation)

2. **[CRITICAL-1]** Pattern quality scores are mocked (all 0.85)
   - **Blocker**: `pattern_lineage_nodes` table lacks quality_score column
   - **Owner**: Intelligence Infrastructure Team
   - **Expected Timeline**: 1 week (schema change + backfill)

3. **[MEDIUM-1]** Pattern usage counts are hardcoded (all 1x)
   - **Blocker**: No usage tracking in database or Kafka events
   - **Owner**: Intelligence Infrastructure Team
   - **Expected Timeline**: 2 weeks (requires event streaming changes)

4. **[HIGH-1]** Routing time consistently above threshold (1992ms)
   - **Blocker**: Requires performance investigation and optimization
   - **Owner**: Polymorphic Agent / Routing Team
   - **Expected Timeline**: Ongoing optimization

5. **[MEDIUM-2]** Agent success/error events may be incomplete
   - **Blocker**: Requires audit of agent execution framework
   - **Owner**: Agent Execution Framework Team
   - **Expected Timeline**: 1 week (audit + fixes)

---

## 🔍 Data Quality Analysis

### Agent Operations Dashboard

- **Data Source**:
  - Kafka topics: `agent-routing-decisions`, `agent-actions`
  - In-memory aggregation via `event-consumer.ts`
- **Refresh Rate**:
  - Kafka events: Real-time (<100ms latency)
  - Dashboard polling: Every 10-30 seconds
  - Metrics aggregation window: 24 hours
- **Data Completeness**: ✅ **COMPLETE**
  - All required metrics are available
  - Event stream is operational
  - Historical data is retained for 24h
- **Data Accuracy**: ⚠️ **MOSTLY ACCURATE**
  - Routing times: Real data (but high at 1992ms)
  - Success rates: Uses confidence proxy if no success/error events
  - Active agents: Shows 24h window (misleading label)

### Pattern Learning Dashboard

- **Data Source**:
  - PostgreSQL: `pattern_lineage_nodes`, `pattern_lineage_edges`, `agent_manifest_injections`
  - Omniarchon Intelligence Service (quality trends, fallback to DB)
- **Refresh Rate**:
  - API polling: Every 30-60 seconds
  - Database queries: Real-time on demand
- **Data Completeness**: ❌ **INCOMPLETE**
  - ❌ No quality scores (mocked at 0.85)
  - ❌ No usage counts (hardcoded at 1)
  - ❌ Pattern names are file paths, not semantic patterns
  - ✅ Pattern discovery rate is accurate
  - ✅ Pattern relationships are tracked
- **Data Accuracy**: ⚠️ **PARTIALLY ACCURATE**
  - Pattern count: ✅ Accurate (1,119 real patterns)
  - Pattern trends: ✅ Accurate (real age-based trends)
  - Quality scores: ❌ Mocked (all 0.85 or language-based mock)
  - Usage counts: ❌ Hardcoded (all 1x)
  - Pattern names: ❌ Misleading (filenames instead of semantic patterns)

---

## 📊 Impact Assessment

### 🔴 High Impact Issues (Block Dashboard Usefulness):

1. **[CRITICAL-2] Pattern names are file paths** - Dashboard fundamentally misrepresents what "code patterns" means
   - **User Impact**: Users cannot understand what patterns are being discovered
   - **Business Impact**: Dashboard does not fulfill its core purpose of pattern learning visibility
   - **Recommendation**: Add prominent banner: "⚠ Pattern semantic analysis in progress - currently showing file-level patterns"

2. **[CRITICAL-1] All quality scores are 0.85** - Quality trend chart is useless
   - **User Impact**: Cannot track quality improvements over time
   - **Business Impact**: No actionable insights about code quality evolution
   - **Recommendation**: Hide quality trend chart until real data available OR show "Data collection in progress" overlay

3. **[HIGH-1] Routing time 1992ms** - Far above threshold, indicates performance issue
   - **User Impact**: Slow agent routing degrades user experience
   - **Business Impact**: May indicate need for routing optimization or threshold adjustment
   - **Recommendation**: Investigate and optimize OR adjust threshold to realistic production value

### 🟡 Medium Impact Issues (Reduce Dashboard Value):

1. **[IMMEDIATE-2] "Active Agents" label misleading** - Shows 24h data, not real-time
   - **User Impact**: Users may think 4 agents are currently executing
   - **Mitigation**: Quick label fix (5 minutes)

2. **[MEDIUM-1] Usage counts hardcoded at 1x** - Cannot identify popular patterns
   - **User Impact**: "Top Performing Patterns" is meaningless without real usage data
   - **Mitigation**: Sort by quality until usage tracking is available

3. **[SHORT-TERM-3] No search/filter UI** - Hard to navigate 1,119 patterns
   - **User Impact**: Users can only see top 50 patterns
   - **Mitigation**: Implement client-side search (2-3 hours)

### 🟢 Low Impact Issues (Polish):

1. **[SHORT-TERM-2] No status legend** - Users may not understand agent colors
   - **User Impact**: Minor confusion about color meanings
   - **Mitigation**: Colors are intuitive (green=good, red=bad)

2. **[MEDIUM-4] Long pattern names truncated** - Hard to read full names
   - **User Impact**: Must open drill-down to see full name
   - **Mitigation**: Already truncated at 15 chars with ellipsis

3. **[LOW-1] No chart loading states** - Brief empty space during data refresh
   - **User Impact**: Momentary visual disruption every 30-60s
   - **Mitigation**: Fast refresh (30-60s) minimizes issue

---

## 🎯 Recommendations

### For Dashboard Team (Us):

1. **Execute Immediate Fixes Today** (~1 hour total)
   - Fix misleading labels
   - Add threshold indicators
   - Add quality tracking disclaimer

2. **Implement Search/Filter This Week** (2-3 hours)
   - Critical for pattern navigation with 1,119 patterns
   - Can be done entirely frontend (no backend dependency)

3. **Add Prominent Data Quality Warnings**
   - Pattern Learning: "⚠ Semantic pattern analysis coming soon - currently showing file-level patterns"
   - Quality Trends: "Quality tracking will be enabled in next release"

### For Intelligence Infrastructure Team:

1. **CRITICAL Priority**: Fix semantic pattern naming (2-3 weeks)
   - Implement AST analysis for pattern detection
   - Store semantic pattern names alongside file paths
   - Expected impact: Dashboard becomes actually useful

2. **HIGH Priority**: Add quality score tracking (1 week)
   - Schema change: Add `quality_score` to `pattern_lineage_nodes`
   - Implement quality calculation during pattern discovery
   - Backfill historical data with initial quality assessments

3. **MEDIUM Priority**: Implement usage tracking (2 weeks)
   - Add `usage_count` column
   - Emit `pattern-usage-events` to Kafka
   - Track pattern references in codebase

4. **HIGH Priority**: Investigate routing performance (ongoing)
   - Profile routing decision latency
   - Identify optimization opportunities
   - Adjust thresholds to match production reality

---

## ✅ Success Metrics

### Short-term (This Week):

- [ ] "Active Agents (24h)" label added
- [ ] Quality display shows percentages correctly in all locations
- [ ] Threshold tooltips visible on metric cards
- [ ] Search/filter implemented for patterns
- [ ] Data quality disclaimers added to dashboard

### Medium-term (Next Month):

- [ ] Semantic pattern names displayed instead of file paths
- [ ] Real quality scores showing variation over time
- [ ] Quality trend chart displays meaningful data
- [ ] Usage counts reflect actual pattern adoption
- [ ] Routing time optimized below 500ms or threshold adjusted

### Long-term (Next Quarter):

- [ ] Pattern quality tracking fully operational
- [ ] Pattern recommendation engine based on quality + usage
- [ ] Pattern similarity search integrated
- [ ] Real-time pattern discovery notifications
- [ ] Pattern impact analysis showing where patterns are used

---

## 📝 Appendix: Data Flow Diagrams

### Agent Operations Data Flow

```
Kafka Topics                   Event Consumer              Frontend API              Dashboard
─────────────                  ──────────────              ────────────              ─────────
agent-routing-decisions   →   Aggregate metrics      →   /agents/summary      →   AgentOperations.tsx
                               (24h window)                                          - Active Agents (24h)
                                                                                     - Total Requests
                                                                                     - Avg Response Time
                                                                                     - Success Rate

agent-actions             →   Store recent actions   →   /actions/recent      →   AgentOperations.tsx
                               (last 100)                                            - Event Feed
                                                                                     - Activity Chart
```

### Pattern Learning Data Flow

```
PostgreSQL Tables             Backend Routes              Frontend API              Dashboard
─────────────                 ──────────                  ────────────              ─────────
pattern_lineage_nodes    →   /patterns/summary      →   useQuery           →   PatternLearning.tsx
                                                                                  - Total Patterns
                                                                                  - New Today
                                                                                  - Avg Quality (⚠ mocked)

pattern_lineage_nodes    →   /patterns/list         →   useQuery           →   PatternNetwork.tsx
                              (transforms to                                     TopPatternsList.tsx
                               display format)                                   - Pattern visualization
                                                                                 - Quality scores (⚠ mocked)
                                                                                 - Usage counts (⚠ hardcoded)

agent_manifest_injections →  /patterns/quality-trends → useQuery          →   RealtimeChart
OR Omniarchon API                                                              - Quality over time
                                                                                (⚠ flat line, mocked data)
```

---

**Report End**
