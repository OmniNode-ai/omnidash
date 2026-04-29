> **Shared Standards**: See `~/.claude/CLAUDE.md` for shared development standards
> (Git, testing, infrastructure, env config priority).
> See `omni_home/CLAUDE.md` for repository registry and the worktree workflow.
>
> This file contains **omnidash-specific** frontend architecture and conventions.

## Doctrine integration

Dashboard v2 follows the [OmniNode deterministic truth doctrine](https://github.com/OmniNode-ai/omni_home/blob/main/docs/standards/OMNINODE_DETERMINISTIC_TRUTH_DOCTRINE.md). Components render authoritative data; they do not create it. The component-local contract is `src/components/dashboard/README.md`.

## Local dev mode (no infra)

This repo runs in two modes:
- `VITE_DATA_SOURCE=file` (default in dev) — reads snapshots from `./fixtures/`, persists layouts to `./dashboard-layouts/`. Zero infra required.
- `VITE_DATA_SOURCE=http` — reads via `http://localhost:3002` Express bridge. Used only when we have a running Express server.

### Hard rules

1. **Do NOT hardcode** `localhost:3002` anywhere. All data access goes through `src/data-source/` — either `FileSnapshotSource` or `HttpSnapshotSource`, selected by `VITE_DATA_SOURCE`.
2. **Do NOT let components own truth.** Widgets may render projection/API data and presentation state only. They must not read Postgres, import backend event-bus/database clients, implement reducers, or infer authoritative state. See `src/components/dashboard/README.md`.
3. **Do NOT hand-edit** `src/registry/component-registry.json`. Run `npm run generate:registry`.
4. **Do NOT hand-edit** anything under `src/shared/types/generated/`. Run `npm run types:generate`.
5. **Do NOT edit** any file under `node_modules/`. Components discovered there are read-only.
6. **Fixtures and layouts are not committed.** They live under `./fixtures/` and `./dashboard-layouts/`, both gitignored.

### Common tasks

**Regenerate everything from scratch:**
```bash
npm run types:generate
npm run generate:fixtures
npm run generate:registry
npm run dev
```

**Add a new widget (two tracks — pick one):**

_Track A — local MVP widget (the seven current widgets use this path):_
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
- Grid behavior: `src/components/dashboard/DashboardGrid.tsx`
- Palette: `src/components/dashboard/ComponentPalette.tsx`
- Edit/view toggle: `src/store/editModeSlice.ts`, `src/pages/DashboardBuilder.tsx`
- Layout persistence: `src/layout/layout-persistence.ts`
- Widget lazy-import map: `src/components/dashboard/index.ts`
- Widget MVP manifests: `scripts/generate-registry.ts` (`MVP_COMPONENTS`)
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
