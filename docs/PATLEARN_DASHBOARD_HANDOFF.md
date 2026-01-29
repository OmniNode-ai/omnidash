# PATLEARN Pattern Dashboard - Handoff Document

**Ticket:** [OMN-1699](https://linear.app/omninode/issue/OMN-1699)
**Branch:** `jonah/omn-1699-implement-patlearn-pattern-dashboard-with-evidence-based`
**Date:** 2026-01-29

---

## Overview

Implemented a PATLEARN-focused Pattern Dashboard with **evidence-based score debugging**. The dashboard enables users to understand "why did this pattern score high/low?" through transparent visualization of decomposed score components.

**Core Principle:** Scores without evidence = dashboard theater. Every score includes the inputs that produced it.

---

## What Was Built

### 1. Data Layer

| Component | File | Purpose |
|-----------|------|---------|
| Zod Schemas | `client/src/lib/schemas/api-response-schemas.ts` | 6 schemas with evidence payloads |
| Database Table | `shared/intelligence-schema.ts` | `pattern_learning_artifacts` JSONB table |
| API Endpoints | `server/intelligence-routes.ts` | 3 parameterized endpoints |
| Data Source | `client/src/lib/data-sources/pattern-learning-source.ts` | `patlearnSource` singleton |

### 2. UI Layer

| Component | File | Purpose |
|-----------|------|---------|
| Dashboard Page | `client/src/pages/PatternLearning.tsx` | Main dashboard with stats, filters, table |
| Score Debugger | `client/src/components/pattern/PatternScoreDebugger.tsx` | Sheet with scoring evidence tabs |
| Evidence Card | `client/src/components/pattern/ScoringEvidenceCard.tsx` | Expandable card for each score |
| State Badge | `client/src/components/pattern/LifecycleStateBadge.tsx` | Color-coded lifecycle badges |
| Sidebar Link | `client/src/components/app-sidebar.tsx` | Navigation entry |

### 3. Database Schema

```sql
CREATE TABLE pattern_learning_artifacts (
  id UUID PRIMARY KEY,
  pattern_id UUID NOT NULL,
  pattern_name VARCHAR(255) NOT NULL,
  pattern_type VARCHAR(100) NOT NULL,
  language VARCHAR(50),
  lifecycle_state TEXT NOT NULL DEFAULT 'candidate',
  state_changed_at TIMESTAMPTZ,
  composite_score NUMERIC(10, 6) NOT NULL,
  scoring_evidence JSONB NOT NULL,  -- Full breakdown with inputs
  signature JSONB NOT NULL,          -- Versioned, deterministic
  metrics JSONB DEFAULT '{}',        -- Drift detection
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key Design Decisions

### 1. Lifecycle State Model (not binary)

```typescript
lifecycle_state: 'candidate' | 'provisional' | 'validated' | 'deprecated'
```

- **Candidate** = Initial discovery, below threshold
- **Provisional** = Above threshold, pending validation
- **Validated** = Confirmed as learned pattern
- **Deprecated** = Superseded or invalidated

### 2. Evidence Payloads

Each scoring component includes explanation:

```typescript
scoringEvidence: {
  labelAgreement: {
    score: 0.92,
    matchedLabels: ["compute", "handler", "async"],
    totalLabels: 4,
    disagreements: ["effect"]
  },
  clusterCohesion: {
    score: 0.85,
    clusterId: "cluster-001",
    memberCount: 12,
    avgPairwiseSimilarity: 0.78,
    medoidId: "pattern-001"
  },
  frequencyFactor: {
    score: 0.84,
    observedCount: 47,
    minRequired: 10,
    windowDays: 30
  }
}
```

### 3. API Design

Three parameterized endpoints (not five specialized ones):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/intelligence/patterns/patlearn?state=&limit=&sort=` | List with filtering |
| `GET /api/intelligence/patterns/patlearn/summary?window=` | Aggregate metrics |
| `GET /api/intelligence/patterns/patlearn/:id` | Full detail for debugger |

---

## How to Test

### 1. Start Development Server

```bash
cd /Volumes/PRO-G40/Code/omnidash
PORT=3000 npm run dev
```

### 2. Navigate to Dashboard

- **URL:** http://localhost:3000/patterns
- **Sidebar:** Click "Pattern Learning" in Dashboards section

### 3. Test Features

- **Stats Cards:** Shows Total Patterns, Candidates, Validated, Promotions
- **Filter Tabs:** Click All/Candidates/Provisional/Validated/Deprecated
- **Pattern Table:** Lists patterns with Name, Type, Language, State, Score
- **Score Debugger:** Click any row to open sheet with:
  - **Scoring Tab:** Expandable evidence cards with matched labels, cluster info, etc.
  - **Signature Tab:** Hash, version, algorithm, inputs
  - **Metrics Tab:** Processing time, input count, cluster count, dedup merges

### 4. Verify API

```bash
# List patterns
curl "http://localhost:3000/api/intelligence/patterns/patlearn?limit=5"

# Get summary
curl "http://localhost:3000/api/intelligence/patterns/patlearn/summary?window=24h"

# Get detail (replace ID)
curl "http://localhost:3000/api/intelligence/patterns/patlearn/<pattern-id>"
```

---

## Files Modified/Created

### Created (New Files)

```
client/src/pages/PatternLearning.tsx
client/src/components/pattern/PatternScoreDebugger.tsx
client/src/components/pattern/ScoringEvidenceCard.tsx
client/src/components/pattern/LifecycleStateBadge.tsx
client/src/components/pattern/index.ts
client/src/lib/data-sources/pattern-learning-source.ts
```

### Modified (Existing Files)

```
client/src/lib/schemas/api-response-schemas.ts  (added 6 PATLEARN schemas)
shared/intelligence-schema.ts                    (added pattern_learning_artifacts table)
server/intelligence-routes.ts                    (added 3 API endpoints + transform function)
client/src/lib/data-sources/index.ts            (added exports)
client/src/App.tsx                               (updated route import)
client/src/components/app-sidebar.tsx            (added sidebar link)
```

---

## Known Limitations / Future Work

### Not Implemented (MVP scope)

1. **SimilarityRadar** component - Radar chart for 5-component similarity (needs evidence payloads first)
2. **PatternInventory** component - Split view with threshold visualization
3. **Real-time WebSocket updates** - Currently uses polling
4. **Similarity data in detail endpoint** - Returns empty `similarPatterns` array

### PATLEARN Integration

The dashboard reads from `pattern_learning_artifacts` table. For production use:

1. The PATLEARN compute node (OMN-1423) needs to write artifacts to this table
2. Include full `scoring_evidence` JSONB matching the schema
3. Include `signature` JSONB with hash, version, algorithm, inputs

---

## Related Tickets

- **OMN-1423:** Parent - pattern_learning_compute node
- **OMN-1657:** Output models (In Progress) - aligns with this work
- **OMN-1658-1665:** Remaining PATLEARN subtasks

---

## Verification Checklist

- [x] TypeScript compiles (`npm run check`)
- [x] Tests pass (`npm run test` - 102 passed)
- [x] Sidebar link visible
- [x] Stats cards show correct counts
- [x] Filter tabs work
- [x] Table displays patterns
- [x] Score Debugger opens on row click
- [x] All three tabs work (Scoring, Signature, Metrics)
- [x] Evidence payloads display with explanation data

---

## Screenshots

- Dashboard with data: `.playwright-mcp/pattern-dashboard-final.png`
- Score Debugger (Scoring tab): `.playwright-mcp/score-debugger-open.png`
- Score Debugger (Signature tab): `.playwright-mcp/score-debugger-signature.png`
