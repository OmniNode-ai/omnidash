# Dashboard Fix Plan - YC Demo Readiness

## Status Overview
✅ = Already implemented | 🔄 = In progress | ❌ = Needs work | 🚫 = Excluded from demo

---

## 🔴 CRITICAL - Must Fix Before Demo

### Global / Demo Mode
- ❌ **Add Demo Mode toggle** - Hide error banners, seed KPIs, animate charts, watermark 'Demo Data'
  - Location: Header component or global context
  - Action: Create `DemoModeProvider` context + toggle in header
  - Blocks: Everything else below depends on this

- ❌ **Remove/Neutralize error banners in demo mode**
  - Current: AlertBanner shows `/api/intelligence/alerts/active`
  - Action: Check `isDemoMode` in AlertBanner, return null or seed benign alerts
  - File: `client/src/components/AlertBanner.tsx`

- ❌ **Normalize comparison windows to "vs last 7 days"**
  - Action: Update all dashboard comparison text from "last week/month" to "last 7 days"
  - Files: All dashboard components with trend comparisons

### Agent Management
- ❌ **Overview: Seed realistic totals**
  - Need: requests/day ~1200, success rate ~94%, avg response ~1.2s
  - Action: Update `agent-management-source.ts` mock data to match script metrics
  - File: `client/src/lib/data-sources/agent-management-source.ts`

- ❌ **Routing Intelligence: Replace 0%/0ms placeholders**
  - Current: Shows 0% accuracy, 0ms routing time
  - Action: Seed realistic mock data (94.2% accuracy, 45ms routing time)
  - File: `client/src/lib/data-sources/agent-management-source.ts` (RoutingStats mock)

### Code Intelligence Suite
- ❌ **Overview: Show "Proven Patterns" as hero metric**
  - Current: Shows "Total Patterns" first
  - Action: Reorder metrics, make "Proven Patterns" the primary card
  - File: `client/src/pages/preview/CodeIntelligenceSuite.tsx`

- ❌ **Live Pattern Discovery failing → stub endpoint or sample feed**
  - Current: PatternLearning tries to fetch but shows empty state
  - Action: Create stub endpoint `/api/intelligence/patterns/discovery` or loop sample data
  - File: `client/src/pages/PatternLearning.tsx`

- ❌ **Pattern Detail Modal: Fix inconsistent metrics**
  - Issue: List shows 87% quality but modal shows 1%
  - Action: Audit PatternDetailModal component, ensure data sources match
  - Files: `client/src/components/PatternDetailModal.tsx`, `client/src/pages/PatternLearning.tsx`

### Intelligence Analytics
- ❌ **Overview: Align KPIs with script**
  - Need: Success ~94%, Response ~1.2s, Savings ~$45k, Token Reduction ~34%
  - Action: Update mock data in `intelligence-analytics-source.ts` and `intelligence-savings-source.ts`
  - Files: Both source files

---

## 🟡 HIGH PRIORITY - Important for Demo Flow

### Code Intelligence Suite
- ❌ **Pattern Discovery: Add "Inject to Agent" CTA**
  - Action: Add dropdown button on pattern cards (Cursor/Claude/Copilot options)
  - File: `client/src/components/TopPatternsList.tsx` or pattern cards

- ❌ **Pattern Lineage: Ensure 2-3 hop lineage visible**
  - Current: Uses mock data, need to verify lineage depth
  - Action: Seed mock data with clear multi-hop relationships
  - File: `client/src/pages/preview/PatternLineage.tsx`

- ❌ **Duplicate Detection: Surface Duplicate Clusters (e.g., 15)**
  - Action: Ensure mock data shows cluster count prominently
  - File: `client/src/pages/preview/DuplicateDetection.tsx`

- ❌ **Duplicate Detection: Mark "Best Implementation"**
  - Action: Add badge/indicator on best implementation in each cluster
  - File: `client/src/pages/preview/DuplicateDetection.tsx`

- ❌ **Duplicate Detection: Add "Refactor Plan" modal**
  - Action: Create modal component showing prioritized refactoring steps
  - File: New component + integrate into DuplicateDetection

- ❌ **Tech Debt: Add "Top 3 to Fix Next"**
  - Action: Add card/section showing repo path + est hours + expected savings
  - File: `client/src/pages/preview/TechDebtAnalysis.tsx`

### Intelligence Analytics
- ❌ **Agent Performance: Replace vague "Efficiency" with "Cost per Success" and "p95 latency"**
  - Action: Update metrics display, add calculations
  - File: `client/src/pages/preview/IntelligenceAnalytics.tsx`

- ❌ **Cost & Savings: Add "Methodology" tooltip**
  - Action: Add info icon with tooltip explaining calculation methodology
  - File: `client/src/pages/preview/IntelligenceSavings.tsx`

- ❌ **Advanced: Add routing accuracy vs fallback, cache hit rate, pattern-injection uplift chart**
  - Action: Add new metrics and chart to Advanced Analytics tab
  - File: `client/src/pages/preview/EnhancedAnalytics.tsx`

---

## 🟢 MEDIUM PRIORITY - Polish & UX

### Global
- ❌ **Add click affordances**
  - Action: Add `cursor-pointer`, hover states, focus outlines to all clickable elements
  - Files: All card/button/row components

- ❌ **Ensure modals are clearly differentiated**
  - Action: Add dimmed backdrop, escape/close affordance, return focus
  - Files: All modal components (PatternDetailModal, AgentDetailModal, etc.)

### Platform Monitoring
- 🚫 **System Health tab is broken** - EXCLUDED from YC script
  - Action: Either fix or hide from sidebar during demo
  - File: `client/src/pages/preview/SystemHealth.tsx`

- ❌ **Services: Seed mock service data**
  - Action: Add mock service status, latency, error rate
  - File: Platform Monitoring component

- ❌ **Developer Metrics: Add mock dataset**
  - Action: Seed data or stub endpoint
  - Note: Excluded from YC script until stable

- ❌ **Incidents: Include example incidents**
  - Action: Add 1 closed + 1 open incident for credibility
  - File: Platform Monitoring

### Architecture & Networks
- ❌ **Node Networks: Seed small topology (6-8 nodes, 10-12 edges)**
  - Action: Update mock data in Architecture Networks
  - File: `client/src/pages/preview/ArchitectureNetworks.tsx`

- ❌ **Knowledge Graph: Populate pattern↔service relationships**
  - Action: Seed relationships, ensure labels readable
  - File: `client/src/pages/KnowledgeGraph.tsx`

- ❌ **Event Flow: Add sample throughput and error events; fix fetch error**
  - Action: Seed mock events, fix any API errors
  - File: `client/src/pages/EventFlow.tsx`

- ❌ **Network Composer: Ensure Copy YAML/Export work in demo mode**
  - Action: Test and fix export functionality
  - File: `client/src/pages/preview/NodeNetworkComposer.tsx`

### Developer Tools
- ❌ **Remove duplicate Query Assistant and Correlation Trace tabs**
  - Current: These exist as both sidebar tools AND tabs in Developer Tools
  - Action: Remove from Developer Tools, keep only global routes `/chat` and `/trace`
  - File: `client/src/pages/preview/DeveloperTools.tsx`

- ❌ **Add Query Usage Metrics card to Overview**
  - Action: Add card showing queries today, success rate, top intents
  - File: `client/src/pages/preview/DeveloperTools.tsx`

### Tools
- ❌ **AI Query Assistant: Preload 3 smart prompts and answers**
  - Action: Seed chat history with realistic Q&A pairs with timestamps
  - File: `client/src/pages/Chat.tsx`

- ❌ **Correlation Trace: Seed one correlation ID with 3-4 hop trace**
  - Action: Add mock trace data showing clean successful flow
  - File: `client/src/pages/CorrelationTrace.tsx`

### Contract Builder
- ❌ **History: Seed 1-2 prior contracts**
  - Action: Add mock contract history
  - File: Contract Builder component

- ❌ **AI Suggestions: Preload single strong suggestion**
  - Action: Seed one high-quality AI suggestion
  - File: Contract Builder component

### Feature Showcase
- ❌ **Add 2-3 mock tickets to Intelligent Ticketing**
  - Action: Seed tickets in demo
  - File: `client/src/pages/preview/FeatureShowcase.tsx`

- ❌ **Hide 'Pause/Stop' during recording**
  - Action: Add demo mode check to hide controls
  - File: Feature Showcase

- ❌ **Ensure smooth progress animation**
  - Action: Test and optimize animation timing
  - File: Feature Showcase

---

## 📋 Implementation Priority Order

### Phase 1: Critical Blockers (Do First)
1. Demo Mode toggle + context provider
2. Neutralize error banners in demo mode
3. Fix AlertBanner to hide in demo mode
4. Seed realistic Agent Management metrics
5. Fix Routing Intelligence placeholders
6. Fix Pattern Detail Modal metrics inconsistency
7. Align Intelligence Analytics KPIs with script

### Phase 2: Demo Flow Essentials
8. Reorder Code Intelligence metrics (Proven Patterns first)
9. Stub Pattern Discovery endpoint
10. Add "Inject to Agent" CTA on patterns
11. Enhance Duplicate Detection with clusters, best implementation, refactor plan
12. Add Tech Debt "Top 3 to Fix" section
13. Update Agent Performance metrics

### Phase 3: Polish & Credibility
14. Add click affordances globally
15. Fix modal styling
16. Seed mock data for Platform Monitoring services/incidents
17. Seed Architecture & Networks topology
18. Fix Event Flow errors
19. Preload Chat and Trace with sample data
20. Seed Contract Builder history

### Phase 4: Nice-to-Have
21. Query Usage Metrics card
22. Advanced Analytics routing/cache metrics
23. Feature Showcase tickets and animation polish

---

## 🎯 Quick Wins (Can Do Fast)

1. **Normalize comparison text** - Simple find/replace across files
2. **Seed realistic mock data** - Update data source files
3. **Add cursor-pointer classes** - Global CSS update
4. **Hide System Health** - Comment out sidebar link for demo
5. **Remove duplicate tabs** - Remove from Developer Tools component

---

## 📝 Notes

- **System Health**: Explicitly excluded from YC script per requirements
- **Mock Data Badges**: May want to hide these in demo mode (add to Demo Mode toggle)
- **Error States**: All error states should show graceful fallbacks in demo mode
- **Loading States**: Should be minimal/fast in demo mode (consider instant display)



