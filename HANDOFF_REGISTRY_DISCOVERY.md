# Registry Discovery Dashboard - Handoff Document

**Last Updated**: 2026-01-21 (Session 2)
**Ticket**: OMN-1278 (Contract-Driven Dashboard - Registry Discovery)
**Branch**: `jonah/omn-1278-contract-driven-dashboard-registry-discovery`

---

## Quick Start for Next Session

```bash
# Navigate to project
cd /Volumes/PRO-G40/Code/omnidash

# Start dev server (port 3000!)
PORT=3000 npm run dev

# Open dashboard
open http://localhost:3000/discovery

# Check for TypeScript errors
npm run check
```

**Current State**: Dashboard is fully functional with all major bugs fixed.

**Summary Cards Now Show**: 12 Total | 5 Active | 2 Pending | 1 Failed (varies with mock data)

**What Works**:
- Summary metric cards show correct counts
- Health status grid (4 columns, replaced pie chart)
- Interactive nodes table with clickable rows
- Dismissable contract-driven banner (persisted to localStorage)
- Collapsible filters (collapsed by default)
- Node detail slide-out panel
- Keyboard shortcuts (R=refresh, F=focus search, Esc=close panel)

**Known Issues (Pre-existing)**:
- WebSocket connection errors in console (not related to this session's work)
- The `/registry` route still exists but is not linked in sidebar

---

## Session 2: UI/UX Polish (Current Session)

### 1. Fixed Summary Cards Showing Zero

**Root Cause**: DashboardRenderer widgets used nested keys like `summary.total_nodes` but the widget system resolves keys via `data[key]` directly, not nested paths.

**Fix**: Flattened data in `transformRegistryData()` function:

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/lib/configs/registry-discovery-dashboard.ts` (lines 204-214)

```typescript
return {
  ...data,
  healthStatusItems,
  // Flatten summary fields for MetricCard widgets (they use data[key] directly, not nested paths)
  total_nodes: data.summary.total_nodes,
  active_nodes: data.summary.active_nodes,
  pending_nodes: data.summary.pending_nodes,
  failed_nodes: data.summary.failed_nodes,
  // Flatten by_type for chart widget
  nodeTypeDistribution: data.summary.by_type,
};
```

**Also Updated**: Widget configs to use flattened keys (lines 72-150):

```typescript
// Before:
metric_key: 'summary.total_nodes',

// After:
metric_key: 'total_nodes',
```

### 2. Removed Overlapping Pie Chart

**Problem**: Node Types pie chart had legend text overlapping the chart segments.

**Fix**: Replaced pie chart widget with a full-width status grid (4 columns) showing health status.

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/lib/configs/registry-discovery-dashboard.ts` (lines 152-171)

```typescript
// Row 1: Instance health status (full width - simpler than pie chart that had overlap issues)
{
  widget_id: 'health-status',
  title: 'Instance Health',
  description: 'Live service health from Consul',
  row: 1,
  col: 0,
  width: 12,
  height: 2,
  config: {
    config_kind: 'status_grid',
    items_key: 'healthStatusItems',
    id_field: 'id',
    label_field: 'label',
    status_field: 'status',
    columns: 4,
    show_labels: true,
    compact: false,
  },
},
```

### 3. Removed Duplicate Tables

**Problem**: DashboardRenderer had Data Table widgets AND there was a custom "Registered Nodes" table, causing duplication.

**Fix**: Removed `nodes-table` and `instances-table` widget configs from DashboardRenderer. The custom interactive table in `RegistryDiscovery.tsx` is now the only table (supports click-to-expand).

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/lib/configs/registry-discovery-dashboard.ts` (line 172)

```typescript
// NOTE: Tables removed - using custom interactive table in RegistryDiscovery.tsx instead
```

### 4. Made Banner Dismissable

**Added**: X button to "Contract-driven dashboard" banner with localStorage persistence.

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/pages/RegistryDiscovery.tsx`

State and handler (lines 84, 158-180):

```typescript
const BANNER_DISMISSED_KEY = 'registry-discovery-banner-dismissed';

const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
  }
  return false;
});

const dismissBanner = useCallback(() => {
  setIsBannerDismissed(true);
  localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
}, []);
```

Banner JSX (lines 379-398):

```tsx
{!isBannerDismissed && (
  <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-3">
    <div className="flex items-center gap-3">
      <Zap className="h-4 w-4 text-primary flex-shrink-0" />
      <p className="text-sm text-muted-foreground flex-1">
        <span className="font-medium text-foreground">Contract-driven dashboard</span>
        {' — '}nodes auto-register their capabilities. No hardcoded widgets.
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0 hover:bg-destructive/10"
        onClick={dismissBanner}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  </div>
)}
```

### 5. Made Filters Collapsible

**Added**: Filters now collapsed by default, expand on click or when filters are active.

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/pages/RegistryDiscovery.tsx`

Import (line 51-54):

```typescript
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
```

State (line 164):

```typescript
const [isFiltersOpen, setIsFiltersOpen] = useState(false);
```

JSX (lines 512-624):

```tsx
<Collapsible open={isFiltersOpen || !!hasFilters} onOpenChange={setIsFiltersOpen}>
  <div className="flex items-center gap-2">
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform',
            (isFiltersOpen || !!hasFilters) && 'rotate-180'
          )}
        />
      </Button>
    </CollapsibleTrigger>
    {/* Clear button when filters active */}
  </div>
  <CollapsibleContent>
    {/* Filter dropdowns */}
  </CollapsibleContent>
</Collapsible>
```

### 6. Removed "Node Registry" from Sidebar

**User Request**: Only one registry dashboard needed.

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/components/app-sidebar.tsx`

The dashboards array no longer includes the `/registry` route. Only `/discovery` (Registry Discovery) remains.

### 7. Fixed TypeScript Errors

**A. `capabilities` type mismatch** (fixed in Session 1, verified working)

**B. Implicit `any` in map callbacks**

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/pages/RegistryDiscovery.tsx` (line 714)

```typescript
// Before (implicit any):
{filteredData.nodes.map((node, idx) => {

// After (explicit type):
{filteredData.nodes.map((node: RegisteredNodeInfo, idx: number) => {
```

**C. Fixed `idx` variable reference after removal**

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/pages/RegistryDiscovery.tsx` (lines 721, 725)

```typescript
// Using node.node_id instead of idx for key:
key={node.node_id || node.name}

// Still using idx for zebra striping:
idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
```

**D. NodeDetailPanel capabilities mapping**

**File**: `/Volumes/PRO-G40/Code/omnidash/client/src/components/NodeDetailPanel.tsx` (lines 325-329)

```typescript
// Added explicit types:
{capabilities.map((cap: string, idx: number) => (
  <Badge key={idx} variant="outline" className="text-xs font-mono bg-muted/50">
    {cap}
  </Badge>
))}
```

---

## Session 1: Critical Bug Fixes (Previous Session)

### Fixed Black Screen Bug

**Root Cause 1**: `capabilities` expected as `string` but API returns `string[]`

**Root Cause 2**: `NodeState` expected lowercase (`'active'`) but API returns UPPERCASE (`'ACTIVE'`)

These were fixed by:

1. Updating `RegisteredNodeInfo.capabilities` type from `string` to `string[]`
2. Updating `NODE_STATE_CONFIG` keys to match `RegistrationState` enum values
3. Updating filter logic to use UPPERCASE state names

**See Previous Section in Git History for Full Details**

---

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `/client/src/pages/RegistryDiscovery.tsx` | ~905 | Main page component |
| `/client/src/lib/configs/registry-discovery-dashboard.ts` | ~363 | Dashboard config, types, mock data, transform |
| `/client/src/components/NodeDetailPanel.tsx` | ~507 | Detail panel, state/type configs |
| `/client/src/components/app-sidebar.tsx` | ~168 | Sidebar navigation |
| `/shared/registry-types.ts` | ~226 | Shared TypeScript types (SOURCE OF TRUTH) |

---

## Type System Reference

### Source of Truth: `/shared/registry-types.ts`

```typescript
// Node types (4-node architecture)
export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

// Registration states (8 states) - UPPERCASE!
export type RegistrationState =
  | 'PENDING_REGISTRATION'
  | 'ACCEPTED'
  | 'AWAITING_ACK'
  | 'ACK_RECEIVED'
  | 'ACTIVE'
  | 'ACK_TIMED_OUT'
  | 'LIVENESS_EXPIRED'
  | 'REJECTED';

// Health statuses - lowercase!
export type HealthStatus = 'passing' | 'warning' | 'critical' | 'unknown';
```

### State Categorization

```typescript
// Active states (green):
['ACTIVE']

// Pending states (yellow):
['PENDING_REGISTRATION', 'AWAITING_ACK', 'ACCEPTED', 'ACK_RECEIVED']

// Failed states (red):
['REJECTED', 'LIVENESS_EXPIRED', 'ACK_TIMED_OUT']
```

---

## Testing Checklist

- [x] Summary cards show correct counts (not zero)
- [x] Banner can be dismissed and stays dismissed on refresh
- [x] Filters collapse/expand correctly
- [x] Filters auto-expand when filter values are set
- [x] Node detail panel opens when clicking a row
- [x] All 8 registration states render with correct styling
- [x] Filter dropdowns show all state options
- [x] Capabilities display as array of badges
- [x] TypeScript compiles cleanly (`npm run check`)
- [ ] WebSocket connection works (pre-existing issue)

---

## Git Status

```
Modified files (uncommitted):
M client/src/components/app-sidebar.tsx
M client/src/components/NodeDetailPanel.tsx
M client/src/lib/configs/registry-discovery-dashboard.ts
M client/src/pages/RegistryDiscovery.tsx
```

**Previous Commit**: `ed34508 feat: Contract-driven registry discovery dashboard (OMN-1278)`

---

## Suggested Commit Message

```
fix(registry-discovery): UI polish and data display fixes

- Fix summary cards showing zero by flattening data keys
- Replace overlapping pie chart with status grid
- Remove duplicate tables (keep interactive table only)
- Add dismissable banner with localStorage persistence
- Make filters collapsible (collapsed by default)
- Remove "Node Registry" from sidebar navigation
- Fix TypeScript implicit any errors in map callbacks

OMN-1278
```

---

## Remaining Work / Future Improvements

1. **WebSocket connection errors** - Investigate console errors (pre-existing)
2. **Remove `/registry` route entirely** - Route exists but is unlinked
3. **Add pagination** - Currently showing all nodes
4. **Add sorting** - Click column headers to sort
5. **Add CSV export** - Export filtered node list
6. **Add instance actions** - Restart, health check buttons

---

## Architecture Notes

**CQRS Pattern A** (pragmatic baseline):

```
Event Bus (Kafka/Redpanda)
    |
    v
Projection Store (PostgreSQL)  <-- "State Now" read model
    |
    v
REST API  <-- Snapshot + filters + pagination
    |
    v
WebSocket  <-- Deltas after cold start
    |
    v
Dashboard UI
```

**Contract-Driven Design**:
- Nodes self-register their capabilities
- Dashboard widgets are driven by data contracts
- No hardcoded widget configurations for individual nodes
- Widget types: `metric_card`, `chart`, `status_grid`, `data_table`
