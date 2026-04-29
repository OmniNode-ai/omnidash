# OmniDash — Composable Frame Architecture

**Owner:** `omnidash`
**Last verified:** 2026-04-29
**Verification:** `npm run check && npm run test:run`
**Source plan:** `omni_home/docs/plans/2026-04-10-omnidash-v2-composable-dashboard-design.md`

---

## Overview

OmniDash is a composable dashboard builder. It is a thin frame that discovers, mounts, and arranges self-contained widget components. The frame has no knowledge of specific domains or data pipelines — all domain knowledge lives in widget implementations.

---

## Three Layers

### Layer 1: Frame

The shell application. Responsibilities:

- Auth and navigation
- Theme switching (vanilla-extract CSS custom properties)
- Grid layout (drag, resize, snap)
- Dashboard CRUD (create, save, load, export, import)
- Edit mode / view mode toggle
- Global filter state (time range, shared Zustand context)

The frame does NOT own:

- Data fetching for any specific domain
- Component-to-component event semantics
- Widget business logic

### Layer 2: Component Registry

Discovers and resolves component manifests at startup. Sources:

1. **In-repo MVP manifests** — the `MVP_COMPONENTS` object in `scripts/generate-registry.ts`.
2. **External package manifests** — auto-scanned from any installed `@omninode/*` npm package that declares `"dashboardComponents": "./path/to/manifests.json"` in its `package.json`.

The registry generates `src/registry/component-registry.json`. This file is committed and must be regenerated via `npm run generate:registry` after any manifest change. Do not hand-edit it.

Registry resolution:

- If a manifest entry has a matching `implementationKey` in `src/components/dashboard/index.ts`, the component is loadable.
- If the manifest entry has no matching implementation, the palette shows the component with `status: 'not_implemented'`. The frame does not crash.
- If an implementation exists without a manifest entry, it is invisible to the registry and cannot be placed on dashboards.

### Layer 3: Widgets

Self-contained React components. Each widget:

- Lives under `src/components/dashboard/<widget-name>/`.
- Default-exports a React component that accepts a `config` prop matching its manifest's `configSchema`.
- Owns its own data fetching (via `useProjectionQuery` or direct fixture reads).
- Has at minimum `Empty` and `Populated` Storybook stories (enforced by the compliance test).
- Has unit tests alongside the component file.

Widget variants (2D, 3D) live in the same directory. A dispatcher component reads `config.dimension` and `config.style` and lazy-imports the matching variant. Consumers who pick 2D never load the three.js bundle.

---

## Data Flow

```
omnimarket (Python)                omnidash (TypeScript)
──────────────────                 ─────────────────────
contract.yaml                      Component Registry
  → dashboard_components             → discovers manifests
    (declares what exists)           → matches implementationKey
                                     → mounts in grid cells

handlers/                          src/components/dashboard/
  → Kafka → DB projections           → React components
                                     → own data fetching
                                     → own event subscriptions
```

In dev mode (`VITE_DATA_SOURCE=file`): components read from `./fixtures/<topic>/` JSON files instead of live Kafka topics or HTTP endpoints. No backend required.

In bridge mode (`VITE_DATA_SOURCE=http`): components read via the Express bridge at `http://localhost:3002`. The bridge connects to the running ONEX runtime.

---

## Component Contract Truth Boundary

The contract (declared in omnimarket's `metadata.yaml`) is the coupling surface between backend and frontend.

**The contract declares:**

- The existence and data bindings of a dashboard component.
- What topics, tables, and API endpoints the component needs.
- What events the component emits and consumes.
- The component's `configSchema` (what settings it accepts).

**The contract does NOT deliver:**

- React source code. Frontend implementations live in omnidash under `src/components/dashboard/`.
- Runtime component instances. The frame's registry resolves contract declarations to local React implementations at startup.

**Consequences:**

- Redesigning a component (visual change only): edit TypeScript in omnidash. Backend untouched.
- Changing data shape: update contract + handler in omnimarket, update component in omnidash.
- Adding a new component: declare in contract, implement in omnidash. Registry picks it up on next `npm run generate:registry`.

---

## Cross-Component Communication

Components communicate via three channels:

| Channel | Purpose | When to use |
|---------|---------|-------------|
| Zustand shared context (`src/store/`) | Frame-level UI state: time range, global filters, edit mode | Lightweight shared state that the frame manages |
| `mitt` event bus | Component-to-component coordination: selection, drill-down, highlight | Interactions that do not require backend round-trips |
| Kafka / WebSocket | Domain events with backend significance | Data updates, live metrics, workflow events |

The frame does not mediate component-to-component communication. Components subscribe directly to the mitt bus and to WebSocket topics.

---

## Dashboard Definition Schema

A saved dashboard is a `DashboardDefinition` JSON document (see `shared/types/dashboard.ts`):

```
DashboardDefinition
  id                  UUID
  schemaVersion       "1.0"
  name                string
  layout              DashboardLayoutItem[]
    i                 UUID (grid item key)
    componentName     string (registry key)
    componentVersion  string (semver)
    x, y, w, h        number (grid coordinates)
    config            Record<string,unknown> (validated against configSchema)
  globalFilters       optional time range
  createdAt / updatedAt / author / shared
```

Dashboard definitions are serializable JSON — exportable, importable, versionable. Config validation against `configSchema` happens on load; invalid configs are rejected with a diagnostic.

---

## Ownership Summary

| Concern | Owner |
|---------|-------|
| Frame shell, grid, CRUD | `omnidash` (this repo) |
| Component registry generation | `omnidash` (`scripts/generate-registry.ts`) |
| Widget React implementations | `omnidash` (`src/components/dashboard/`) |
| Dashboard definition schema | `omnidash` (`shared/types/dashboard.ts`) |
| Component manifest schema | `omnidash` (`shared/types/component-manifest.ts`) |
| Contract declarations (what components exist) | `omnimarket` (`metadata.yaml`) |
| Business logic, Kafka handlers, DB projections | `omnimarket` |
| Infrastructure (Kafka, Postgres, Valkey) | `omnibase_infra` |

---

## Related

- [`docs/reference/dashboard-definition.md`](../reference/dashboard-definition.md)
- [`docs/reference/component-manifest.md`](../reference/component-manifest.md)
- [`docs/development.md`](../development.md)
- Source plan (context): `omni_home/docs/plans/2026-04-10-omnidash-v2-composable-dashboard-design.md`
