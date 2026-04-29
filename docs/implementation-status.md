# OmniDash — Implementation Status

**Owner:** `omnidash`
**Last verified:** 2026-04-29
**Verification:** `npm run check && npm run test:run`

This document summarizes which parts of the OmniDash composable dashboard are implemented. A new developer should be able to start with this page and reach working code without opening the phased plan files.

---

## Summary

All four implementation parts are complete. The application runs, type-checks, and tests pass.

| Part | Description | Status |
|------|-------------|--------|
| 1 | Frame, theme system, Zustand store, query provider | Done |
| 2 | Component registry, dashboard builder, CRUD service | Done |
| 3 | MVP widget set, templates, proof of life | Done |
| 4 | Conversational dashboard builder | Done |

---

## Part 1: Frame, Theme System, Store, Query Provider

**What was built:**

- Vite + React 19 SPA with TypeScript, vanilla-extract, TailwindCSS.
- Two-mode data source system controlled by `VITE_DATA_SOURCE` env var:
  - `file` (default): reads JSON snapshots from `./fixtures/`. Zero infra required.
  - `http`: proxies to Express bridge at `localhost:3002`.
- Zustand store with slices for edit mode, layout state, and global filters.
- TanStack Query provider for data fetching.
- Typography token system: all widget text goes through `<Text>` / `<Heading>` from `src/components/ui/typography`. ESLint rule `local/no-typography-inline` enforces this.
- Theme tokens in `src/styles/globals.css :root`.

**Key files:**

- `src/data-source/` — `FileSnapshotSource`, `HttpSnapshotSource`, `ProtocolSnapshotSource`
- `src/store/` — Zustand slices (edit mode, layout, filters)
- `src/components/ui/typography.tsx` — `<Text>`, `<Heading>` components
- `src/styles/globals.css` — CSS custom property tokens

---

## Part 2: Component Registry, Dashboard Builder, CRUD Service

**What was built:**

- Component registry that discovers manifests from two sources:
  1. `MVP_COMPONENTS` in `scripts/generate-registry.ts` (in-repo widgets).
  2. Auto-scanned `@omninode/*` npm packages that declare `"dashboardComponents"` in their `package.json`.
- `src/registry/component-registry.json` — generated output (committed, do not hand-edit).
- Dashboard builder UI: palette of available components, drag-and-drop grid, per-widget config panel.
- CRUD service: create, save, load, delete, export, import dashboards as `DashboardDefinition` JSON.
- Layout persistence to `./dashboard-layouts/` (gitignored, local only).

**Key files:**

- `scripts/generate-registry.ts` — registry source of truth
- `src/registry/component-registry.json` — generated registry
- `src/components/dashboard/ComponentPalette.tsx` — widget palette
- `src/components/dashboard/DashboardGrid.tsx` — grid layout
- `src/layout/layout-persistence.ts` — layout save/load
- `shared/types/dashboard.ts` — `DashboardDefinition`, `DashboardLayoutItem`
- `shared/types/component-manifest.ts` — `ComponentManifest`

---

## Part 3: MVP Widget Set, Templates, Proof of Life

**What was built:**

- Seven MVP widgets, each following the per-widget directory layout:
  - `cost-trend/` — 2D (ECharts) and 3D (three.js) stacked cost chart
  - `activity-heatmap/` — calendar heatmap of workflow activity
  - `quality-score-panel/` — aggregated quality score display
  - `health-monitor/` — real-time service health indicators
  - `execution-graph/` — interactive node-link execution trace
  - `delegation-metrics/` — delegation accuracy and distribution
  - `node-registry/` — registered node listing with status
- Storybook stories for all widgets (at minimum `Empty` and `Populated` exports).
- Compliance test `src/storybook-coverage-compliance.test.ts` that enforces story coverage on every `npm test`.
- Dashboard templates for common observability layouts.

**Key files:**

- `src/components/dashboard/<widget-name>/` — all widget implementations
- `src/components/dashboard/index.ts` — lazy-import map
- `src/storybook/fixtures/` — shared Storybook fixture data
- `src/storybook-coverage-compliance.test.ts` — Storybook compliance enforcement

---

## Part 4: Conversational Dashboard Builder

**What was built:**

- Conversational builder interface for generating and modifying dashboards via natural language.
- `page-agent` integration for AI-driven dashboard composition.
- XYFlow-based canvas for visualizing proposed dashboard layouts before applying them.
- Config generation from natural language instructions validated against each widget's `configSchema`.

**Key files:**

- `src/pages/DashboardBuilder.tsx` — main builder page
- `@xyflow/react` — canvas for layout visualization

---

## Known Gaps and Follow-On Work

| Gap | Notes |
|-----|-------|
| External package dynamic code loading | External `@omninode/*` widgets surface in palette with `status: 'not_implemented'` unless their `implementationKey` is also in the local `componentImports` map. Full dynamic loading is a future phase. |
| Auth integration | Auth stubs are present but the frame does not yet connect to the ONEX auth service. |
| WebSocket live data | Widgets read fixture files in dev mode. Live WebSocket subscriptions are wired but require a running ONEX runtime. |

---

## Related

- [`docs/architecture/composable-frame.md`](architecture/composable-frame.md) — architecture detail
- [`docs/development.md`](development.md) — how to run and extend the app
- Source plans (context):
  - `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-1.md`
  - `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-2.md`
  - `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-3.md`
  - `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-4.md`
