## Local dev mode (no infra)

This repo runs in two modes:
- `VITE_DATA_SOURCE=file` (default in dev) — reads snapshots from `./fixtures/`, persists layouts to `./dashboard-layouts/`. Zero infra required.
- `VITE_DATA_SOURCE=http` — reads via `http://localhost:3002` Express bridge. Used only when we have a running Express server.

### Hard rules

1. **Do NOT hardcode** `localhost:3002` anywhere. All data access goes through `src/data-source/` — either `FileSnapshotSource` or `HttpSnapshotSource`, selected by `VITE_DATA_SOURCE`.
2. **Do NOT hand-edit** `public/component-registry.json`. Run `npm run generate:registry`.
3. **Do NOT hand-edit** anything under `src/shared/types/generated/`. Run `npm run types:generate`.
4. **Do NOT edit** any file under `node_modules/`. Components discovered there are read-only.
5. **Fixtures and layouts are not committed.** They live under `./fixtures/` and `./dashboard-layouts/`, both gitignored.

### Common tasks

**Regenerate everything from scratch:**
```bash
npm run types:generate
npm run generate:fixtures
npm run generate:projection-registry
npm run generate:registry
npm run dev
```

**Add a new widget:**
1. Create `src/components/dashboard/<name>/<Name>.tsx` that accepts `{ projection, snapshots }` via its config.
2. Create `src/components/dashboard/<name>/manifest.ts` exporting a `ComponentManifest`.
3. Run `npm run generate:registry` to pick it up.
4. Restart dev server.

**Add a new data source adapter:**
1. Create `src/data-source/<name>-snapshot-source.ts` implementing `ProtocolSnapshotSource`.
2. Register it in `src/data-source/index.ts` under its `VITE_DATA_SOURCE` key.
3. Add a test in `src/data-source/<name>-snapshot-source.test.ts`.

### Gotchas

- Edit mode toggle is in the Zustand `editModeSlice`. Drag and resize are ONLY enabled when edit mode is active.
- When you move a widget on the canvas, save the layout explicitly (`Save` button) — it does NOT auto-persist per drag.
- If the palette is empty, your `public/component-registry.json` is likely out of date. Run `npm run generate:registry`.
- If widgets render but show "no data", check `./fixtures/<topic>/` has JSON files and `./fixtures/registry.json` lists the topic.

### Where to look

- Data fetching: `src/data-source/`
- Grid behavior: `src/components/dashboard/DashboardGrid.tsx`
- Palette: `src/components/dashboard/ComponentPalette.tsx`
- Edit/view toggle: `src/store/editModeSlice.ts`, `src/pages/DashboardBuilder.tsx`
- Layout persistence: `src/layout/layout-persistence.ts`
- Widget manifests: `src/components/dashboard/<name>/manifest.ts`
