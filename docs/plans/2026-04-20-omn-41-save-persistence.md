---
epic_id: OMN-22
ticket_id: OMN-41
---

# Plan: Wire Save button to layoutPersistence.write

**Ticket:** [OMN-41](https://linear.app/voxglitch/issue/OMN-41)

## Problem

The Save button does not write to disk. See ticket.

## Change

`DashboardBuilder.handleSave` flushes drafts, then reads the latest `activeDashboard` from the Zustand store and calls `layoutPersistence.write(activeDashboard.name, activeDashboard)`. Fire-and-forget with a `.catch` log; the UI turn does not block on the write.

## Files

1. `src/pages/DashboardBuilder.tsx` — the handler change.
2. `src/pages/DashboardBuilder.test.tsx` — new test asserting Save triggers `layoutPersistence.write` once with the correct name + payload.

## Out of scope

- Remembering last-active dashboard name across reloads (tracked as OMN-42).
- A dashboard-list sidebar for switching / loading multiple dashboards (OMN-42).
- Toasts / user feedback on save success/failure (later UX polish).
