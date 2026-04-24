# ADR 002 — Storybook Widget Coverage

**Status:** Accepted
**Date:** 2026-04-24
**Authors:** clone45
**Related:** OMN-100 (Storybook Coverage for Dashboard Widgets epic), OMN-22 (UX polish parent), OMN-59 (Typography Refactor sibling), `docs/plans/storybook-widget-coverage.md`

## Context

OMN-59 scaffolded Storybook 10 in this repo and authored stories for the typography PRIMITIVES (`<Text>`, `<Heading>`). That investment proved Storybook works in the project, wired up the addon set (`@storybook/addon-themes`, `@storybook/addon-a11y`), and gave reviewers a visual catalog for the typography scale. It did not extend to the 17 dashboard widgets that consume those primitives.

The result is a hollow showcase: the alphabet appears in Storybook, but the things built from it do not. Concretely, at the time of this ADR:

- `Typography.stories.tsx` and `Heading.stories.tsx` are the only stories in the repo.
- 17 widgets under `src/components/dashboard/` (RoutingDecisionTable, EventStream, CostTrendPanel, CostTrend3D, CostByModelPie, QualityScorePanel, DelegationMetrics, BaselinesRoiCard, ReadinessGate, CustomRangePicker, DateRangeSelector, TimezoneSelector, AutoRefreshSelector, ComponentWrapper, ComponentPalette, plus their helpers) have no story coverage.
- There is no shared decorator that injects the providers a widget needs to render in isolation (`QueryClientProvider`, `ThemeProvider`).
- There is no fixture module producing realistic projection data for stories to consume.
- A11y violations on widget-level surfaces are invisible — `addon-a11y` has nothing to audit.

For a deliverable described as "professional" to an employer, widget-level Storybook coverage is table stakes. Storybook is the documented surface area, the per-component a11y audit gate, and the foundation for any future visual regression layer. Shipping a design system with stories only for primitives signals "started, not finished."

A separate but related observation: the existing CI Storybook build job from OMN-74 already runs on every PR. It currently catches regressions only on the typography stories — adding widget stories instantly extends its coverage to the dashboard surface with zero CI work.

## Decision

Add a `<Widget>.stories.tsx` file co-located with each widget under `src/components/dashboard/<area>/`. Adopt the following conventions:

1. **Shared decorator.** A `withDashboardContext` decorator in `src/storybook/decorators/` wraps every widget story in a fresh `QueryClientProvider` plus the project's `ThemeProvider`. The decorator is parameterized to support `prefetched` (seed cache for `Populated`), `forceLoading` (queries never resolve), and `forceError` (queries throw). One decorator factory; per-story options drive the state.

2. **Typed fixture builders.** Mock data lives in `src/storybook/fixtures/` as builder functions (`buildRoutingDecisions`, `buildCostDataPoints`, …). Builders import the widget's data interface directly from the widget file — no duplicated type definitions in the fixture module. When a widget exports its row interface for the first time, that's a one-line refactor done as part of the story task.

3. **Real WebGL for three.js widgets.** `CostTrend3D`, `CostByModelPie`, and `QualityScorePanel` render with real WebGL inside the Storybook iframe. No canvas mocking, no headless three.js shim. Modern Chromium-based Storybook iframes support WebGL natively.

4. **State coverage per widget.** At minimum every widget gets `Empty` + `Populated`. `Loading` and `Error` are added wherever they read meaningfully different from `Empty` (most data-driven widgets do; a stateless picker like `CustomRangePicker` does not). Widget-specific states (`HighDisagreement`, `DominantModel`, `LightTheme`, etc.) are added per the plan when they exercise unique visual logic.

5. **Direct cache seeding over network mocking.** The decorator pre-populates `QueryClient` via `setQueryData(queryKey, data)`. No `msw`, no service worker, no fetch interception. The `useProjectionQuery` hook reads from cache like any other React Query consumer; in stories the cache is just hand-fed.

6. **Co-location.** Story files live next to their widgets (`RoutingDecisionTable.stories.tsx` next to `RoutingDecisionTable.tsx`) — not in a `__stories__/` sibling, not in `.storybook/`. This matches the OMN-59 convention and keeps the surface area discoverable when working on a widget.

7. **Compliance test as the gate.** `src/storybook-coverage-compliance.test.ts` (introduced in Task 1 of the plan) is the scorecard. It asserts each story file's existence and the presence of `Empty` / `Populated` exports. Excluded from the default vitest run during the refactor; promoted to a permanent regression gate at Task 18.

## Consequences

| Consequence | Pro | Con | Mitigation |
|---|---|---|---|
| Story file per widget | Documented surface area; reviewer can audit any widget in isolation | Maintenance burden — every widget rev may touch its stories | Minimal viable per widget (`Empty` + `Populated`); expand only when a state has unique visual signal. Stories co-located so a widget edit and its story edit happen together. |
| Shared `withDashboardContext` decorator | Widgets stay decoupled from Storybook specifics; one place to evolve provider context | Decorator becomes a coupling point — a widget needing a new provider drags every story along | Decorator owns the provider tree; widgets remain provider-agnostic. New providers added once in the decorator, picked up by all stories transparently. |
| Storybook build adds to CI time | Coverage of every widget on every PR | `storybook build` adds ~30-60s to CI runtime | Already absorbed in CI from OMN-74; verified scaling fine. Re-evaluate only if Storybook crosses 30 stories. |
| A11y panel runs per-story | Per-component a11y signal, not just whole-page | First pass surfaces violations that need either fixes or documented exceptions | Manual audit pass at Task 18 reviews every story's a11y panel; exceptions documented in this ADR or the task's Linear ticket. |
| Real WebGL for three.js widgets | Stories render the same scene users see — no fidelity gap | Storybook iframe must have explicit dimensions (zero-size container = blank canvas) | Set `parameters.layout = 'fullscreen'` or wrap in a 720px+ container for three.js widgets; documented in plan Task 7. |
| Fixture builders import widget data interfaces | Single source of truth for row shape; refactors break loudly | When a widget's interface isn't currently exported, requires a one-line `export` change to the widget | Acceptable — the export is harmless to the widget's runtime and prevents the worse alternative (type duplication that silently drifts). |
| Direct QueryClient seeding | Simpler than `msw`; no service worker; faster startup per story | Stories don't exercise the real network path | Acceptable — Storybook is a visual + a11y catalog, not an integration test harness. Network-path coverage belongs in vitest + integration tests. |

## Alternatives Considered

1. **`msw` (mock service worker) for network-level mocking.**
   Rejected. Direct `QueryClient.setQueryData` seeding is simpler, faster per story boot, and avoids the service-worker registration sleights of hand `msw` requires inside Storybook iframes. The widgets don't care where the data came from — they read from cache either way. Adopting `msw` would add a runtime dep and a setup step for zero visual fidelity gain.

2. **Per-widget `*.docs.mdx` files instead of stories.**
   Rejected. MDX is for narrative documentation — prose explaining a component, embedded examples, design rationale. It does not provide the per-story a11y audit panel, does not get picked up by the Storybook CI build's "every story renders" gate, and does not support state variants ergonomically. MDX is additive on top of stories, not a replacement. Stories first; MDX may follow if narrative docs are ever requested.

3. **Cypress component testing.**
   Rejected. Storybook is the convention already established here (OMN-59 made the call). Adding a parallel testing harness — second config, second runner, second mental model — increases complexity without filling a gap Storybook leaves open. Cypress component testing is a credible alternative on a greenfield project; this is not greenfield.

4. **Defer story work until a visual regression layer (Chromatic / Playwright visual) is added.**
   Rejected. Stories have standalone value: documented surface area, a11y signal, isolated rendering for design review. Visual regression is icing on the cake — useful when stories already exist, useless without them. The plan explicitly defers visual regression as Out of Scope. Stories are not a prerequisite for visual regression; they are independently the product.

5. **Switch to Histoire or another Storybook alternative.**
   Rejected. Storybook is established (OMN-59 scaffolding, OMN-74 CI build). Switching tools mid-refactor loses that scaffolding investment, requires re-learning addon ecosystem, and saves nothing the stories themselves can't deliver. Histoire is a reasonable choice on day zero of a project; the marginal benefit at this stage is negative.

## Related Work

- **OMN-59** (Typography Refactor) — scaffolded Storybook 10.3.5 with `@storybook/addon-themes` and `@storybook/addon-a11y`. This ADR builds directly on that scaffolding; the addon set, the `withThemeByDataAttribute` global decorator in `.storybook/preview.tsx`, and the `Typography.stories.tsx` / `Heading.stories.tsx` shape are the templates this work extends.
- **OMN-74** (CI Storybook build job) — added the `storybook build` step to PR CI. Widget stories slot into this gate at zero additional CI cost.
- **OMN-22** (UX polish parent epic) — the deliverable polish pass this work contributes to.

## References

- Plan: `docs/plans/storybook-widget-coverage.md`
- Epic: OMN-100
- Compliance scorecard: `src/storybook-coverage-compliance.test.ts`

## Status

Accepted.
