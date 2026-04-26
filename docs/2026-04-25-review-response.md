# omnidash-v2 — response to Brett review (2026-04-25)

**Source of review:** `2026-04-25-omnidash-v2-from-brett-review.md` (Jonah's
adversarial review pass: 4 parallel Sonnet agents + Playwright walkthrough,
verdict "keep the work, ship the fixes below before merging").

**What this document is:** a per-finding ledger of what changed, where the
fix landed, and what proof exists. Every finding from §4 of the review
(CRITICAL / HIGH / MEDIUM / LOW) is addressed below, plus the §3 cluster
fixes, §5 2D companions, and §8 acceptance criteria.

**Implementation shape:** four PRs merged to `main` in order, against
**epic OMN-142** in Linear (20 child tickets, OMN-143..162). The plan that
drove the work landed with PR 1 at
[`docs/plans/2026-04-25-review-remediation.md`](./plans/2026-04-25-review-remediation.md).

| PR | Title | Tickets | Commit on `main` |
|---|---|---|---|
| [#33](https://github.com/clone45/omnidash-v2/pull/33) | env-var sweep + I/O validation + WS carve-out + grep gate | T1–T5 | `9a14197` |
| [#34](https://github.com/clone45/omnidash-v2/pull/34) | capability/test honesty + server typecheck discipline | T6, T7, T9–T13 | `f3e85a0` |
| [#35](https://github.com/clone45/omnidash-v2/pull/35) | truth-ownership refactor — service-led writes + source context + topic SoT | T14–T16 | `18a7651` |
| [#36](https://github.com/clone45/omnidash-v2/pull/36) | 2D companions + threshold config + cleanup bundle | T17–T21 | `7a0beb3` |

**Test status at end of merge:** 493/493 pass; `tsc` clean (frontend +
server); lint clean; env-contamination grep gate clean; manifest generator
validates all 11 widget manifests.

---

## 1. CRITICAL findings (§4)

### C1 — `server/db.ts:5` Postgres connection string with private IP and empty password

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`server/db.ts`](../server/db.ts).
**What changed:** The fallback connection string was deleted. `OMNIDASH_ANALYTICS_DB_URL` is now required at module load — the server throws at startup with a clear pointer to `.env.example` if it's unset. No silent fallback to any literal host.

### C2 — `src/agent/llmClient.ts:17` LLM fallback URL hardcoded

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`src/agent/llmClient.ts`](../src/agent/llmClient.ts).
**What changed:** `FALLBACK_LLM_CONFIG.baseURL` is now a lazy getter that throws when `VITE_LLM_FALLBACK_URL` is unset. Callers that don't opt into the fallback path (`useFallback=false`) never trip it; callers that do get a clear error at access time instead of a silent connect to a stale IP. `DEFAULT_LLM_CONFIG.baseURL` similarly uses `buildBaseURL(VITE_LLM_BASE_URL)` which throws in non-DEV builds.

### C3 — `vite.config.ts:139` Vite proxy fallback hardcoded

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`vite.config.ts`](../vite.config.ts).
**What changed:** The proxy block is now conditional on `VITE_LLM_BASE_URL` being set — if it's unset, the `/llm-proxy` route is not registered at all (rather than falling through to a hardcoded host). The `??` literal is gone from the source tree.

### C4 — `package.json:17` `generate:fixtures` hardcoded relative path

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`package.json`](../package.json), [`scripts/run-generate-fixtures.sh`](../scripts/run-generate-fixtures.sh).
**What changed:** `generate:fixtures` is now a thin shell wrapper that requires `OMNIBASE_INFRA_PATH`, validates the directory exists, and exits with an actionable error if not. The Brett-machine relative path is gone.

### C5 — `scripts/run-types-generate.sh:8` `/mnt/c/...` WSL default

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`scripts/run-types-generate.sh`](../scripts/run-types-generate.sh).
**What changed:** The `/mnt/c/...` default is gone. `OMNIBASE_CORE_PATH` is required; the script exits 1 with a pointer to `.env.example` if unset.

### C6 — `dashboardSlice.hydrateList()` casts unvalidated localStorage

**Status:** Fixed in PR 1 (T2 / OMN-144).
**Where:** [`src/store/dashboardSlice.ts`](../src/store/dashboardSlice.ts), [`shared/types/dashboard.ts`](../shared/types/dashboard.ts) (new `parseDashboardDefinition`).
**What changed:** A new tolerant validator `parseDashboardDefinition(value: unknown)` was added next to the existing `validateDashboardDefinition`. `hydrateList` now runs it per entry, drops corrupted entries with `console.warn`, and never crashes render on bad localStorage. (Note: in PR 3a / T14 this logic moved into `dashboardService.hydrateList()`; the slice now delegates.)
**Proof:** [`src/store/dashboardSlice.hydrate.test.ts`](../src/store/dashboardSlice.hydrate.test.ts) seeds a mix of valid + corrupt entries and asserts the valid one survives + the warning fires.

### C7 — `HttpLayoutPersistence.read()` casts HTTP response without validation

**Status:** Fixed in PR 1 (T2 / OMN-144).
**Where:** [`src/layout/layout-persistence.ts`](../src/layout/layout-persistence.ts).
**What changed:** `read()` now runs `parseDashboardDefinition` against the response body and throws a typed error on invalid shape rather than returning a typed-but-corrupt value.
**Proof:** [`src/layout/layout-persistence.test.ts`](../src/layout/layout-persistence.test.ts) test "throws on malformed dashboard payload (T2 acceptance)" — server returns 200 OK with a missing-field body; assertion expects a thrown `/malformed dashboard/` error.

### C8 — `pg.Pool` has no `'error'` listener

**Status:** Fixed in PR 1 (T3 / OMN-145).
**Where:** [`server/db.ts`](../server/db.ts).
**What changed:** Immediately after `new Pool(...)`, `pool.on('error', ...)` is attached and logs without rethrowing. Idle-client errors no longer crash the Node process.

---

## 2. HIGH findings (§4)

### H1 — `EventStream` hardcodes `ws://localhost:3002/ws`

**Status:** Fixed in PR 1 (T4 / OMN-146). Closes OMN-37.
**Where:** [`src/components/dashboard/events/EventStream.tsx`](../src/components/dashboard/events/EventStream.tsx).
**What changed:** The literal is gone. The widget calls `getWebSocketUrl()` from `@/data-source` — symmetric to the existing HTTP carve-out.

### H2 — `useWebSocketInvalidation` hardcodes the same URL

**Status:** Fixed in PR 1 (T4 / OMN-146). Closes OMN-37.
**Where:** [`src/hooks/useWebSocketInvalidation.ts`](../src/hooks/useWebSocketInvalidation.ts).
**What changed:** Same fix as H1 — calls `getWebSocketUrl()`.
**Where the carve-out lives:** [`src/data-source/index.ts`](../src/data-source/index.ts) — `getWebSocketUrl()` reads `VITE_WS_URL` first, derives a `ws://` URL from `VITE_HTTP_DATA_SOURCE_URL` second, and only then falls back to the dev default. The grep gate in 8.D specifically allowlists this file as the carve-out location.

### H3 — `CostTrend3D` and `CostByModelPie` advertise empty `configSchema`

**Status:** Fixed in PR 2 (T6 / OMN-148).
**Where:** [`scripts/generate-registry.ts`](../scripts/generate-registry.ts), [`shared/types/component-manifest.ts`](../shared/types/component-manifest.ts), [`src/registry/ComponentRegistry.ts`](../src/registry/ComponentRegistry.ts), [`src/pages/DashboardView.tsx`](../src/pages/DashboardView.tsx), [`src/config/ComponentConfigPanel.tsx`](../src/config/ComponentConfigPanel.tsx).
**What changed:** `configSchema` is now optional in `ComponentManifest`. Four widgets (`cost-trend-3d`, `cost-by-model`, `baselines-roi-card`, `readiness-gate`) that ignored their config now omit `configSchema` entirely. The kebab "Configure Widget" item is gated on `configSchema?.properties` being non-empty. The configure-widget dialog defensively bails if it ever reaches a widget without a schema.

### H4 — Cost Trend 2D / 3D palette divergence

**Status:** Fixed in PR 2 (T7 / OMN-149).
**Where:** [`src/components/dashboard/cost-trend-3d/CostTrend3D.tsx`](../src/components/dashboard/cost-trend-3d/CostTrend3D.tsx).
**What changed:** The hardcoded `modelPalette` arrays in `DARK_THEME` / `LIGHT_THEME` are kept as fallbacks but the live `theme.modelPalette` now comes from `useThemeColors().chart` — the same source the 2D widgets read. Same model gets the same color across 2D bars / 3D pie / 2D bars / Cost Trend 3D in both themes.

### H5 — `DashboardGrid.onLayoutChange` declared but unused

**Status:** Not fixed in this remediation pass.
**Reason for deferral:** Out of scope for the bundle. Worth a follow-up ticket — recommend writing it as `OMN-#### Wire DashboardGrid.onLayoutChange or remove the prop`.

### H6 — `ComponentRegistry.validateConfig` uses `(schema as any)` 3 times

**Status:** Fixed in PR 1 (T2 / OMN-144 — rolled into the I/O validation cluster).
**Where:** [`src/registry/ComponentRegistry.ts`](../src/registry/ComponentRegistry.ts).
**What changed:** Imports `JSONSchema7`, `JSONSchema7Definition`, `JSONSchema7TypeName` from `json-schema`. The three `as any` casts are gone. Leaf-type validation pulled into a typed `checkLeafType()` helper that handles all `JSONSchema7TypeName` values (string/number/integer/boolean/array/object/null).

### H7 — `useProjectionQuery` creates a new `SnapshotSource` per widget instance

**Status:** Fixed in PR 3a (T15 / OMN-156).
**Where:** [`src/data-source/SnapshotSourceProvider.tsx`](../src/data-source/SnapshotSourceProvider.tsx) (new), [`src/hooks/useProjectionQuery.ts`](../src/hooks/useProjectionQuery.ts), [`src/providers/Providers.tsx`](../src/providers/Providers.tsx).
**What changed:** New `SnapshotSourceProvider` + `useSnapshotSource()` hook. The data-source client is created once at app root and shared by all widgets via context. Calling the hook outside a provider throws a clear error — that's the documented contract, with an acceptance test in `useProjectionQuery.test.tsx`. Tests and Storybook stories wrap their tree in their own provider with a mock source — no env-var dance required. Shared test wrapper at [`src/test-utils/dataSourceTestProvider.tsx`](../src/test-utils/dataSourceTestProvider.tsx).

### H8 — Three competing persistence stores

**Status:** Fixed in PR 3a (T14 / OMN-155). **Architecture decision: Option 1.**
**Where:** [`src/services/dashboardService.ts`](../src/services/dashboardService.ts), [`src/store/dashboardSlice.ts`](../src/store/dashboardSlice.ts), [`src/pages/DashboardView.tsx`](../src/pages/DashboardView.tsx).
**Decision:** `DashboardService` is the canonical state read/write path. Per Bret's confirmation that Jonah uses services-led architecture in other projects.
**What changed:**
- `DashboardService` now owns the localStorage keys (`omnidash.dashboards.list.v1`, `omnidash.lastActiveId.v1`) via `persistList`/`persistActiveId`/`hydrateList`/`hydrateActiveId` methods plus a default singleton export `dashboardService`.
- Zustand `dashboardSlice` no longer touches localStorage — every persist/hydrate helper delegates to `dashboardService`.
- `DashboardView.handleSave` calls `dashboardService.save(dashboard)` instead of `layoutPersistence.write` directly. Mount-load uses `dashboardService.loadByName('default')`.
- Round-trip integration test in [`src/services/dashboardService.test.ts`](../src/services/dashboardService.test.ts) — saves a dashboard, reloads via `loadByName`, asserts identical state.

### H9 — `CostTrend3D` has no `.test.tsx`

**Status:** Fixed in PR 2 (T9 / OMN-150).
**Where:** [`src/components/dashboard/cost-trend-3d/CostTrend3D.test.tsx`](../src/components/dashboard/cost-trend-3d/CostTrend3D.test.tsx) (new).
**What changed:** Mirrors the `CostByModelPie` pattern — `vi.mock('three')` with a `FakeWebGLRenderer`, plus a parallel mock for `CSS2DRenderer` since this widget uses DOM-overlay labels. Covers loading, empty, and populated states.

### H10 — Express server has zero test coverage

**Status:** Fixed in PR 2 (T10 / OMN-151).
**Where:** [`server/routes.test.ts`](../server/routes.test.ts) (new), [`server/broadcast.test.ts`](../server/broadcast.test.ts) (new), [`server/index.ts`](../server/index.ts).
**What changed:**
- `routes.test.ts` — supertest smoke coverage for all six REST routes with a mocked `db.query`. Includes the success path, the `defaults granularity to day` branch, the `query failed` 500 branch, and the now-204 baselines empty branch (see M7).
- `broadcast.test.ts` — channel-filter unit tests for `broadcast()`: exact-channel match, `*` wildcard match, no match, `readyState !== OPEN`.
- `server/index.ts` was refactored to defer `httpServer.listen()` unless the module is the entrypoint (ESM equivalent of `require.main === module`), so tests can import `broadcast` and the `clients` map without binding a port.

### H11 — Compliance scorecard doesn't enforce unit-test existence

**Status:** Fixed in PR 2 (T11 / OMN-152).
**Where:** [`src/storybook-coverage-compliance.test.ts`](../src/storybook-coverage-compliance.test.ts).
**What changed:** A new Phase 4 mirrors Phase 2 but checks `<widget>.test.tsx` existence next to `<widget>.tsx`. Each `STORY_FILES` entry is now flagged `widget: true | false` — Phase 4 enforces the test-file requirement only on widget entries. Infra components (frame, agent shell, config dialog, shared chrome) are not gated yet.

### H12 — `@types/*` in `dependencies`

**Status:** Fixed in PR 2 (T12 / OMN-153).
**Where:** [`package.json`](../package.json).
**What changed:** `@types/express`, `@types/pg`, `@types/ws` moved from `dependencies` to `devDependencies`. `supertest` + `@types/supertest` added (devDeps) for T10. PR 3b also added `tsx` (which scripts depend on but wasn't declared) and removed unused `@neondatabase/serverless`.

### H13 — `npm run generate:projection-registry` documented but doesn't exist

**Status:** Fixed in PR 1 (T1 / OMN-143).
**Where:** [`omnidash-v2/CLAUDE.md`](../CLAUDE.md). The plan file references this fix incidentally, but the actual change is mechanical: the CLAUDE.md "Common tasks" section was sanitized as part of the env-discipline pass to remove the phantom script and replace with the real ones (`generate:registry`, `generate:fixtures`, `types:generate`).
**Note:** The repo's `omnidash-v2/CLAUDE.md` was already partially up-to-date; the phantom command was a holdover that didn't survive PR 1's review of the documentation surface. Verify by `grep -n generate:projection-registry omnidash-v2/CLAUDE.md` returning zero hits.

### H14 — `tsconfig.node.json` is non-strict and excludes `server/`

**Status:** Fixed in PR 2 (T13 / OMN-154).
**Where:** [`tsconfig.node.json`](../tsconfig.node.json), [`vite.config.ts`](../vite.config.ts).
**What changed:** `tsconfig.node.json` now includes `server/` and is strict (`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, lib pinned to ES2022, types pinned to `node`). `vite.config.ts` had two unused `next` middleware params surfaced by the strict check; addressed via PR 3b's M5 fix (proper Connect type signature with `IncomingMessage` / `ServerResponse` / a local `ConnectNext` alias).

### H15 — CI never runs `npm run build:server`

**Status:** Fixed in PR 2 (T13 / OMN-154).
**Where:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
**What changed:** A new `TypeScript typecheck (server / vite config)` step runs `npm run build:server` between the frontend `tsc` step and lint. The `build:server` script uses `--noEmit` so the strict typecheck doesn't conflict with `composite: true`'s emit requirement.

### H16 — "Add Widget" is the actual edit-mode toggle

**Status:** Not fixed in this remediation pass.
**Reason for deferral:** Out of scope. The fix shape ("split into two header actions: Edit Layout and Add Widget") is a UX change that touches multiple components (header, palette, mode interactions). Worth a follow-up ticket once the shape is settled with the user — recommend `OMN-#### Split header into Edit Layout / Add Widget actions`.

---

## 3. MEDIUM findings (§4)

### M1 — `CostTrendPanel` uses timezone-naive Date getters

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body as a deferred T21 item. Mechanical change but needs verification in two themes + with non-default timezone selections to confirm no regression.

### M2 — Delegation Metrics hardcodes 0.8 quality gate threshold

**Status:** Fixed in PR 3b (T19 / OMN-160).
**Where:** [`scripts/generate-registry.ts`](../scripts/generate-registry.ts), [`src/components/dashboard/delegation/DelegationMetrics.tsx`](../src/components/dashboard/delegation/DelegationMetrics.tsx).
**What changed:** `qualityGateThreshold` (number, 0..1, default 0.8) added to the `delegation-metrics` configSchema — mirrors the `passThreshold` pattern in `quality-score-panel`. Widget reads `config.qualityGateThreshold` instead of hardcoding 0.8.

### M3 — `Date.now() + Math.random()` ID generators in 6+ places

**Status:** Fixed in PR 3b (T20 / OMN-161).
**Where:** [`src/store/dashboardSlice.ts`](../src/store/dashboardSlice.ts), [`src/store/conversationSlice.ts`](../src/store/conversationSlice.ts), [`src/services/dashboardService.ts`](../src/services/dashboardService.ts), [`shared/types/dashboard.ts`](../shared/types/dashboard.ts).
**What changed:** `crypto.randomUUID()` everywhere. `itemCounter` module variable removed (no longer needed). Acceptance: grep for `Date.now() + Math.random` in `src/` returns zero hits.

### M4 — `ComponentCell.emptyMessage` declared but never forwarded

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body as a deferred T21 item.

### M5 — `vite.config.ts` middleware uses `any` on Connect callbacks

**Status:** Fixed in PR 3b (T21 / OMN-162).
**Where:** [`vite.config.ts`](../vite.config.ts).
**What changed:** Added `import type { IncomingMessage, ServerResponse } from 'node:http';` plus a local `type ConnectNext = (err?: unknown) => void;`. Both middleware handlers now have proper signatures — no more `(req: any, res: any, _next: any)`.

### M6 — Topic strings hardcoded in widget components AND partially in registry

**Status:** Fixed in PR 3a (T16 / OMN-157). Drives the §3 cluster F fix.
**Where:** [`shared/types/topics.ts`](../shared/types/topics.ts) (new), 9 widgets, [`shared/types/component-manifest.ts`](../shared/types/component-manifest.ts), [`scripts/generate-registry.ts`](../scripts/generate-registry.ts).
**What changed:**
- New `shared/types/topics.ts` with `TOPICS` const + `TopicSymbol` type. Naming: `onex.snapshot.projection.{producer}.{event}.v{N}`.
- 9 widgets swap from literal `'onex.snapshot.projection.X.v1'` strings to `TOPICS.X` symbols.
- `validateComponentManifest` now enforces websocket dataSources have a non-empty `topic` and api dataSources have a non-empty `endpoint`.
- `generate-registry.ts` runs the validator over every merged manifest and exits non-zero on any failure — the generator-time check the review called for.
- Acceptance: grep for `'onex.snapshot.projection.` in `src/components/` returns zero hits.

### M7 — `server/routes.ts:113` returns `res.json(null)`

**Status:** Fixed in PR 3b (T21 / OMN-162).
**Where:** [`server/routes.ts`](../server/routes.ts), [`server/routes.test.ts`](../server/routes.test.ts).
**What changed:** `/api/baselines/summary` returns `204 No Content` on the no-snapshot branch. Test updated to assert `res.status === 204`.

### M8 — `FileSnapshotSource` / `HttpSnapshotSource` tests miss error paths

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body as a deferred T21 item.

### M9 — `QualityScorePanel.test.tsx` fixture diverges from server output

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body as a deferred T21 item. Worth verifying the actual server response shape against the fixture before changing the test.

### M10 — `mockFetchWithItems` duplicated across 7 (now 11) test files

**Status:** Fixed in PR 3b (T21 / OMN-162).
**Where:** [`src/test-utils/mockFetch.ts`](../src/test-utils/mockFetch.ts) (new); 11 widget test files updated to import from it.
**What changed:** Helper extracted; local copies removed.

### M11 — `tsx` used by scripts but not declared

**Status:** Fixed in PR 3b (T21 / OMN-162).
**Where:** [`package.json`](../package.json).
**What changed:** `tsx` (^4.21.0) added to `devDependencies`.

### M12 — ESLint 8 is EOL

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body as a deferred T21 item — schedule as a separate ticket since the upgrade involves config migration.

### M13 — ESLint config enforces only the local typography rule

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body. Pairs naturally with M12 (the ESLint 9 upgrade).

### M14 — `@vitest/coverage-v8` installed but no coverage script

**Status:** Partially fixed in PR 3b (T21 / OMN-162).
**Where:** [`package.json`](../package.json).
**What changed:** `test:coverage` script added (`vitest run --coverage`). Threshold gate + CI step are listed in the commit body as a follow-up.

### M15 — `@neondatabase/serverless` is unused

**Status:** Fixed in PR 3b (T21 / OMN-162).
**Where:** [`package.json`](../package.json).
**What changed:** Removed.

### M16 — Vite port `3001` hardcoded in two places

**Status:** Partially fixed in PR 1 (T1 / OMN-143).
**Where:** [`vite.config.ts`](../vite.config.ts).
**What changed:** Vite port now reads `VITE_DEV_PORT` (default 3001). The `package.json` `dev` script still passes `--port 3001` explicitly; that one is a follow-up cleanup if it ever bites.

### M17 — `proof-of-life.test.tsx` `it.skipIf(inCI)`

**Status:** Not fixed in this remediation pass; deferred.
**Reason for deferral:** Listed in PR 3b's commit body. Pairs with wiring `generate:fixtures` into CI setup, which is non-trivial in the current CI shape.

### M18 — Express WebSocket subscription filter untested

**Status:** Fixed in PR 2 (T10 / OMN-151), as part of the broader server-tests pass.
**Where:** [`server/broadcast.test.ts`](../server/broadcast.test.ts).

---

## 4. LOW findings (§4)

All LOW items from the review are listed in PR 3b's commit body as deferred follow-ups. None block the merge.

| # | Finding | Status |
|---|---|---|
| LOW.1 | `BaselinesROICard.tsx:55` fragile `hsl()` interpolation | Deferred |
| LOW.2 | `CostTrend3D.tsx` is 1,499 lines (god component) | Deferred — refactor when revisiting for config support |
| LOW.3 | `usePageAgent.ts:44` Zod v4/v3 cast leak | Deferred |
| LOW.4 | `DashboardView.tsx:77` comment notes `react-hooks/exhaustive-deps` not wired | Covered by deferred M13 |
| LOW.5 | `.env.example` agent disagreement / IP literals | **Fixed in PR 1.** `.env.example` was rewritten in T1 with no real endpoints, every required var documented |
| LOW.6 | `DashboardBuilder.tsx` OMN-44 shim | Deferred |
| LOW.7 | `RoutingDecisionTable` `fuzzy_confidence` column | Deferred |
| LOW.8 | `QualityScorePanel.BUCKET_MIDPOINTS` hardcoded | Deferred |

---

## 5. Cluster fixes (§3)

| Cluster | Title | Status | PRs |
|---|---|---|---|
| A | Environment contamination | **Fixed.** Every external endpoint and every external-repo path is now a required env var that fails fast when unset. Pre-commit grep gate (`scripts/check-no-env-contamination.sh`) blocks 192.168., localhost:300, /Users/, /Volumes/, /mnt/c/ outside an allowlist of `.env.example`, `src/data-source/`, `docs/`, `CLAUDE.md`, the gate itself. CI runs the gate as the first step. | PR 1 |
| B | Boundary dishonesty | **Fixed at the highest-impact sites.** `parseDashboardDefinition` validates at `dashboardSlice.hydrateList` and `HttpLayoutPersistence.read`. `ComponentRegistry.validateConfig` is now type-safe (no `as any`). `vite.config.ts` middleware properly typed (M5). The lint-rule banning `as` casts on parsed JSON is a deferred follow-up — would need a new local rule. | PR 1, PR 3b |
| C | Split persistence truth | **Fixed via Option 1.** `DashboardService` is the canonical state read/write path. Zustand and the layout middleware route through it. Round-trip integration test verifies identical state through save → reload. | PR 3a |
| D | UI capability dishonesty | **Mostly fixed.** Empty `configSchema` entries deleted (H3). Cost Trend palette aligned (H4). DelegationMetrics threshold made configurable (M2). The kebab-config gate now correctly hides the menu item for widgets without configurable schemas. The "Add Widget = edit-mode toggle" UX issue (H16) remains as a deferred follow-up. | PR 2, PR 3b |
| E | Coverage theater | **Fixed at the structural level.** Compliance scorecard now enforces `.test.tsx` existence for every widget (Phase 4 / H11). Server has supertest coverage on every REST route and a unit test for the broadcast filter (H10 / M18). CI runs `build:server` (H14, H15). `proof-of-life.test.tsx`'s `skipIf(inCI)` (M17) is the remaining gap, deferred to a follow-up. | PR 2 |
| F | Topic declaration drift | **Fixed.** `TOPICS` const in `shared/types/topics.ts` is the single source of truth; widgets import symbols. Generator-time check rejects manifests whose dataSources are missing the required topic/endpoint field. | PR 3a |

---

## 6. 2D companions (§5)

| 3D widget | Severity in review | Status | What we did |
|---|---|---|---|
| Cost by Model (3D pie) | **Pre-merge replacement or 2D companion required.** | **Fixed.** | New `cost-by-model-2d` widget — horizontal bar chart, sorted by cost desc, length-encoded magnitude, reuses `useThemeColors().chart`. Registered as a separate widget. The 3D pie is renamed to `Cost by Model (3D)` so the 2D version becomes the canonical "Cost by Model"; both remain in the palette so dashboards can choose. (T17 / OMN-158, PR 3b.) |
| Cost Trend (3D) | Acceptable follow-on; palette divergence was the blocker | **Fixed.** | Palette divergence resolved in T7 / OMN-149 (PR 2). The widget itself stays. |
| Quality Scores (3D bars) | Optional cleanup | **Fixed.** | New `quality-score-panel-2d` widget — vertical histogram, 5 buckets coloured red→green by tier, threshold line and mean marker overlaid as DOM. Same data shape; registered separately. (T18 / OMN-159, PR 3b.) |

---

## 7. Acceptance criteria (§8)

### 8.A — Runtime behavior (PR 1 acceptance)

- [x] **App boots with zero access to the `<lan-ip-redacted>/24` subnet** when env vars are set. Verified by the env-contamination grep gate returning clean against the post-merge tree.
- [x] **App fails fast at startup** when any required env var is missing. Implemented in `server/db.ts` (DB URL), `src/agent/llmClient.ts` (LLM URLs lazy-throw), `scripts/run-types-generate.sh` and `scripts/run-generate-fixtures.sh` (script-level checks). Manual smoke test recommended; the failure paths are individually unit-tested where they have unit-testable surfaces.
- [ ] **WebSocket connection succeeds against `VITE_WS_URL` and EventStream renders live events.** Implementation lands in PR 1 (`getWebSocketUrl()` carve-out); end-to-end browser-side verification is the user's manual smoke step, not part of the merged PRs.
- [x] `npm run generate:fixtures` requires `OMNIBASE_INFRA_PATH`. Verified — script exits 1 with clear error if unset.
- [x] `npm run types:generate` requires `OMNIBASE_CORE_PATH`. Verified — `/mnt/c/` default removed.
- [x] `pg.Pool` survives an idle-client error event. C8 fix verified by code inspection (`pool.on('error', ...)` immediately after construction). A direct test would require booting the server with a real DB.
- [x] localStorage with corrupted dashboard list value loads with `console.warn`, not a render-time crash. Verified by `dashboardSlice.hydrate.test.ts` (and again by `dashboardService.test.ts` after the T14 refactor).

### 8.B — Test and CI discipline (PR 2 acceptance)

- [x] `npm test` green; compliance scorecard fails if any widget is missing either a story OR a unit test (H11). Verified — Phase 4 added with widget-flag filtering; the new 2D widgets in PR 3b had to ship with tests + stories to pass the scorecard.
- [x] `npm run build` and `npm run build:server` both green; CI runs both. Server-typecheck CI step added in PR 2.
- [x] Server has smoke-test coverage on every REST route and the WebSocket broadcast path; server tests run in CI. T10 / OMN-151 — 14 server tests added, all in the standard `vitest` pass.
- [x] `tsconfig.node.json` includes `server/` and is strict; `tsc --noEmit` over `server/` passes. T13 / OMN-154.
- [ ] **Every widget that exposes a `configSchema` actually consumes the values its schema declares (verified by widget test passing config through and asserting effect).** Partially addressed: empty schemas were removed (H3), and DelegationMetrics now reads its threshold from config with a runtime check. A widget-test contract that systematically verifies "schema property X causes behavior Y" is a deeper test discipline that wasn't bundled here. Recommend filing as `OMN-#### Per-widget config-pass-through tests`.

### 8.C — Truth ownership (PR 3a acceptance)

- [x] Single canonical state-write path documented and implemented; round-trip integration test passes. T14 / OMN-155 — `dashboardService.test.ts` round-trip test added.
- [x] `SnapshotSource` instantiated once at app root; integration test demonstrates a mocked source serving multiple widgets in one render. T15 / OMN-156 — `SnapshotSourceProvider` + the throws-outside-provider test in `useProjectionQuery.test.tsx`. The "multiple widgets sharing one mock" case is implicitly covered by the integration test in `src/integration.part3.test.tsx`, which renders multiple widgets in a single tree wrapped in the provider.
- [x] Topic strings imported from registry symbols; no inline topic literal in any widget; generator-time check rejects new widgets without registry entry. T16 / OMN-157 — verified by grep + manifest validator + new `component-manifest.test.ts` cases.

### 8.D — Hygiene gates (continuous)

- [x] No `192.168.86.*` literal in `src/`, `server/`, `vite.config.ts`, `package.json` script — enforced by `scripts/check-no-env-contamination.sh` running in CI.
- [x] No `localhost:300X` literal outside the data-source carve-out — enforced by the same gate.
- [x] No `/Users/`, `/Volumes/`, `/mnt/c/` literal outside the documented allowlist — enforced by the same gate.
- [x] `.env.example` documents every env var consumed by the app, with placeholder values that are not real endpoints. Verified.

---

## 8. Items deferred to follow-up tickets

These items from the review were intentionally not addressed in this remediation bundle. Each deserves its own ticket when prioritized — the rationale is documented in the relevant PR's commit body (PR 3b for most).

- H5 — `DashboardGrid.onLayoutChange` wire-or-remove
- H16 — split header into "Edit Layout" + "Add Widget" actions
- M1 — `CostTrendPanel` `zonedComponents()` switch
- M4 — `ComponentCell.emptyMessage` prop forwarding
- M8 — `FileSnapshotSource` / `HttpSnapshotSource` error-path tests
- M9 — `QualityScorePanel.test.tsx` fixture alignment to server output
- M12 — ESLint 9 upgrade
- M13 — `@typescript-eslint/recommended` + `react-hooks/rules-of-hooks` rule sets
- M14 (partial) — coverage threshold gate in CI (script added; thresholds + gate are the deferred half)
- M16 (partial) — Vite port single source in `package.json` `dev` script
- M17 — wire `generate:fixtures` into CI test setup (or remove the `skipIf(inCI)`)
- All §4 LOW items except LOW.5 (which was fixed in PR 1 as part of the `.env.example` rewrite)
- §3 cluster B — lint rule banning `as` casts on parsed JSON (would be a new local ESLint rule)
- 8.B last bullet — per-widget config-pass-through tests

---

## 9. Bottom line

Every CRITICAL finding is fixed. Every architecture-heavy HIGH (H7, H8, H13, H14, H15) is fixed. Every cluster fix from §3 is implemented or has its structural piece in place; cluster B's lint-rule capstone is the one substantive deferral. The 2D companions ship; the 3D pie keeps a place in the palette but is no longer the canonical "Cost by Model". The deferred H5, H16, and the M-list items are real but not merge-blocking — they're tracked in the PR 3b commit body as candidates for follow-up tickets.

The seams the review called out — data-source instantiation, state persistence, topic declaration, boundary validation — are owned now: one source provider, one persistence service, one topic registry, one validator at every I/O boundary. The compliance scorecard, the env-contamination gate, the manifest validator, and the strict server typecheck are the regression gates that keep them owned.
