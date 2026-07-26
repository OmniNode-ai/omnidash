> Shared standards: `~/.claude/CLAUDE.md`. Worktrees, PR/CI gates, merge policy, repo registry: `omni_home/CLAUDE.md`. This file is omnidash-specific. Full dev guide (setup, commands, widget tracks, Storybook, key source locations): `docs/development.md`.

## What this is

Composable widget dashboard — Vite + React, services-led. Components render authoritative data; they never create it ([doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md)). Component-local truth contract: `src/components/dashboard/README.md`.

## Deployed instance is NOT this app (forensic readback 2026-07-02 — re-verify before deploy work)

The live Keycloak-gated omnidash on k3s is the LEGACY full-stack `rest-express` app (express-session + openid-client), which sits on NO origin branch — its root is disjoint from this Vite app's history. If you reach an auth-gated dashboard, you are looking at legacy. Merging here does not change what is deployed; do not "fix" the live app by editing this repo.

## Data sources

Four modes via `VITE_DATA_SOURCE`: `file` | `http` | `sqlite` | `postgres`. Defaults are OWNED by `contract.yaml` (current default: `http`, NOT `file` — flipped in OMN-14642) and generated into `src/config/generated/data-source-defaults.ts` via `npm run generate:config`. `sqlite`/`postgres` resolve through the same `HttpSnapshotSource` HTTP path — the distinction is server-side. `file` reads `./fixtures/` with zero infra.

The base contract deliberately carries NO backend URL — unconfigured `http` mode fails loudly. The URL comes from a `contract.local.yaml` overlay or `OMNIDASH_BRIDGE_URL`; the local Express bridge (`npm run dev:server`, `server/index.ts`) defaults to port 3002.

## Hard rules

1. Never hardcode a backend URL/port. All data access goes through `src/data-source/` (`FileSnapshotSource`/`HttpSnapshotSource`, selected by `resolveEffectiveDataSource()`).
2. Never read `VITE_DATA_SOURCE` directly in components — always `resolveEffectiveDataSource()` from `src/data-source/data-source-override.ts`, the single runtime-override seam (written by the `DataSourceControl` chrome).
3. `/api/` path literals belong only in `src/services/` or `src/data-source/`. NOTE: source comments cite a `local/no-api-literal` ESLint rule — no such rule exists at HEAD (checked 2026-07-26); the seam is convention. The live local rule set is in `eslint.config.js`.
4. Components must not own truth: no backend/event-bus clients, no reducers, no inferred authoritative state. Contract: `src/components/dashboard/README.md`.
5. Never hand-edit generated artifacts: `src/registry/component-registry.json` (`npm run generate:registry`) and `src/shared/types/generated/` (`npm run types:generate`).
6. `./fixtures/` IS committed (`.gitignore` carve-out `!fixtures/**`); `./dashboard-layouts/` is not.

## Widgets

Two tracks — local widget (lazy import in `src/components/dashboard/index.ts` + manifest entry in `MVP_COMPONENTS` in `scripts/generate-registry.ts`; there are no per-widget manifest files) or external `@omninode/*` package (`"dashboardComponents"` key in its package.json, auto-scanned by `generate:registry`; palette-visible but `not_implemented` until its `implementationKey` is also in the local `componentImports` map). Steps: `docs/development.md` §Adding a New Widget. New data-source adapters implement `ProtocolSnapshotSource` and register in `src/data-source/index.ts`.

## Gotchas

- Drag/resize work only in edit mode (`src/store/editModeSlice.ts`; the toggle lives in `src/pages/DashboardView.tsx` — there is no DashboardBuilder page). Layouts do NOT auto-save on drag; use the explicit Save button.
- Empty palette → stale registry; run `npm run generate:registry` and restart dev.
- "No data" in file mode → `./fixtures/<topic>/` needs `.json` files. There is no `fixtures/registry.json` requirement: the `/_fixtures` Vite middleware auto-generates each topic's `index.json` by listing the directory (`vite.config.ts`).

## Typography & Storybook

- All widget text via `<Text>`/`<Heading>` from `@/components/ui/typography`; no inline font/color/weight styles — enforced by `local/no-typography-inline` (rationale: `docs/adr/001-typography-system.md`; tokens: `src/styles/globals.css`).
- Every widget ships `Empty` + `Populated` stories alongside the component; widgets calling `useProjectionQuery` wrap stories in `makeDashboardDecorator(...)` from `@/storybook/decorators/withDashboardContext`. Enforced by `src/storybook-coverage-compliance.test.ts` on every `npm test` (rationale: `docs/adr/002-storybook-widget-coverage.md`).
- Live updates are HTTP polling only — no WebSocket; raw WebSocket construction is blocked by `local/no-projection-websocket`.
