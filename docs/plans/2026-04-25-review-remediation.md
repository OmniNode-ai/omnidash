---
epic_id: OMN-142
repo: omnidash-v2
---

# OmniDash v2 — Review Remediation Plan

**For Claude:** Use `executing-plans` to walk this phase by phase.

**Goal:** Address the findings from Jonah's adversarial review of the
2026-04-25 handoff (see `docs/projects/2026-04-25-omnidash-v2-from-brett-review.md`
in the omninode_ai workspace) so the codebase is shippable beyond the
contractor's local network and the test posture is honest about what
it covers.

**Architecture decision (PR 3a):** adopting **Option 1** from §3
cluster C — `DashboardService` becomes the canonical state read/write
path; Zustand and layout middleware route through it. Decided per
Bret based on Jonah's pattern of services-led architecture in other
projects.

**Routing:** Four task waves, dependency-chained:

- Tasks 1–5 (PR 1) — independent of each other, can run in parallel
- Tasks 6–13 (PR 2) — depend on Task 1 (env discipline established first)
- Tasks 14–16 (PR 3a) — depend on Task 13 (test discipline before refactor)
- Tasks 17–21 (PR 3b) — depend on PR 3a (compose against stable seams)

---

## Task 1: Env-var sweep for hardcoded IPs and paths

**Source:** Brett review §4 C1–C5

**Files:**
- Modify: `server/db.ts`
- Modify: `src/agent/llmClient.ts`
- Modify: `vite.config.ts`
- Modify: `package.json` (the `generate:fixtures` script)
- Modify: `scripts/run-types-generate.sh`
- Create: `.env.example`

**Change:** every external endpoint and every external-repo path is a
required env var that fails fast when unset. No silent fallbacks to
literal hosts or paths.

Replacements:
- `server/db.ts:5` — Postgres connection string from `OMNIDASH_ANALYTICS_DB_URL`; throw at startup if unset.
- `src/agent/llmClient.ts:17` — LLM fallback URL from `VITE_LLM_FALLBACK_URL`; throw if missing, or delete the fallback if it isn't a real feature.
- `vite.config.ts:139` — Vite proxy fallback from `VITE_LLM_BASE_URL`; remove the IP literal.
- `package.json:17` — `generate:fixtures` reads `OMNIBASE_INFRA_PATH` (or uses a `--project ../../omnibase_infra` form that works on Jonah's layout).
- `scripts/run-types-generate.sh:8` — drop the `/mnt/c/Code/...` default; require `OMNIBASE_CORE_PATH`; exit 1 if missing.

`.env.example` documents every required env var with placeholder values
(no real endpoints).

**Acceptance:**
- App boots with zero access to the `192.168.86.0/24` subnet when env vars are set.
- App fails fast at startup with a clear error when any required env var is missing.
- Grep for `192.168.86`, `/mnt/c/`, `/Users/`, `../omnibase/repos/` in `src/`, `server/`, `vite.config.ts`, `scripts/` returns 0 hits outside the documented allowlist.

---

## Task 2: Validate I/O boundaries with `validateDashboardDefinition`

**Source:** Brett review §4 C6, C7, also H6

**Files:**
- Modify: `src/store/dashboardSlice.ts` (the `hydrateList()` function)
- Modify: `src/layout/layout-persistence.ts` (`HttpLayoutPersistence.read()`)
- Modify: `src/registry/ComponentRegistry.ts` (`validateConfig`)

**Change:** every I/O boundary that parses external JSON runs the
existing `validateDashboardDefinition` (or an equivalent) before
returning a typed value.

- `dashboardSlice.hydrateList()` — for each parsed item, run validator; drop invalid items with `console.warn`; never crash render on corrupted localStorage.
- `HttpLayoutPersistence.read()` — validate the parsed body; throw on invalid response shape so callers see a typed error instead of garbage data.
- `ComponentRegistry.validateConfig` — declare a `JsonSchema` interface (or import one), remove the three `(schema as any)` casts so the schema traversal is type-checked.

**Acceptance:**
- A localStorage value with one corrupted dashboard entry hydrates the rest and warns about the bad one (verified by unit test that seeds bad JSON).
- `tsc --noEmit` passes with `as any` count in `ComponentRegistry.ts` reduced to zero.
- A test exists that round-trips a layout file through `HttpLayoutPersistence.read()` with malformed JSON and asserts a thrown error, not a typed-but-corrupt return.

---

## Task 3: Add `pg.Pool` error listener

**Source:** Brett review §4 C8

**Files:**
- Modify: `server/db.ts`

**Change:** immediately after `new pg.Pool(...)`, attach a `pool.on('error', ...)` listener that logs and does not rethrow. Without this, the first idle-client error crashes the Node process. Documented in the `pg` README; trivial to add.

**Acceptance:**
- A test (or a manual `pool.emit('error', new Error('test'))`) does not crash the server.
- Server boots cleanly after the change.

---

## Task 4: Read WebSocket URL from `VITE_WS_URL`

**Source:** Brett review §4 H1, H2 — also closes OMN-37

**Files:**
- Modify: `src/components/dashboard/events/EventStream.tsx`
- Modify: `src/hooks/useWebSocketInvalidation.ts`
- Modify: `src/data-source/index.ts` — add the carve-out symmetric to the HTTP one.

**Change:** the two remaining `ws://localhost:3002/ws` literals stop existing in widget code. Mirror the HTTP `localhost:3002` carve-out — the WebSocket URL is read from `VITE_WS_URL` (or threaded through the data-source layer). Repo rule 1 from `CLAUDE.md` finally holds.

**Acceptance:**
- Grep `localhost:3002` in `src/` returns hits only inside `src/data-source/index.ts` (the documented carve-out).
- WebSocket connection succeeds against the configured `VITE_WS_URL`.
- OMN-37 can be closed.

---

## Task 5: Pre-commit grep gate for environment-contamination patterns

**Source:** Brett review §6 PR 1, §8.D

**Files:**
- Create: `scripts/check-no-env-contamination.sh` (or equivalent)
- Modify: any pre-commit / CI hook config

**Change:** add a grep check that fails commit / CI on any of:
- `192.168.` outside allowlisted paths
- `/Users/`, `/Volumes/`, `/mnt/c/` outside documented allowlist
- `localhost:300` outside allowlisted paths

Keep the allowlist minimal (`src/data-source/index.ts`, `.env.example`, docs).

**Acceptance:**
- The grep gate catches a deliberately-introduced `192.168.86.99` literal in a test commit and refuses it.
- Existing repo passes the gate.

---

## Task 6: Remove empty `configSchema` entries from manifests

**Source:** Brett review §4 H3

**Files:**
- Modify: `scripts/generate-registry.ts` — drop or replace the empty `configSchema: { type: 'object', properties: {}, additionalProperties: false }` entries for widgets that don't actually consume config.

The kebab item is already gated on `configSchema.properties` being non-empty (DashboardView change earlier this week), so users no longer see empty modals. This task is the matching cleanup on the registry side — stop advertising configurability that doesn't exist.

Affected widgets: `cost-trend-3d`, `cost-by-model`, `baselines-roi-card`, `readiness-gate`. (`delegation-metrics` already has real config wired by the audit pass.)

**Acceptance:**
- Affected manifests either have a non-empty `configSchema.properties` OR omit `configSchema` entirely.
- Registry passes its existing manifest-validation tests.
- `npm run generate:registry` runs cleanly.

---

## Task 7: Align color palette across CostTrend 2D and 3D

**Source:** Brett review §4 H4

**Files:**
- Modify: `src/components/dashboard/cost-trend-3d/CostTrend3D.tsx` (the `DARK_THEME` / `LIGHT_THEME` `modelPalette` arrays at lines ~169-181)

**Change:** the 3D widget's hardcoded model palette is replaced with values from `useThemeColors().chart`. Same models render in the same color across the 2D and 3D Cost Trend widgets.

**Dependencies:** Task 6 (clean manifests first so registry passes are stable while editing the 3D widget).

**Acceptance:**
- Manual visual check: the same model gets the same color in both Cost Trend 2D and 3D, in both light and dark modes.
- Existing `CostTrend3D` test (added in Task 9) passes.

---

<!-- Note: Brett review §4 H6 (type-safe ComponentRegistry.validateConfig)
     is rolled into Task 2 — no separate ticket. Task numbering jumps
     from 7 to 9 to preserve the review→ticket trace for reviewers
     comparing against the original audit. -->

## Task 9: Add CostTrend3D unit test

**Source:** Brett review §4 H9

**Files:**
- Create: `src/components/dashboard/cost-trend-3d/CostTrend3D.test.tsx`

**Change:** mirror the existing test pattern from `CostByModelPie.test.tsx` — use `vi.mock('three')` with a `FakeWebGLRenderer` so the test runs in jsdom. Cover at minimum:
- Loading state renders
- Empty state renders when fixture data is empty
- Populated state renders without throwing

**Dependencies:** none.

**Acceptance:**
- `npx vitest run src/components/dashboard/cost-trend-3d/CostTrend3D.test.tsx` passes.
- Storybook compliance scorecard's new test-existence phase (Task 11) catches future widgets that lack a test.

---

## Task 10: Express server route + WebSocket tests

**Source:** Brett review §4 H10, M18

**Files:**
- Create: `server/routes.test.ts` (supertest-based)
- Create: `server/index.test.ts` (or augment) for `broadcast()` channel filtering

**Change:** add smoke tests for every REST route in `server/routes.ts` (six endpoints) using `supertest` with a mocked `db.query`. Add a unit test for `broadcast()` that verifies the `subs.has('*') || subs.has(channel)` filter.

**Dependencies:** none — test additions don't require any other work.

**Acceptance:**
- `npm test` includes the new server tests; all pass.
- CI (after Task 13) runs the server tests.

---

## Task 11: Extend storybook compliance scorecard to enforce `.test.tsx` existence

**Source:** Brett review §4 H11

**Files:**
- Modify: `src/storybook-coverage-compliance.test.ts`

**Change:** add a Phase 4 section that mirrors Phase 2 but checks for `<widget>.test.tsx` existence next to `<widget>.tsx` for every widget in the `STORY_FILES` list. Every widget must have BOTH a story file and a test file.

**Dependencies:** Task 9 (CostTrend3D needs its test before this enforcement is added, otherwise the scorecard fails immediately).

**Acceptance:**
- The scorecard fails when a widget has stories but no `.test.tsx`.
- Existing repo passes the scorecard with both stories and tests for every widget.

---

## Task 12: Move `@types/*` packages to `devDependencies`

**Source:** Brett review §4 H12

**Files:**
- Modify: `package.json`

**Change:** `@types/express`, `@types/pg`, `@types/ws` move from `dependencies` to `devDependencies`. They aren't shipped runtime artifacts.

**Acceptance:**
- `npm install` produces the same `node_modules` shape.
- `npm run build` and `npm run check` still pass.

---

## Task 13: Make `tsconfig.node.json` strict and include `server/`; add `build:server` to CI

**Source:** Brett review §4 H14, H15

**Files:**
- Modify: `tsconfig.node.json` — add `"include": ["vite.config.ts", "server"]` and `"strict": true`
- Modify: `.github/workflows/ci.yml` — add a `npm run build:server` step

**Change:** the Express server stops being outside the repo's correctness discipline. `tsc --noEmit` over `server/` runs in CI and would catch type drift.

**Dependencies:** Task 10 (server has tests by now); Task 3 (no obvious type errors from missing pool listener).

**Acceptance:**
- `npm run build:server` exits 0 on the current codebase.
- CI runs `build:server` and fails on a deliberately-introduced server type error.
- `tsconfig.node.json` is strict.

---

## Task 14: Adopt `DashboardService` as the canonical state read/write path

**Source:** Brett review §3 cluster C, §4 H8 — architecture decision.

**Architecture decision:** Option 1 from the review's §3 cluster C —
`DashboardService` becomes the only read/write path. Routing through
the service means Zustand and the layout middleware do not write
state independently; both go through `DashboardService`.

**Files:**
- Modify: `src/store/dashboardSlice.ts` — Zustand actions delegate writes to `DashboardService`.
- Modify: `src/layout/layout-persistence.ts` — `HttpLayoutPersistence` becomes an internal adapter consumed BY `DashboardService`, not a parallel write path used by `DashboardView.handleSave`.
- Modify: `src/pages/DashboardView.tsx` — `handleSave` calls `DashboardService.save(...)` instead of `layoutPersistence.write` directly.
- Modify: `src/services/dashboardService.ts` — exposes the unified API and is the only thing that touches localStorage and the `/_layouts/` endpoint.
- Create: `src/services/dashboardService.test.ts` (if not present) — round-trip integration test verifying save then reload produces identical state.

**Change:** Three competing stores (Zustand, localStorage, `/_layouts` files) collapse into one canonical write path through `DashboardService`. Bypass paths are deleted.

**Dependencies:** Task 11 (test discipline established before architecture refactor); Task 2 (validation in place at I/O boundaries — the service will rely on it).

**Acceptance:**
- `DashboardService` is imported in production code (specifically `dashboardSlice.ts` and `DashboardView.tsx`).
- Round-trip test passes: write a dashboard, reload, and observe identical state.
- No code outside `DashboardService` writes to localStorage's dashboard list keys or to `/_layouts/`.

---

## Task 15: Promote `SnapshotSource` to a singleton via React context

**Source:** Brett review §4 H7

**Files:**
- Create: `src/data-source/SnapshotSourceProvider.tsx` — React context provider wrapping `createSnapshotSource()`.
- Modify: `src/main.tsx` (or `App.tsx`) — wrap the tree in `<SnapshotSourceProvider>`.
- Modify: `src/hooks/useProjectionQuery.ts` — read source from context instead of constructing per-call.

**Change:** the data-source client is created once at app root and shared by all widgets via context. Tests can wrap their tree in a different provider with a mock source — no env-var dance, no rebuild.

This isn't an emergency fix (the file source is stateless), but it
unlocks integration testing where multiple widgets share a mock
source seeded with one fixture set.

**Dependencies:** Task 14 (state ownership stable first; this refactor touches widget hooks while the service refactor touches store wiring).

**Acceptance:**
- `useProjectionQuery` consumes from `useContext`; calling it outside a provider throws a clear error.
- An integration test renders two widgets with a single mocked `SnapshotSource` and verifies both see consistent data.

---

## Task 16: Single source of truth for topic strings

**Source:** Brett review §3 cluster F, §4 M6

**Files:**
- Modify: `scripts/generate-registry.ts` — declare topic strings as a top-level `TOPICS` const; export per-widget topic symbols.
- Modify: every widget that hardcodes a topic literal — replace with an import from the registry.
- Add: a generator-time check that every widget's manifest `dataSources` array is fully populated with a topic.

**Change:** topic strings are declared once. The frontend follows the same contract-first-topic-definition rule the backend already follows (per `~/.claude/CLAUDE.md`).

**Dependencies:** Task 15 (architecture refactor done first; topic discipline is a polish on top).

**Acceptance:**
- Grep for the literal `'onex.snapshot.projection.` in `src/components/` returns zero hits — every widget imports from the registry instead.
- Renaming a topic in the registry breaks compilation in any widget that still references the old name.
- The generator-time check rejects a manifest entry whose `dataSources` array is missing the `topic` field.

---

## Task 17: New widget — Cost by Model 2D (horizontal bar chart)

**Source:** Brett review §5

**Files:**
- Create: `src/components/dashboard/cost-by-model-2d/CostByModelBars.tsx`
- Create: `src/components/dashboard/cost-by-model-2d/CostByModelBars.test.tsx`
- Create: `src/components/dashboard/cost-by-model-2d/CostByModelBars.stories.tsx`
- Modify: `scripts/generate-registry.ts` — register the new widget; demote (or remove) the 3D pie from being the default.
- Modify: `src/components/dashboard/index.ts` — wire the lazy-import.

**Change:** new 2D companion. Horizontal bar chart, one bar per model, sorted by cost desc. Encodes magnitude via length (perceptually accurate). Reuses `useThemeColors().chart`. Same data shape as `CostByModelPie` — pulls from the same projection.

**Dependencies:** Task 16 (topic-string registry — the new widget should use the imported symbol from day one).

**Acceptance:**
- Widget renders against fixture data with bars proportional to per-model cost.
- Has Empty + Populated stories and a unit test.
- Compliance scorecard catches both story and test (Task 11 + Task 17 itself).
- The 3D pie either coexists as an optional widget OR is removed; user choice documented in the ticket.

---

## Task 18: New widget — Quality Score Panel 2D (vertical histogram)

**Source:** Brett review §5

**Files:**
- Create: `src/components/dashboard/quality-score-panel-2d/QualityScoreHistogram.tsx`
- Create: `src/components/dashboard/quality-score-panel-2d/QualityScoreHistogram.test.tsx`
- Create: `src/components/dashboard/quality-score-panel-2d/QualityScoreHistogram.stories.tsx`
- Modify: `scripts/generate-registry.ts`, `src/components/dashboard/index.ts`.

**Change:** vertical histogram, 5 bars colored on a red→green gradient, threshold line, mean marker. Same data shape as `QualityScorePanel`.

This is lower priority than Task 17 because the existing 3D quality bars don't suffer the same chart-literacy issue (ordered buckets, mild occlusion, threshold plane is informative). Still nice to have.

**Dependencies:** Task 16.

**Acceptance:**
- Widget renders against the existing quality-summary projection.
- Has Empty + Populated stories and a unit test.

---

## Task 19: Configurable quality-gate threshold for DelegationMetrics

**Source:** Brett review §4 M2

**Files:**
- Modify: `scripts/generate-registry.ts` — add `qualityGateThreshold` to the `delegation-metrics` configSchema (number, default 0.8).
- Modify: `src/components/dashboard/delegation/DelegationMetrics.tsx` — read `config.qualityGateThreshold` and use it instead of the hardcoded 0.8.

**Change:** the threshold currently hardcoded at 0.8 (which drives the green-vs-warn color on the Quality Gate Pass Rate stat) becomes user-configurable. Mirrors the existing `passThreshold` pattern in `quality-score-panel`.

**Dependencies:** Task 6 (manifest cleanup so the new field lands cleanly).

**Acceptance:**
- Configure Widget shows a `Quality gate threshold` field on DelegationMetrics; changing it updates the warn/ok color immediately.

---

## Task 20: Replace `Date.now() + Math.random()` ID generators with `crypto.randomUUID()`

**Source:** Brett review §4 M3

**Files:** every file that self-documents as "PROVISIONAL" with this pattern (review notes 6+ places).

**Change:** swap to `crypto.randomUUID()` (browser-native, available in modern environments).

**Acceptance:**
- Grep for `Date.now() + Math.random` in `src/` returns zero hits.
- Existing tests pass.

---

## Task 21: Misc PR 3b cleanups

**Source:** Brett review §4 M-items + LOW

**Bundle of small fixes:**
- M1 — `CostTrendPanel.tsx:142-148` switch raw `Date` getters to `zonedComponents()` for timezone-correct labels.
- M4 — `ComponentCell.emptyMessage` prop forwarding wired or removed.
- M5 — Type Connect callback parameters in `vite.config.ts:12,55`.
- M7 — `server/routes.ts:113` returns 204 or stable empty shape instead of `res.json(null)`.
- M8 — `FileSnapshotSource` and `HttpSnapshotSource` test gain error-path coverage.
- M9 — `QualityScorePanel.test.tsx` fixture aligned to actual server bucket shape.
- M10 — extract duplicated `mockFetchWithItems` helper to `src/tests/mockFetch.ts`; consume from 7 test files.
- M11 — `tsx` added to `devDependencies` (currently used by scripts but not declared).
- M12 — schedule ESLint 9 upgrade (file as a separate ticket if it grows).
- M13 — enable `@typescript-eslint/recommended` and `react-hooks/rules-of-hooks` rule sets in ESLint config.
- M14 — add `test:coverage` script with thresholds; wire into CI.
- M15 — delete unused `@neondatabase/serverless` runtime dep.
- M16 — Vite port single source — env-overridable.
- M17 — wire `generate:fixtures` into CI test setup OR remove the `it.skipIf(inCI)` skip in `proof-of-life.test.tsx`.
- LOW items — `BaselinesROICard.tsx:55` fragile `hsl()`, `DashboardBuilder.tsx` OMN-44 shim removal, `RoutingDecisionTable` decide on `fuzzy_confidence` column, `QualityScorePanel` BUCKET_MIDPOINTS hardening.

This is a triage bundle — split out into per-finding tickets if any item turns out to be larger than expected.

**Dependencies:** PR 3a complete (Tasks 14, 15, 16); also Task 9 (test discipline before fixture-shape changes).

**Acceptance:**
- All listed M-items resolved or split into follow-up tickets with explicit reason.
- `npm test` and `npm run build` both pass.
- Coverage threshold gate active in CI.
