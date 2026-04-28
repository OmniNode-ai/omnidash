# OmniDash v2

A composable widget dashboard for real-time observability. Vite + React 19, with a per-widget folder layout that keeps 2D and 3D variants of the same chart side by side.

OmniDash v2 is the successor to the v1 Next.js dashboard. The rewrite consolidates each widget into a single self-contained directory, lazy-loads heavy 3D bundles only when selected, and runs against local fixtures by default so contributors can develop without any backing infrastructure.

## Quick Start

```bash
npm install
npm run dev
```

That is the entire setup. The dev server boots in `VITE_DATA_SOURCE=file` mode by default and reads snapshots from `./fixtures/`. No database, no message bus, no external services required.

To point the app at a running HTTP bridge instead:

```bash
VITE_DATA_SOURCE=http npm run dev
```

## Key Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check then production build |
| `npm run check` | TypeScript-only check (`tsc --noEmit`) |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm run test` | Vitest unit tests |
| `npm run storybook` | Storybook on port 6006 |
| `npm run generate:registry` | Regenerate `src/registry/component-registry.json` |
| `npm run generate:fixtures` | Regenerate local fixture snapshots |
| `npm run types:generate` | Regenerate types under `src/shared/types/generated/` |

## Widget Architecture

Every widget lives under `src/components/dashboard/<widget-name>/` and follows the same shape. The directory groups a single conceptual chart together with its dimension variants, tests, and Storybook stories.

Canonical example: `src/components/dashboard/cost-trend/`

```
cost-trend/
  CostTrend.tsx              # dispatcher — picks 2D or 3D variant
  CostTrend2D.tsx            # flat ECharts implementation
  CostTrend3DArea.tsx        # three.js stacked-area scene
  CostTrend3DBars.tsx        # three.js stacked-bar scene
  StackedChart.tsx           # shared internal helper
  CostTrend2D.stories.tsx
  CostTrend3DArea.stories.tsx
  CostTrend3DBars.stories.tsx
  CostTrend.test.tsx
  CostTrend2D.test.tsx
  CostTrend3DArea.test.tsx
  CostTrend3DBars.test.tsx
```

The dispatcher (`CostTrend.tsx`) reads `config.dimension` (`'2d'` or `'3d'`) and `config.style` (`'area'` or `'bar'`) and lazy-imports the matching variant. A consumer that selects 2D never pays the cost of loading three.js.

## Adding a New Widget

1. Create `src/components/dashboard/<name>/<Name>.tsx` and default-export a React component that accepts a `config` prop. If the widget needs both 2D and 3D forms, model the directory on `cost-trend/` — one dispatcher plus one file per dimension variant.
2. Register the lazy import in `src/components/dashboard/index.ts` under your widget's `implementationKey`.
3. Add a manifest entry to `MVP_COMPONENTS` in `scripts/generate-registry.ts`. This is the canonical manifest location for in-repo widgets.
4. Run `npm run generate:registry` to rewrite `src/registry/component-registry.json`. Do not hand-edit that file.
5. Add at minimum `Empty` and `Populated` Storybook stories alongside the component. The compliance scorecard test enforces this on every `npm test`.

## Generating the Registry

`scripts/generate-registry.ts` is the single source of truth for what the palette displays. It composes:

- The `MVP_COMPONENTS` object for in-repo widgets.
- Auto-discovered manifests from any installed `@omninode/*` npm package that declares `"dashboardComponents": "./path/to/manifests.json"` in its `package.json`.

Run it any time you add or remove a widget. The output (`src/registry/component-registry.json`) is committed.

## Development Workflow

- Branch naming: `<author>/<short-description>` (e.g. `alice/cost-trend-tooltip-fix`).
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Run `npm run lint`, `npm run check`, `npm run test`, and `npm run build` before opening a PR.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor guide.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — branch, commit, and review conventions
- [CLAUDE.md](CLAUDE.md) — agent and developer context
- `docs/adr/001-typography-system.md` — typography rules
- `docs/adr/002-storybook-widget-coverage.md` — Storybook coverage rules

## License

[MIT](LICENSE)
