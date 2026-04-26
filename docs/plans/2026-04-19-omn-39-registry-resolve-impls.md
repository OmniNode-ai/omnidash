---
epic_id: OMN-22
ticket_id: OMN-39
---

# Plan: Call resolveImplementations() on registry construction

**Ticket:** [OMN-39](https://linear.app/voxglitch/issue/OMN-39)

## Problem

`ComponentRegistry.resolveImplementations()` is never called in the live app. All components stay `not_implemented`. See ticket for details.

## Change

Add a `void r.resolveImplementations()` call inside the existing `useMemo` in `src/registry/RegistryProvider.tsx`. The current implementation is synchronous under the hood, so the registry is ready by first render.

## Files

1. `src/registry/RegistryProvider.tsx` — the one-line fix.
2. `src/registry/RegistryProvider.test.tsx` (new) — test confirming palette components render with `status: 'available'` after provider mount.

## Out of scope

- Dynamic async loading of package components.
- Gate-rendering on a resolved-ready flag (not needed until real async lookups land).
