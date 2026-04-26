# omnidash-v2 — Requirements Compliance Audit

Audit of the project against the original engagement specs, written
as a pre-handoff sanity check.

## Documents reviewed

| Doc | Status | Used? |
|---|---|---|
| `2026-04-17-dashboard-local-integration.md` (52 KB) | **Authoritative spec for OMN-22** — drove every Task ticket OMN-23 → OMN-35 | **Yes** |
| `2026-04-19-omnidash-v2-part-3-engagement-report.md` (19 KB) | Post-delivery report; describes what shipped + open follow-ups | **Yes** |
| `2026-04-15-widget-dashboard-framework-spec.md` (25 KB) | **Marked OUTDATED at the top of the doc** — superseded same-day by a scope reset | **No, ignored** |
| `2026-04-14-market-node-dashboard-components.md` (31 KB) | **Different project entirely** — a per-market-node observability card for 103 ONEX nodes (`/nodes/:node_name`). Not the dashboard builder we built. | **Not applicable** |

The 04-14 doc has tripped me up before — it talks about `NodeDashboardCard`,
`/api/nodes/:name` endpoints, Backend-A through Backend-D, and 103 nodes. None
of that is omnidash-v2. The OMN-22 epic was kicked off two days later with a
totally different scope: a **drag-and-drop dashboard builder** with
configurable widgets and a local-file data source. The 04-17 doc is what we
actually built against.

---

## Acceptance criteria — 04-17 §Acceptance criteria

The 04-17 plan listed 8 acceptance items. Their current state:

| # | Criterion | Status |
|---|---|---|
| 1 | `npm install && npm run types:generate && npm run generate:fixtures && npm run generate:registry && VITE_DATA_SOURCE=file npm run dev` reaches the dashboard at `localhost:3001` within 10 minutes | ✅ **Met** — confirmed during the engagement and again during ongoing work this week. |
| 2 | `npm test` (vitest) passes | ✅ **Met** — 443/443 tests pass across 58 test files. (An earlier audit pass under-counted — five regressions were introduced by polish work this week and have been fixed: the registry move broke three integration tests; the palette regroup left a stale assertion in `buildSystemPrompt.test.ts`; the widget-config audit removed `showBudgetLine` but a manifest-validation test still referenced it. Full suite re-run after the fixes is the source for this row.) |
| 3 | `npm run check` (`tsc --noEmit` strict) passes | ✅ **Met** — typechecked clean before every commit this session. |
| 4 | All 7 widgets render in file-mode against fixtures from `generate_fixtures.py` | ✅ **Met** — registry now lists 9 widgets (7 originals + Cost Trend 3D + Cost by Model added later). All have summary fixtures. |
| 4b | HTTP-mode best-effort | ⏸ **Best-effort, not blocking** — `HttpSnapshotSource` has unit tests confirming the contract; not end-to-end verified against a live Express server (none running on contractor machine). |
| 5 | Component config via `@rjsf` persists across save+reload; validation errors block Save; Discard restores last persisted | ✅ **Met** — `ComponentConfigPanel.tsx` implements draft/validate/save/discard. Recently audited; broken stubs cleaned up (see `widget-config-audit.md`). |
| 6 | Adding a fixture package at `node_modules/@omninode/*` with a valid `dashboardComponents` manifest causes manifests to surface in the palette via `npm run generate:registry`. Components without local `implementationKey` show `status: 'not_implemented'` | ✅ **Met** — `scanInstalledPackages()` in `scripts/generate-registry.ts` iterates `node_modules/@omninode/*`. Discovery-only is the intended scope per the plan. |
| 7 | No new hardcoded `localhost:3002` references in `src/` outside the data-source factory carve-out | ⚠ **Two pre-engagement holdovers remain** — `src/components/dashboard/events/EventStream.tsx:24` and `src/hooks/useWebSocketInvalidation.ts:17` both reference `ws://localhost:3002/ws`. These predate Part 3; tracked as **OMN-37** ("Introduce `VITE_WS_DATA_SOURCE_URL` carve-out for the WebSocket bridge"). The HTTP carve-out itself is properly contained inside `src/data-source/index.ts`. |
| 8 | `./fixtures/`, `./dashboard-layouts/`, and `./build/` all `.gitignore`'d | ✅ **Met** — confirmed in `.gitignore`. |

---

## Task delivery — 04-17 §Task 1–12

The plan defined 12 tasks; the engagement report confirms all 12 merged as
OMN-23 → OMN-35. Spot-checked file-by-file:

| Task | Artifact | Status |
|---|---|---|
| 1 | `omnidash-v2/CLAUDE.md` "Local dev mode" section | ✅ Present; updated this session for the `src/registry/component-registry.json` move (was in `public/`). |
| 2 | TS type generation pipeline | ✅ `scripts/run-types-generate.sh` + `src/shared/types/generated/{onex-models,enum-dashboard-widget-type}.ts`. |
| 3 | `ProtocolSnapshotSource` interface + factory | ✅ `src/data-source/protocol-snapshot-source.ts` + `src/data-source/index.ts`. |
| 4 | `FileSnapshotSource` | ✅ `src/data-source/file-snapshot-source.ts` (+ test). |
| 4b | Vite fixtures middleware | ✅ `vite.config.ts:fixturesMiddleware`. |
| 5 | `HttpSnapshotSource` | ✅ `src/data-source/http-snapshot-source.ts` (+ test). |
| 6 | `useProjectionQuery` retrofit | ✅ `src/hooks/useProjectionQuery.ts` reads from `createSnapshotSource()`. |
| 7 | Python fixture generator producing summary shapes | ✅ `scripts/generate_fixtures.py` — produces both per-entity records and the per-widget summary shapes (resolves the "summary-shape question" Jonah answered on day 2). |
| 8 | `node_modules/@omninode/*` scanner | ✅ `scripts/generate-registry.ts:scanInstalledPackages()`. |
| 9 | Layout persistence | ✅ `src/layout/layout-persistence.ts` + `vite.config.ts:layoutsMiddleware`. |
| 10 | Per-component config panel (RJSF) | ✅ `src/config/ComponentConfigPanel.tsx`. |
| 11 | Hint-to-component preference heuristic | ✅ `src/hint/hint-matcher.ts`. |
| 12 | Proof-of-life test | ✅ `tests/proof-of-life.test.tsx`. |

---

## Follow-ups from the engagement report

The engagement report flagged two non-blocking follow-ups; both are still
open at the time of this audit:

| Ticket | Status as of 2026-04-26 |
|---|---|
| **OMN-36** — Filter `index.json` out of `fixturesMiddleware` synthetic topic listing | Open (latent — generator never writes `index.json`, so no observable bug today). |
| **OMN-37** — `VITE_WS_DATA_SOURCE_URL` carve-out for the WebSocket bridge | Open (paired with the two `localhost:3002` holdovers in Acceptance #7). |

---

## What's been delivered since the engagement report

The 04-19 report covered OMN-23 → OMN-35 (the Part 3 plan). After that, a
substantial amount of polish, refactor, and feature work landed under the
same OMN-22 umbrella. Summary, in rough chronological order:

- **Day-2 fixes (OMN-38 / OMN-39)** — "+ New dashboard" button in header; live `RegistryProvider` calls `resolveImplementations()`. Both merged.
- **OMN-46 → OMN-58 — UX polish pass.** Verbatim CSS port from prototype, sidebar/footer cleanup, widget chrome polish, drag-and-drop drop-slots, theme wiring, masonry grid reflow, routing-table search/sort/paginate (the widget-level features Jonah's prototype implied but the original plan didn't specify).
- **OMN-59 → OMN-99 — Typography system refactor.** Design tokens, `<Text>`/`<Heading>` primitives, ESLint rule (`local/no-typography-inline`), permanent compliance scorecard. ADR at `docs/adr/001-typography-system.md`.
- **OMN-100 → OMN-118 — Storybook widget-coverage.** Decorator + fixtures + per-widget stories with Empty/Loading/Error/Populated state coverage. Permanent compliance scorecard. ADR at `docs/adr/002-storybook-widget-coverage.md`.
- **OMN-119 → OMN-131 — Late polish for handoff.** AgentChat / Sidebar / FrameLayout / DeleteDashboardDialog / ComponentConfigPanel stories; timezone selector; auto-refresh selector with live countdown; topbar Refresh button; delete confirmation; 3D doughnut for DelegationMetrics; collapsible left rail; widget palette regroup by domain.
- **Late doc work** — `widget-config-audit.md` (this audit's sibling) caught and fixed three lying-stub config fields plus the orphaned page-size, and gates "Configure Widget" on whether a manifest has any configurable properties.

None of that was in the 04-17 plan — all of it was post-handoff continuation
work the contractor and Jonah agreed to.

---

## Open / deferred items

| Item | Source | Status |
|---|---|---|
| OMN-36 — `index.json` filter in fixtures middleware | Engagement report follow-up | Open, latent |
| OMN-37 — WebSocket URL carve-out (also satisfies Acceptance #7) | Engagement report follow-up | Open |
| OMN-130 — AgentLauncher (AI orb) visual redesign | Filed during OMN-119 story coverage | Open, backlog |
| OMN-128 — Responsive design pass for smaller viewports | Filed earlier this week | Canceled per Bret's call |
| HTTP-mode end-to-end verification | Acceptance criterion 4b (best-effort) | Open until run against a live Express server |

---

## Bottom line

The original engagement (Tasks 1–12 of the 04-17 plan, OMN-23 through
OMN-35) is **delivered and verified** per the engagement report and
re-spot-checked here.

The two acceptance items not fully cleared are explicitly best-effort
items the spec accepted as non-blocking:

- **HTTP-mode end-to-end** — has unit-test coverage; needs a live Express
  server to verify the wire shape.
- **Hardcoded `localhost:3002` count** — two pre-engagement WebSocket-URL
  holdovers remain. Tracked as OMN-37; not produced by Part 3 work.

Everything else in the 04-17 spec is met. The post-engagement work
(typography refactor, storybook coverage, all the polish from this
week) goes well beyond the original requirements and was scoped
ad-hoc with Bret's direction.

The 04-14 "per-market-node dashboard components" spec is a **separate
project**, not part of OMN-22, and should not be cited as
omnidash-v2 requirements during the handoff.
