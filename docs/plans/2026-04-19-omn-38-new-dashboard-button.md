---
epic_id: OMN-22
ticket_id: OMN-38
---

# Plan: New Dashboard button in Header

**Ticket:** [OMN-38](https://linear.app/voxglitch/issue/OMN-38)
**Parent epic:** [OMN-22](https://linear.app/voxglitch/issue/OMN-22)

## Problem

The app has no UI to create a dashboard. `createEmptyDashboard()` exists in `shared/types/dashboard.ts` but is only called from tests. On first load, `DashboardBuilder` renders "No dashboard selected" with no escape. This is pre-existing from the original zip — not a Part 3 regression — but it blocks Part 3 acceptance criterion #1 (the manual browser verification can't begin without a dashboard).

## Scope

Minimum-viable UI to create a dashboard. No dashboard-list picker (future work); just "new + name + go".

## Changes

1. `src/components/frame/Header.css.ts` — add styles for the new button and inline form.
2. `src/components/frame/Header.tsx` — add "New Dashboard" button. On click, reveals an inline form (input + Create + Cancel). Submit calls `setActiveDashboard(createEmptyDashboard(name, 'clone45'))`.
3. `src/components/frame/Header.test.tsx` — new test confirming the submit path creates an active dashboard.

## Out of scope

- Dashboard picker / list view.
- Author selection.
- Duplicate-name handling.
- Dashboard delete / rename.

## Definition of Done

- [ ] Header button visible, opens inline form.
- [ ] Submit creates an empty dashboard and renders the grid empty state.
- [ ] Cancel closes the form without side effect.
- [ ] New test passes; all existing tests still pass; `tsc --noEmit` clean.
