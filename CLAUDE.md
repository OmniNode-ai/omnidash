> **Shared Standards**: See `~/.claude/CLAUDE.md` for shared development standards
> (Git, testing, infrastructure, env config priority).
> See `omni_home/CLAUDE.md` for repository registry and the worktree workflow.
>
> This file contains **omnidash-specific** frontend architecture and conventions.

## Doctrine integration

Dashboard v2 follows the [OmniNode deterministic truth doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md). Components render authoritative data; they do not create it. The component-local contract is `src/components/dashboard/README.md`.

## Local dev mode (no infra)

This repo runs in four modes controlled by `VITE_DATA_SOURCE`. Default values are generated from `contract.yaml` into `src/config/generated/data-source-defaults.ts` via `npm run generate:config`:
- `VITE_DATA_SOURCE=file` (default in dev) — reads snapshots from `./fixtures/`, persists layouts to `./dashboard-layouts/`. Zero infra required.
- `VITE_DATA_SOURCE=http` — reads via the projection backend at `localhost:3002`.
- `VITE_DATA_SOURCE=sqlite` — resolves through `HttpSnapshotSource` (same HTTP read path as `http`, distinction is server-side).
- `VITE_DATA_SOURCE=postgres` — resolves through `HttpSnapshotSource` (same HTTP read path as `http`, distinction is server-side).

A runtime chrome override (`DataSourceControl`) allows switching the active backend without restarting. See `src/data-source/data-source-override.ts` — the single override seam.

### Hard rules

1. **Do NOT hardcode** `localhost:3002` anywhere. All data access goes through `src/data-source/` — `FileSnapshotSource` or `HttpSnapshotSource`, selected by the effective mode from `resolveEffectiveDataSource()`.
2. **Do NOT read `VITE_DATA_SOURCE` directly in components.** Always call `resolveEffectiveDataSource()` from `src/data-source/data-source-override.ts` so the runtime chrome override is honored.
3. **Do NOT place `/api/` path literals in fetch or axios calls outside `src/services/` or `src/data-source/`.** The `local/no-api-literal` ESLint rule blocks this with error. Route paths belong behind the services seam.
4. **Do NOT let components own truth.** Widgets may render projection/API data and presentation state only. They must not read Postgres, import backend event-bus/database clients, implement reducers, or infer authoritative state. See `src/components/dashboard/README.md`.
5. **Do NOT hand-edit** `src/registry/component-registry.json`. Run `npm run generate:registry`.
6. **Do NOT hand-edit** anything under `src/shared/types/generated/`. Run `npm run types:generate`.
7. **Do NOT edit** any file under `node_modules/`. Components discovered there are read-only.
8. **Fixtures are committed; dashboard-layouts are not.** `./fixtures/` is tracked via a carve-out in `.gitignore` (`!fixtures/`, `!fixtures/**`). `./dashboard-layouts/` remains gitignored. See `git ls-files fixtures/` to inspect tracked snapshots.

### Common tasks

**Regenerate everything from scratch:**
```bash
npm run types:generate
npm run generate:fixtures
npm run generate:registry
npm run dev
```

**Add a new widget (two tracks — pick one):**

_Track A — local widget (approximately 30 widget directories currently use this path):_
1. Create `src/components/dashboard/<name>/<Name>.tsx`. Default-export a React component that accepts a `config` prop shaped per its manifest.
2. Consume data through `useProjectionQuery(...)` or an approved `src/data-source/` adapter. Add an upstream projection/API surface before adding any component-side reducer or backend client.
3. Register the lazy import in `src/components/dashboard/index.ts` under its `implementationKey` (e.g. `'<name>/<Name>': lazy(() => import('./<name>/<Name>'))`).
4. Add the manifest entry to the `MVP_COMPONENTS` object in `scripts/generate-registry.ts`. This is the canonical MVP manifest location — there is no per-widget `manifest.ts` file for local widgets.
5. Run `npm run generate:registry` to rewrite `src/registry/component-registry.json`.
6. Restart dev server.

_Track B — external package widget (plugin extension path):_
1. Publish an `@omninode/*` npm package containing your widget component plus a JSON manifest file listing one or more `ComponentManifest` entries.
2. Reference the manifest path in the package's `package.json` via `"dashboardComponents": "./path/to/manifests.json"`.
3. `npm install` the package into omnidash.
4. Run `npm run generate:registry` — the script auto-scans `node_modules/@omninode/*` and merges discovered manifests into the registry.
5. Dynamic code loading for external packages is a future phase; for now they surface in the palette with `status: 'not_implemented'` unless their `implementationKey` also appears in the local `componentImports` map.

**Add a new data source adapter:**
1. Create `src/data-source/<name>-snapshot-source.ts` implementing `ProtocolSnapshotSource`.
2. Register it in `src/data-source/index.ts` under its `VITE_DATA_SOURCE` key.
3. Add a test in `src/data-source/<name>-snapshot-source.test.ts`.

### Gotchas

- Edit mode toggle is in the Zustand `editModeSlice`. Drag and resize are ONLY enabled when edit mode is active.
- When you move a widget on the canvas, save the layout explicitly (`Save` button) — it does NOT auto-persist per drag.
- If the palette is empty, your `src/registry/component-registry.json` is likely out of date. Run `npm run generate:registry`.
- If widgets render but show "no data", check `./fixtures/<topic>/` has JSON files and `./fixtures/registry.json` lists the topic.

### Where to look

- Data fetching: `src/data-source/`
- Runtime data-source override seam: `src/data-source/data-source-override.ts`
- API route seam (`/api/` calls): `src/services/` — all fetch/axios calls with `/api/` paths live here, enforced by `local/no-api-literal`
- Grid behavior: `src/components/dashboard/DashboardGrid.tsx`
- Palette: `src/components/dashboard/ComponentPalette.tsx`
- Edit/view toggle: `src/store/editModeSlice.ts`, `src/pages/DashboardBuilder.tsx`
- Layout persistence: `src/layout/layout-persistence.ts`
- Widget lazy-import map: `src/components/dashboard/index.ts`
- Widget manifests: `scripts/generate-registry.ts` (`MVP_COMPONENTS`)
- External package manifest discovery: `scripts/generate-registry.ts` → `scanInstalledPackages()`

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
  (e.g. `src/components/dashboard/quality/QualityScorePanel.stories.tsx`).
- Any widget that calls `useProjectionQuery` must wrap its stories with
  `makeDashboardDecorator(...)` from
  `@/storybook/decorators/withDashboardContext` so the projection client
  is seeded with deterministic fixture data.
- Fixtures live under `src/storybook/fixtures/` and are exported via
  `src/storybook/fixtures/index.ts`. Extend existing fixtures rather
  than duplicating — every story should compose from the shared barrel.
- Each widget must expose at minimum `Empty` and `Populated` story
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
