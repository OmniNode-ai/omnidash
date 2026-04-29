# OmniDash — Development Guide

**Owner:** `omnidash`
**Last verified:** 2026-04-29
**Verification:** `npm run check && npm run test:run`

---

## Prerequisites

- Node.js (version managed by the project).
- `npm` (bundled with Node.js).
- No backend services required for dev mode.

---

## Install

```bash
npm install
```

---

## Data Source Modes

OmniDash runs in two modes selected by the `VITE_DATA_SOURCE` environment variable.

### File mode (default)

```bash
npm run dev
# or explicitly:
VITE_DATA_SOURCE=file npm run dev
```

Reads data from `./fixtures/<topic>/` JSON files. Persists layouts to `./dashboard-layouts/`. Both directories are gitignored. Zero infrastructure required.

### HTTP bridge mode

```bash
VITE_DATA_SOURCE=http npm run dev
```

Reads via the Express bridge at `http://localhost:3002`. Requires the bridge server to be running:

```bash
npm run dev:server
```

The bridge connects to the running ONEX runtime. Use this mode when you need live data from the event bus.

**Hard rule:** Do NOT hardcode `localhost:3002` in source files. All data access goes through `src/data-source/` adapters.

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR (file mode by default) |
| `npm run dev:server` | Express bridge server (watch mode) |
| `npm run check` | TypeScript-only check (`tsc --noEmit`) — must pass before every PR |
| `npm run test:run` | Vitest single run — must pass before every PR |
| `npm run test` | Vitest watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint` | ESLint with zero warnings — must pass before every PR |
| `npm run build` | Type-check then production build |
| `npm run generate:registry` | Rewrite `src/registry/component-registry.json` |
| `npm run generate:fixtures` | Regenerate fixture snapshots |
| `npm run types:generate` | Regenerate types under `src/shared/types/generated/` |
| `npm run storybook` | Storybook on port 6006 |
| `npm run build-storybook` | Production Storybook build |

---

## Before Every PR

```bash
npm run lint       # must exit 0
npm run check      # must exit 0
npm run test:run   # must exit 0
npm run build      # must exit 0
```

---

## Adding a New Widget

### Track A: Local MVP widget

Use this track for all in-repo widgets.

1. Create `src/components/dashboard/<name>/<Name>.tsx`. Default-export a React component that accepts a `config` prop shaped per its manifest's `configSchema`.

2. Register the lazy import in `src/components/dashboard/index.ts`:
   ```ts
   '<name>/<Name>': lazy(() => import('./<name>/<Name>')),
   ```

3. Add a manifest entry to `MVP_COMPONENTS` in `scripts/generate-registry.ts`:
   ```ts
   '<name>/<Name>': {
     name: '<name>',
     displayName: 'Widget Display Name',
     // ...full ComponentManifest fields
   }
   ```

4. Run registry generation:
   ```bash
   npm run generate:registry
   ```

5. Add at minimum `Empty` and `Populated` Storybook stories as `<Name>.stories.tsx` alongside the component. The compliance test enforces this on every `npm test`.

6. Add unit tests as `<Name>.test.tsx` alongside the component.

### Track B: External package widget

External widgets come from `@omninode/*` npm packages.

1. The package must declare manifests in its `package.json`:
   ```json
   "dashboardComponents": "./path/to/manifests.json"
   ```

2. Install the package:
   ```bash
   npm install @omninode/<package-name>
   ```

3. Run registry generation to pick up the new manifests:
   ```bash
   npm run generate:registry
   ```

4. The widget appears in the palette with `status: 'not_implemented'` until its `implementationKey` is also registered in the local `componentImports` map in `src/components/dashboard/index.ts`.

---

## Registry Generation

`scripts/generate-registry.ts` is the single source of truth for what appears in the palette. It:

- Reads `MVP_COMPONENTS` for in-repo widgets.
- Auto-scans `node_modules/@omninode/*` for external package manifests.
- Writes `src/registry/component-registry.json`.

Run it after any manifest change:

```bash
npm run generate:registry
```

The output file is committed. Do not hand-edit it.

If the palette is empty after changes, the registry is likely stale — run `npm run generate:registry` and restart the dev server.

---

## Regenerating All Artifacts

If starting from a fresh clone or after major changes:

```bash
npm run types:generate
npm run generate:fixtures
npm run generate:registry
npm run dev
```

---

## Storybook

Storybook runs on port 6006:

```bash
npm run storybook
```

**Story conventions:**

- Stories live alongside components as `<Name>.stories.tsx`.
- Every widget must export at minimum `Empty` and `Populated` stories.
- Widgets that call `useProjectionQuery` must wrap stories with `makeDashboardDecorator(...)` from `@/storybook/decorators/withDashboardContext`.
- Fixtures live under `src/storybook/fixtures/`. Extend existing fixtures rather than duplicating.

The compliance test `src/storybook-coverage-compliance.test.ts` runs as part of `npm test` and fails if any registered widget is missing required stories.

---

## V1 Backend Assumptions

OmniDash reads data from the ONEX runtime via:

- WebSocket topics for live event streams (Kafka-backed via the ONEX HTTP bridge).
- HTTP endpoints exposed by the Express bridge at `localhost:3002` in HTTP mode.

These endpoints are provided by the ONEX runtime running on `.201` (192.168.86.201). In dev mode, fixture files replace live data entirely and no runtime connection is needed.

The runtime topology is documented in `omni_home/CLAUDE.md` under "Infrastructure Topology".

---

## Gotchas

- **Palette is empty:** `src/registry/component-registry.json` is stale. Run `npm run generate:registry`.
- **Widgets show "no data":** `./fixtures/<topic>/` is missing JSON files or `./fixtures/registry.json` does not list the topic. Run `npm run generate:fixtures`.
- **Edit mode drag/resize not working:** Edit mode is toggled via the `editModeSlice` in Zustand. It must be active. Check `src/store/editModeSlice.ts`.
- **Layout changes not persisting:** Layout does not auto-save on drag. Use the explicit Save button. Layouts write to `./dashboard-layouts/` (gitignored).
- **Types under `src/shared/types/generated/` are wrong:** Run `npm run types:generate` to regenerate from the JSON schema sources.

---

## Key Source Locations

| Path | Purpose |
|------|---------|
| `src/components/dashboard/` | All widget implementations |
| `src/components/dashboard/index.ts` | Lazy-import map |
| `src/components/dashboard/DashboardGrid.tsx` | Grid layout behavior |
| `src/components/dashboard/ComponentPalette.tsx` | Widget palette |
| `src/data-source/` | Data source adapters |
| `src/store/` | Zustand state slices |
| `src/pages/DashboardBuilder.tsx` | Main builder page |
| `src/layout/layout-persistence.ts` | Layout save/load |
| `scripts/generate-registry.ts` | Registry source of truth |
| `src/registry/component-registry.json` | Generated registry |
| `shared/types/dashboard.ts` | `DashboardDefinition` schema |
| `shared/types/component-manifest.ts` | `ComponentManifest` schema |
| `server/index.ts` | Express HTTP bridge |
| `src/storybook/fixtures/` | Shared Storybook fixture data |
