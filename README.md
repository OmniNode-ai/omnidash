<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/omninode-inline-white.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/brand/omninode-inline-full-color.svg">
    <img alt="omninode" src="docs/assets/brand/omninode-inline-full-color.svg" width="420">
  </picture>
</p>

# OmniDash

[![CI](https://github.com/OmniNode-ai/omnidash/actions/workflows/ci.yml/badge.svg)](https://github.com/OmniNode-ai/omnidash/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**OmniDash** is the composable widget dashboard for the OmniNode platform — a Vite + React 19 single-page application that discovers, mounts, and arranges per-widget components in a drag-and-drop grid. Each widget lives in its own self-contained directory, lazy-loads heavy 3D bundles only when selected, and runs against local fixtures by default so developers can work without any backing infrastructure.

OmniDash follows the [OmniNode deterministic truth doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md): widgets render authoritative projection/API data and presentation-only state. They must not read backend databases directly or recreate projection truth in React.

---

## Documentation

**Documentation for this repo lives in the OmniNode knowledge base, not in this repo.** There are no in-repo docs and no pointer stubs — each topic below links straight to its canonical page.

| Knowledge base | Scope |
|---|---|
| **https://github.com/OmniNode-ai/knowledge-base** | Public — architecture, decision records, guides, schema references |
| **https://github.com/OmniNode-ai/knowledge-base-internal** | Internal — operational runbooks with real (non-parameterized) deployment detail |

### Architecture and reference (public knowledge base)

| Topic | Canonical page |
|---|---|
| Architecture | [OmniDash Composable Frame Architecture](https://github.com/OmniNode-ai/knowledge-base/blob/main/architecture/omnidash-composable-frame.md) — the three-layer frame (frame / component registry / widgets) |
| Component truth boundary | [Dashboard Component Truth Boundary](https://github.com/OmniNode-ai/knowledge-base/blob/main/architecture/omnidash-component-truth-boundary.md) — read before adding or modifying a widget |
| Development guide | [OmniDash Development Guide](https://github.com/OmniNode-ai/knowledge-base/blob/main/guides/omnidash-development.md) — commands, data-source modes, registry generation, Storybook, widget directory layout |
| DashboardDefinition schema | [DashboardDefinition Schema](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-dashboard-definition.md) |
| ComponentManifest schema | [ComponentManifest Schema](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-component-manifest.md) |
| Typography primitives | [Typography Primitives — Text and Heading](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-typography-primitives.md) |
| Implementation status | [OmniDash Implementation Status](https://github.com/OmniNode-ai/knowledge-base/blob/main/reference/omnidash-implementation-status.md) — Parts 1–4 breakdown |

### Decision records (public knowledge base)

| Decision | Canonical page |
|---|---|
| Dashboard typography system | [ADR-0039](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0039-omnidash-typography-system.md) |
| Storybook coverage for every dashboard widget | [ADR-0040](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0040-omnidash-storybook-widget-coverage.md) |
| BaselinesROICard stays bespoke | [ADR-0041](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0041-omnidash-baselines-roi-card-stays-bespoke.md) |
| Cross-renderer typed empty-state gate | [ADR-0042](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0042-omnidash-cross-renderer-typed-empty-state-gate.md) |
| Stock @rjsf for Pydantic-generated JSON schema | [ADR-0043](https://github.com/OmniNode-ai/knowledge-base/blob/main/adrs/ADR-0043-omnidash-rjsf-discriminated-union-handling.md) |

### Operational runbooks (internal knowledge base)

The source these describe still lives here — [`db/` migrations](db/), [`deploy/keycloak/`](deploy/keycloak/), [`server/onboarding/`](server/onboarding/) — but the procedures do not.

| Runbook | Canonical page |
|---|---|
| Beta deployment | [OmniDash Beta Runbook](https://github.com/OmniNode-ai/knowledge-base-internal/blob/main/runbooks/omnidash-beta-runbook.md) |
| Tenant RLS migrations | [OmniDash Database RLS Migrations](https://github.com/OmniNode-ai/knowledge-base-internal/blob/main/runbooks/omnidash-database-rls-migrations.md) |
| Keycloak realm config | [OmniDash Keycloak Realm Config](https://github.com/OmniNode-ai/knowledge-base-internal/blob/main/runbooks/omnidash-keycloak-realm-config.md) |
| Self-service onboarding | [OmniDash Self-Service Onboarding](https://github.com/OmniNode-ai/knowledge-base-internal/blob/main/runbooks/omnidash-self-service-onboarding.md) |

Markdown that stays in this repo is limited to the GitHub-surface and agent-configuration set — this `README.md`, `CLAUDE.md`, `.claude/`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE`, and `.github/` — enforced on every PR by the `kb-doc-gate` check in `strict` mode (see [`.kb-doc-gate.yaml`](.kb-doc-gate.yaml)).

---

## What This Repo Owns

- The composable dashboard frame: grid layout, palette, CRUD, theme switching, import/export.
- The component registry: discovers manifests declared by `@omninode/*` npm packages and in-repo MVP manifests.
- Per-widget component implementations under `src/components/dashboard/<widget-name>/`.
- Data source adapters: `FileSnapshotSource` (dev default), `HttpSnapshotSource` (Express bridge).
- The schemas: `shared/types/dashboard.ts` (`DashboardDefinition`) and `shared/types/component-manifest.ts` (`ComponentManifest`).
- The Express bridge server under `server/` for HTTP data source mode.
- Storybook configuration and widget stories for visual testing.

## What This Repo Does Not Own

- ONEX runtime business logic → `omnimarket`
- Kafka event bus and infrastructure → `omnibase_infra`
- Node execution contracts and validation → `omnibase_core`
- Intelligence nodes (intent, drift, review) → `omniintelligence`
- Legacy v1 Next.js analytics dashboard → `omnidash-archived` (archived, read-only)
- Platform documentation → the two knowledge bases above

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

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR |
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

Adding a widget, the data-source modes, and the registry-generation workflow are covered in the [OmniDash Development Guide](https://github.com/OmniNode-ai/knowledge-base/blob/main/guides/omnidash-development.md).

## Key Source Locations

| Path | Purpose |
|------|---------|
| `src/components/dashboard/` | All widget implementations |
| `src/components/dashboard/index.ts` | Lazy-import map (`implementationKey` → component) |
| `scripts/generate-registry.ts` | MVP manifest definitions and registry generation |
| `src/registry/component-registry.json` | Generated registry (do not hand-edit) |
| `src/data-source/` | Data source adapters |
| `src/store/` | Zustand state slices |
| `shared/types/` | Dashboard definition and component manifest schemas |
| `server/` | Express HTTP bridge for `VITE_DATA_SOURCE=http` mode |

---

## Security, Contributing, and License

- [SECURITY.md](SECURITY.md) — security policy and vulnerability reporting
- [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) — branch, commit, and review conventions
- [CLAUDE.md](CLAUDE.md) — agent and developer context
- [LICENSE](LICENSE) — MIT
