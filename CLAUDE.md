> **Shared Standards**: See `~/.claude/CLAUDE.md` for shared development standards
> (Git, testing, infrastructure, env config priority).
> See `omni_home/CLAUDE.md` for repository registry and the worktree workflow.
>
> This file contains **omnidash-specific** frontend architecture and conventions.

## Doctrine integration

Dashboard v2 follows the [OmniNode deterministic truth doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md). Components render authoritative data; they do not create it. The component-local contract is `src/components/dashboard/README.md`.

## Local dev mode (no infra)

This repo runs in four modes controlled by `VITE_DATA_SOURCE`. Default values are generated from `contract.yaml` into `src/config/generated/data-source-defaults.ts` via `npm run generate:config`:
- `VITE_DATA_SOURCE=file` (default in dev) — reads snapshots from `./fixtures/`. Zero infra required.
- `VITE_DATA_SOURCE=http` — reads via the projection backend at `localhost:3002`.
- `VITE_DATA_SOURCE=sqlite` — resolves through `HttpSnapshotSource` (same HTTP read path as `http`, distinction is server-side).
- `VITE_DATA_SOURCE=postgres` — resolves through `HttpSnapshotSource` (same HTTP read path as `http`, distinction is server-side).

The active backend can be overridden at runtime through the single override seam, `src/data-source/data-source-override.ts`. (The in-app `DataSourceControl` chrome that exposed this was removed with the widget builder in OMN-13602; the seam itself is unchanged.)

### Hard rules

1. **Do NOT hardcode** `localhost:3002` anywhere. All data access goes through `src/data-source/` — `FileSnapshotSource` or `HttpSnapshotSource`, selected by the effective mode from `resolveEffectiveDataSource()`.
2. **Do NOT read `VITE_DATA_SOURCE` directly in components.** Always call `resolveEffectiveDataSource()` from `src/data-source/data-source-override.ts` so the runtime chrome override is honored.
3. **Do NOT place `/api/` path literals in fetch or axios calls outside `src/services/` or `src/data-source/`.** The `local/no-api-literal` ESLint rule blocks this with error. Route paths belong behind the services seam.
4. **Do NOT let components own truth.** Widgets may render projection/API data and presentation state only. They must not read Postgres, import backend event-bus/database clients, implement reducers, or infer authoritative state. See `src/components/dashboard/README.md`.
5. **Do NOT hand-edit** anything under `src/shared/types/generated/`. Run `npm run types:generate`.
6. **Do NOT edit** any file under `node_modules/`.
7. **Fixtures are committed.** `./fixtures/` is tracked via a carve-out in `.gitignore` (`!fixtures/`, `!fixtures/**`). See `git ls-files fixtures/` to inspect tracked snapshots.

### Common tasks

**Regenerate everything from scratch:**
```bash
npm run types:generate
npm run generate:fixtures
npm run dev
```

**The dashboard (OMN-13602 green-field).** The widget-builder framework (registry, palette, drag/resize grid, per-widget config, multi-dashboard CRUD, edit mode) was removed. The dashboard is now a single fixed page — `src/pages/DashboardPage.tsx`, rendered by `App.tsx` for the `dashboard` route. It is currently an empty slate; the delegation & savings sections are built directly in code on top of it (one presentational component per surface, each owning one projection topic via `useProjectionQuery`), not composed at runtime from a registry. The six operator tools (Delegation Evidence, Event Bus, Experimentation, SEA Control Plane, Instruction Eval, Feature Flags) are separate routed pages reached from the sidebar.

**Add a dashboard section:**
1. Create a presentational component under `src/pages/dashboard/sections/` (folder added when the section build-out starts). Take data through `useProjectionQuery({ topic })` — never read Postgres or own truth in a component.
2. Import and place it directly in `DashboardPage.tsx`. There is no registry to regenerate and no manifest to edit.
3. Add a fixture under `./fixtures/<topic>/` so it renders in `file` mode.

**Add a new data source adapter:**
1. Create `src/data-source/<name>-snapshot-source.ts` implementing `ProtocolSnapshotSource`.
2. Register it in `src/data-source/index.ts` under its `VITE_DATA_SOURCE` key.
3. Add a test in `src/data-source/<name>-snapshot-source.test.ts`.

### Gotchas

- If a section renders but shows "no data", check `./fixtures/<topic>/` has JSON files and `./fixtures/registry.json` lists the topic.
- The store is two slices: `uiSlice` (sidebar collapse + active page) and `filtersSlice` (global filters). The builder slices (edit mode, dashboards, config, conversation) were removed in OMN-13602.

### Where to look

- Data fetching: `src/data-source/`
- Runtime data-source override seam: `src/data-source/data-source-override.ts`
- API route seam (`/api/` calls): `src/services/` — all fetch/axios calls with `/api/` paths live here, enforced by `local/no-api-literal`
- The dashboard page: `src/pages/DashboardPage.tsx`
- Dashboard sections (build-out): `src/pages/dashboard/sections/`
- Operator-tool pages: `src/pages/` (DelegationEvidencePage, EventBusPage, ExperimentsPage, SeaControlPage, InstructionEvalPage, FeatureFlagDashboard)
- App shell + routing: `src/App.tsx`, `src/components/frame/` (FrameLayout, Sidebar, Header)
- Store: `src/store/` (`uiSlice`, `filtersSlice`)

## Typography

- All text in widgets must be rendered via `<Text>` or `<Heading>` from
  `@/components/ui/typography`. Do not set `fontSize`, `fontFamily`,
  `fontWeight`, text `color`, `textTransform`, or `letterSpacing` in
  inline `style` props — enforced by the local ESLint rule
  `local/no-typography-inline`.
- Tokens live in `src/styles/globals.css :root`. See
  `docs/adr/001-typography-system.md` for rationale.
- Showcase: `npm run storybook` → Typography pages.

## Storybook conventions

- New stories live alongside their component as `<Name>.stories.tsx`
  (e.g. `src/components/frame/Sidebar.stories.tsx`).
- Any component that calls `useProjectionQuery` must wrap its stories with
  `makeDashboardDecorator(...)` from
  `@/storybook/decorators/withDashboardContext` so the projection client
  is seeded with deterministic fixture data.
- The shared `src/storybook/fixtures/` barrel was removed with the widget
  catalog in OMN-13602; section stories define their own fixture data, or
  seed the store directly as the frame stories do.
- Each component with stories must expose at minimum `Empty` and `Populated`
  exports. State-specific variants (`Loading`, `Error`,
  `HighDisagreement`, `BalancedSplit`, etc.) are encouraged where
  meaningful. The compliance scorecard
  `src/storybook-coverage-compliance.test.ts` enforces this contract on
  every `npm test`. See `docs/adr/002-storybook-widget-coverage.md` for
  rationale.

## Dashboard lineage

Three local directories exist that reference the omnidash product. Canonical classification
verified 2026-05-28 (see `docs/evidence/dashboard-verification/dashboard.md`):

| Directory | Remote | Classification | Notes |
|-----------|--------|----------------|-------|
| `omnidash/` | OmniNode-ai/omnidash.git (`dev`) | **CANONICAL_ACTIVE** | Active development branch; this is the authoritative working repo |
| `omnidash-v2/` | OmniNode-ai/omnidash-v2.git (`dev`) | **SUPERSEDED** | Stale local clone of a separate GitHub remote; 6+ commits behind `omnidash/` as of 2026-05-28. Not a separate product — same product line, diverged remote |
| `omnidash-v2-new/` | OmniNode-ai/omnidash.git (`main`) | **TEMP_STAGING** | Temporary staging clone documented in omni_home CLAUDE.md; ~1 month behind omnidash dev; different commit lineage from current dev |

All development work goes to `omnidash/` on `dev`. Do not commit feature work to `omnidash-v2/` or `omnidash-v2-new/`.
