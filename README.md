# OmniDash

[![CI](https://github.com/OmniNode-ai/omnidash/actions/workflows/ci.yml/badge.svg)](https://github.com/OmniNode-ai/omnidash/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**OmniDash** is the composable widget dashboard for the OmniNode platform. It is a Vite + React 19 single-page application that discovers, mounts, and arranges per-widget components in a drag-and-drop grid.

OmniDash is the successor to the archived Next.js analytics dashboard (`omnidash-archived`). Each widget lives in its own self-contained directory, lazy-loads heavy 3D bundles only when selected, and runs against local fixtures by default so developers can work without any backing infrastructure.

OmniDash follows the [OmniNode deterministic truth doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md): widgets render authoritative projection/API data and presentation-only state. They must not read backend databases directly or recreate projection truth in React.

---

## Who Uses This

- Platform developers building or extending dashboard widgets.
- OmniMarket package authors declaring dashboard component contracts.
- Platform operators monitoring real-time ONEX (OmniNode eXecution) runtime events through deployed dashboards.

---

## What This Repo Owns

- The composable dashboard frame: grid layout, palette, CRUD, theme switching, import/export.
- The component registry: discovers manifests declared by `@omninode/*` npm packages and in-repo MVP manifests.
- Per-widget component implementations under `src/components/dashboard/<widget-name>/`.
- Data source adapters: `FileSnapshotSource` (dev default), `HttpSnapshotSource` (Express bridge).
- The dashboard definition schema: `shared/types/dashboard.ts` (`DashboardDefinition`, `DashboardLayoutItem`).
- The component manifest schema: `shared/types/component-manifest.ts` (`ComponentManifest`).
- The Express bridge server under `server/` for HTTP data source mode.
- Storybook configuration and widget stories for visual testing.

## What This Repo Does Not Own

- ONEX runtime business logic → `omnimarket`
- Kafka event bus and infrastructure → `omnibase_infra`
- Node execution contracts and validation → `omnibase_core`
- Intelligence nodes (intent, drift, review) → `omniintelligence`
- Legacy v1 Next.js analytics dashboard → `omnidash-archived` (archived, read-only)

---

## Current Status

Parts 1 through 4 of the composable dashboard implementation are complete:

| Part | Description | Status |
|------|-------------|--------|
| 1 | Frame, theme system, Zustand store, query provider | Done |
| 2 | Component registry, dashboard builder, CRUD service | Done |
| 3 | MVP widget set, templates, proof of life | Done |
| 4 | Conversational dashboard builder | Done |

See [`docs/implementation-status.md`](docs/implementation-status.md) for a detailed breakdown.

---

## Quickstart

```bash
npm install
npm run dev
```

The dev server starts in the contract default mode, `http` (`contract.yaml`, flipped from `postgres` in OMN-14642), which proxies projection reads through the Express bridge to the projection-api. The base contract deliberately carries no backend URL, so an unconfigured `http` mode fails loudly rather than reading nowhere — set `contract.local.yaml`'s `data_source.url` or `OMNIDASH_BRIDGE_URL` to a running projection-api instance before `npm run dev`.

To run with zero external services instead, override to `file` mode, which reads static JSON from `./fixtures/`:

```bash
VITE_DATA_SOURCE=file npm run dev
```

---

## Common Workflows

### Run type checking

```bash
npm run check
```

### Run tests (CI mode)

```bash
npm run test:run
```

### Run tests in watch mode

```bash
npm run test
```

### Run linting

```bash
npm run lint
```

### Add a new widget

After creating the component under `src/components/dashboard/<name>/` and adding its manifest entry in `scripts/generate-registry.ts`:

```bash
npm run generate:registry
```

### Regenerate all generated artifacts

```bash
npm run types:generate
npm run generate:fixtures
npm run generate:registry
```

### Run Storybook

```bash
npm run storybook
```

---

## Architecture Summary

OmniDash has three layers:

**Frame** — the shell. Owns auth, navigation, theme switching, grid layout, and dashboard CRUD. Has no knowledge of specific domains or data.

**Component Registry** — discovers component manifests from `@omninode/*` npm packages and in-repo MVP declarations. Resolves manifest entries to lazy-loaded React implementations.

**Widgets** — self-contained React components. Each widget owns its own data fetching, fixtures, Storybook stories, and tests. 2D and 3D variants live in the same directory.

See [`docs/architecture/composable-frame.md`](docs/architecture/composable-frame.md) for the full architecture.

### Widget Directory Layout

The component truth boundary is documented in [`src/components/dashboard/README.md`](src/components/dashboard/README.md). Read it before adding or modifying any widget.

Canonical example: `src/components/dashboard/cost-trend/`

```
cost-trend/
  CostTrend.tsx              # dispatcher — picks 2D or 3D variant
  CostTrend2D.tsx            # flat ECharts implementation
  CostTrend3DArea.tsx        # three.js stacked-area scene
  CostTrend3DBars.tsx        # three.js stacked-bar scene
  StackedChart.tsx           # shared internal helper
  CostTrend2D.stories.tsx
  CostTrend3DArea.stories.tsx
  CostTrend3DBars.stories.tsx
  CostTrend.test.tsx
  CostTrend2D.test.tsx
  CostTrend3DArea.test.tsx
  CostTrend3DBars.test.tsx
```

The dispatcher (`CostTrend.tsx`) reads `config.dimension` (`'2d'` or `'3d'`) and `config.style` (`'area'` or `'bar'`) and lazy-imports the matching variant. A consumer that selects 2D never pays the cost of loading three.js.

### Key Source Locations

| Path | Purpose |
|------|---------|
| `src/components/dashboard/` | All widget implementations |
| `src/components/dashboard/README.md` | Component truth contract (read before adding widgets) |
| `src/components/dashboard/index.ts` | Lazy-import map (`implementationKey` → component) |
| `scripts/generate-registry.ts` | MVP manifest definitions and registry generation |
| `src/registry/component-registry.json` | Generated registry (do not hand-edit) |
| `src/data-source/` | Data source adapters |
| `src/store/` | Zustand state slices |
| `shared/types/` | Dashboard definition and component manifest schemas |
| `server/` | Express HTTP bridge for `VITE_DATA_SOURCE=http` mode |

---

## Documentation Map

The platform documentation lives in the OmniNode knowledge base. Every path below is a pointer stub in this repo whose full content is a knowledge-base page.

Full documentation → https://github.com/OmniNode-ai/knowledge-base

| In-repo pointer | Canonical page |
|---|---|
| [`docs/architecture/composable-frame.md`](docs/architecture/composable-frame.md) | [OmniDash Composable Frame Architecture](https://github.com/OmniNode-ai/knowledge-base/blob/main/architecture/omnidash-composable-frame.md) — three-layer frame, registry and widgets |
| [`src/components/dashboard/README.md`](src/components/dashboard/README.md) | [Dashboard Component Truth Boundary](https://github.com/OmniNode-ai/knowledge-base/blob/main/architecture/omnidash-component-truth-boundary.md) — read before adding or modifying a widget |
| [`docs/development.md`](docs/development.md) | [OmniDash Development Guide](https://github.com/OmniNode-ai/knowledge-base/blob/main/guides/omnidash-development.md) — commands, data-source modes, registry generation, Storybook |
| [`docs/reference/dashboard-definition.md`](docs/reference/dashboard-definition.md) | [DashboardDefinition Schema](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-dashboard-definition.md) |
| [`docs/reference/component-manifest.md`](docs/reference/component-manifest.md) | [ComponentManifest Schema](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-component-manifest.md) |
| [`src/components/ui/typography/README.md`](src/components/ui/typography/README.md) | [Typography Primitives — Text and Heading](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-typography-primitives.md) |

### Decision records

The five decision records below were renumbered into the knowledge base's platform-wide decision ledger; the in-repo paths keep their original names as pointer stubs.

| In-repo pointer | Canonical page |
|---|---|
| [`docs/adr/001-typography-system.md`](docs/adr/001-typography-system.md) | [ADR-0039 — Dashboard Typography System](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0039-omnidash-typography-system.md) |
| [`docs/adr/002-storybook-widget-coverage.md`](docs/adr/002-storybook-widget-coverage.md) | [ADR-0040 — Storybook Coverage for Every Dashboard Widget](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0040-omnidash-storybook-widget-coverage.md) |
| [`docs/adr/003-baselines-roi-card-stay-bespoke.md`](docs/adr/003-baselines-roi-card-stay-bespoke.md) | [ADR-0041 — BaselinesROICard Stays Bespoke](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0041-omnidash-baselines-roi-card-stays-bespoke.md) |
| [`docs/adr/004-cross-renderer-empty-state-gate.md`](docs/adr/004-cross-renderer-empty-state-gate.md) | [ADR-0042 — Cross-Renderer Typed Empty-State Gate](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0042-omnidash-cross-renderer-typed-empty-state-gate.md) |
| [`docs/adr/005-rjsf-discriminator-union.md`](docs/adr/005-rjsf-discriminator-union.md) | [ADR-0043 — Stock @rjsf for Pydantic-Generated JSON Schema](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0043-omnidash-rjsf-discriminated-union-handling.md) |

### Stays in this repo

These are not knowledge-base content and have no pointer:

- [`docs/implementation-status.md`](docs/implementation-status.md) — Parts 1–4 implementation status
- [`db/README.md`](db/README.md), [`deploy/keycloak/README.md`](deploy/keycloak/README.md), [`server/onboarding/README.md`](server/onboarding/README.md), [`docs/beta-runbook.md`](docs/beta-runbook.md) — this deployment's own database, auth-realm and onboarding procedures
- `docs/requirements-audit.md`, `docs/ui-rebuild-traceability.md`, `docs/ux-polish-checklist.md`, `docs/widget-config-audit.md` — dated audit records, kept as snapshots
- [CONTRIBUTING.md](CONTRIBUTING.md) — branch, commit, and review conventions
- [CLAUDE.md](CLAUDE.md) — agent and developer context

---

## Development and Test Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR (file mode by default) |
| `npm run check` | TypeScript-only check (`tsc --noEmit`) |
| `npm run test:run` | Vitest single run (CI mode) |
| `npm run test` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint with zero warnings |
| `npm run build` | Type-check then production build |
| `npm run generate:registry` | Rewrite `src/registry/component-registry.json` |
| `npm run generate:fixtures` | Regenerate fixture snapshots |
| `npm run types:generate` | Regenerate types under `src/shared/types/generated/` |
| `npm run storybook` | Storybook on port 6006 |

See [`docs/development.md`](docs/development.md) for a complete development guide.

---

## Security, Contributing, and License

- [SECURITY.md](SECURITY.md) — security policy and vulnerability reporting
- [CONTRIBUTING.md](CONTRIBUTING.md) — branch, commit, and review conventions
- [LICENSE](LICENSE) — MIT
