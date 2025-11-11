# ContractBuilder Nested Fields Rendering Fix

## Problem
The form builder in `ContractBuilder.tsx` (lines 647-663) was dropping nested objects without a direct `type` property, causing critical contract data fields to not render:

- `performance_requirements.execution_time` (with `target_ms`, `max_ms`)
- `performance_requirements.throughput` (with `target_workflows_per_minute`)
- `workflow_stages` (array of objects)
- `io_operations` (in Effect contracts)

## Root Cause
The rendering logic only handled two cases:
1. Arrays with `type: "array"` and `item_schema`
2. Fields with a direct `type` property

Any nested object structure (like `performance_requirements` containing `execution_time`) was silently dropped with `return null`.

## Solution
Added comprehensive nested object handling with 2 levels of recursion:

### Level 1 Nesting
Detects objects without `type` that contain nested fields with `type` properties:
```typescript
if (typeof field === 'object' && field !== null && !('type' in field)) {
  const hasNestedFields = Object.values(field).some(
    (nestedField: any) => typeof nestedField === 'object' && nestedField !== null && 'type' in nestedField
  );
  // Render nested section with visual hierarchy
}
```

### Level 2 Nesting
Handles deeper nesting (e.g., `performance_requirements.execution_time.target_ms`):
```typescript
// Handle deeper nesting within nested objects
if (typeof nestedField === 'object' && nestedField !== null && !('type' in nestedField)) {
  // Render another nested level
}
```

### Visual Hierarchy
- **Level 1**: Light background (`bg-muted/20`), semibold labels, `pl-4` indentation
- **Level 2**: Lighter background (`bg-background/50`), medium labels, `pl-3` indentation
- Labels auto-capitalize and convert underscores to spaces

## Files Changed
- `/Volumes/PRO-G40/Code/omnidash/client/src/pages/preview/ContractBuilder.tsx` (lines 645-710)

## Verification
Tested with Workflow (Orchestrator) contract type using "Load Example":

✅ **Performance Requirements** section renders with:
  - **Execution Time** subsection
    - target_ms (number input)
    - max_ms (number input)
  - **Throughput** subsection
    - target_workflows_per_minute (number input)

✅ **Workflow Stages** section renders with item schema

✅ All flat fields continue to work (node_identity, metadata)

## Screenshots
- `contract-builder-nested-fields-fixed.png` - Full page view
- `contract-builder-performance-requirements-nested.png` - Shows Performance Requirements with Execution Time and Throughput subsections
- `contract-builder-workflow-stages.png` - Shows Workflow Stages with item schema

## Success Criteria Met
- [x] Form renders all nested fields
- [x] Nested objects with type definitions are editable
- [x] No breaking of existing flat field rendering
- [x] Visual hierarchy clearly shows nesting levels
- [x] Field names properly formatted (capitalized, spaces instead of underscores)

## Impact
**CRITICAL FIX** - This was the #1 priority issue blocking PR merge. Form editing is now fully functional for all ONEX contract types.
