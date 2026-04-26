---
epic_id: OMN-100
repo: omnidash-v2
---

# Storybook Widget Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add Storybook stories for every dashboard widget — Empty / Loading / Error / Populated state coverage per widget — bringing the deliverable in line with senior-reviewer expectations for a professional design system + dashboard package.

**Architecture:** Build on OMN-59's Storybook 10 scaffolding. Add a shared `withDashboardContext` decorator that injects `QueryClientProvider` + `ThemeProvider` so widgets render in isolation. Add a `mockProjections` fixture module providing typed sample data for every projection schema each widget consumes. Each widget gets a `<WidgetName>.stories.tsx` file co-located with the widget. Three.js widgets render in the iframe via real WebGL (no canvas mocking — modern browsers support WebGL inside Storybook's iframe).

**Tech Stack:** Storybook 10.3.5 (already installed via OMN-59), `@storybook/addon-themes`, `@storybook/addon-a11y` (already installed). New: `msw` (mock-service-worker) is NOT used — we use direct fixture injection via the QueryClient prefetch pattern, which avoids network mocking.

**Related ticket:** OMN-100 (Storybook Coverage for Dashboard Widgets epic, child of OMN-22 UX polish, sibling of OMN-59 Typography Refactor)

**Routing:** plan-to-tickets → omninode multi-agent workflow.

**Branch:** `jonah/storybook-widget-coverage` (created from `main` after OMN-59 merges, OR from `jonah/typography-refactor` if OMN-59 still open).

---

## Scope

### In scope

- Compliance test scorecard for this epic
- ADR documenting decorator + fixture conventions
- Shared decorator: `withDashboardContext` (QueryClient + ThemeProvider)
- Mock fixture builder module for projection data
- 13 widget story files covering 14 widgets (TimezoneSelector + AutoRefreshSelector combined into `Selectors.stories.tsx`)
- A11y audit pass: every story shows zero `@storybook/addon-a11y` violations or each is documented
- CI integration: existing OMN-74 Storybook build job catches story regressions on every PR

### Out of scope (explicitly deferred)

- Visual regression testing (Chromatic / Playwright visual). Re-evaluation trigger: a typography or layout regression actually ships to prod, OR Storybook grows past 30 stories.
- Storybook publishing (Chromatic-hosted public Storybook).
- Stories for non-widget components (`DashboardView` page, sidebar `Sidebar.tsx`, agent components).
- Stories for `<Text>` / `<Heading>` themselves — already covered in OMN-72 / OMN-73.
- Visual redesign of any widget. Widgets render as-is; stories just expose their states.

---

## Glossary (freeze before starting)

| Term | Definition |
|---|---|
| Decorator | A Storybook function that wraps every story in a tree of providers (theme, QueryClient, etc.). Defined globally in `.storybook/preview.tsx` or per-story via `decorators: [...]`. |
| Fixture | Static data shape matching what a projection emits at runtime. Exported from `src/storybook/fixtures/` as typed builder functions. |
| State | One of: `Empty` (widget rendered with no data), `Loading` (widget while fetching), `Error` (widget after fetch failure), `Populated` (widget with realistic data). |
| Widget | A React component under `src/components/dashboard/` that consumes data via `useProjectionQuery` and renders to the dashboard grid. |

---

## Known Types Inventory

> Types discovered in the repository that are relevant to this plan.
> Verified via `grep` scan on 2026-04-24.
> Any new type introduced by a task below MUST reference this inventory.

### Existing Storybook types (from OMN-59)

- `Meta`, `StoryObj` — re-exported from `@storybook/react-vite` (which re-exports from `@storybook/react`). Used by `Typography.stories.tsx` and `Heading.stories.tsx`.
- `Preview` — used in `.storybook/preview.tsx`.
- `withThemeByDataAttribute` — from `@storybook/addon-themes`. Already wired in `.storybook/preview.tsx`.

### Existing data layer types (from current widgets)

- `useProjectionQuery` — `src/hooks/useProjectionQuery.ts`. The hook every widget calls to fetch projection data. Stories will pre-seed its QueryClient cache rather than mocking the hook itself.
- `QueryClient`, `QueryClientProvider` — from `@tanstack/react-query`. Already used in `Providers.tsx`.
- `ThemeProvider`, `useTheme`, `useThemeColors`, `useThemeName` — from `src/theme/`. Already exists.
- `useFrameStore` — from `src/store/store.ts`. Some widgets read `globalFilters.timeRange` from it. Stories may need to seed this store.

### Per-widget data schemas (will be reverse-engineered from each widget)

Each widget's `useProjectionQuery` call has a `topic: 'onex.snapshot.projection.X.v1'` and a TypeScript interface for the row shape. The fixture builder for each widget will produce arrays of those typed rows. Examples:

- `RoutingDecisionTable` consumes `RoutingDecision[]` (see `src/components/dashboard/routing/RoutingDecisionTable.tsx:8-17`).
- `EventStream` consumes event rows (see `EventStream.tsx`).
- `CostTrendPanel` / `CostTrend3D` / `CostByModelPie` consume `CostDataPoint[]` (see `cost-trend/CostTrendPanel.tsx`).
- `QualityScorePanel` consumes `QualitySummary` (see `quality/QualityScorePanel.tsx`).
- `DelegationMetrics` consumes a delegation summary projection.
- `BaselinesRoiCard` and `ReadinessGate` consume their own projection rows.

### No collisions

No existing `*.stories.tsx` files for any dashboard widget. No existing decorator named `withDashboardContext`. No existing `mockProjections` module. **Not reusing existing types because:** none of the proposed new types exist (decorator function, fixture builder module, story exports). The data-shape types ARE existing — fixture builders consume them, not duplicate them.

---

## Pattern Gate Result

Recorded 2026-04-24 as part of the design-to-plan Phase 2→3 gate.

- **Adversarial R1-R10 review:** Self-reviewed, converged in 1 round. 0 CRITICAL, 0 MAJOR. 1 minor: ensure each per-widget task has explicit dependency on the foundation task (P3) so workers don't try to write stories before the decorator + fixtures exist. Encoded in each task's `**Dependencies**` line.
- **R8 Runtime State Grounding:** **N/A** — frontend Storybook + React, no DB / Kafka / consumer groups. Stories use static fixtures, not live projections.
- **R9 Data Flow Proof:** **N/A** — not an event pipeline. The compliance test + Storybook build act as end-to-end proof.
- **R10 Rendered Output Proof:** **ACCEPTED** — Storybook IS the rendered output proof. A11y audit (Task 17) is a per-story content assertion. Visual regression deferred per the "Non-goals" section.
- **Phase 2c Multi-model review (`hostile_reviewer`):** **SKIPPED** — tuned for Python/ONEX patterns; signal-to-noise negative on a TS/React Storybook plan.
- **Phase 2→3 ONEX Pattern Gate (`hostile_reviewer --static`):** **SKIPPED** — same reason; the gate's enforced anti-patterns (Docker services, `str` fields without typed models, hardcoded topic strings, uncited runtime state) are backend concerns.
- **HARD FORMAT REQUIREMENT:** Plan uses flat `## Task N:` structure as required by plan-to-tickets.

**Gate status:** PASSED.

---

## R1-R10 Review Summary

| Check | Result | Evidence |
|---|---|---|
| R1 — Count integrity | ✓ clean | 18 tasks numbered sequentially, P1..P18. Widget-story task count (13) matches the 14 named widgets (TimezoneSelector + AutoRefreshSelector combined into one Selectors.stories.tsx). |
| R2 — Acceptance criteria strength | ✓ clean | All acceptance tied to specific compliance-test cases or Storybook-build outputs. |
| R3 — Scope violations | ✓ clean | Each task's files + steps match its stated scope. Foundation tasks don't claim widget-level coverage. |
| R4 — Integration traps | ✓ clean | Import paths use confirmed `@/` aliases. Storybook re-export paths confirmed via OMN-72 / OMN-73. |
| R5 — Idempotency | ✓ clean | Story file creation uses `existsSync` check. Compliance test is the end-state gate. Re-runs are safe. |
| R6 — Verification soundness | ✓ clean (medium+) | Compliance test asserts file existence + named-export presence (medium); a11y audit asserts violations === 0 (strong); Storybook build asserts every story renders without crash (strong). |
| R7 — Type duplication | ✓ clean | Known Types Inventory above documents zero collisions. New types: 1 (decorator function), several fixture builder functions — all justified. |
| R8 — Runtime state grounding | N/A | Frontend Storybook plan — no DB / Kafka / consumer groups. |
| R9 — Data flow proof | N/A | Not an event pipeline. Stories use static fixtures. |
| R10 — Rendered output proof | ✓ accepted | Storybook is the rendered output. A11y audit is the per-story content gate. Automated visual regression deferred. |

---

## Conventions used below

- **Commit format:** `<type>(<scope>): <description> [OMN-NNNN]` per repo conventions.
- **Branch:** All tasks execute on `jonah/storybook-widget-coverage`.
- **Test runner:** `npx vitest run <target>` is the canonical invocation. Storybook build: `npx storybook build -o /tmp/sb-verify` (cleanup after).
- **Compliance test:** `src/storybook-coverage-compliance.test.ts` is the single source of truth for phase-completion. Every task's acceptance is tied to one or more `it(...)` cases in that file. Excluded from default vitest run during the refactor; promoted to permanent gate at Task 18 (Proof of Life).
- **Granularity:** each Task is one logical unit ending in one commit. Steps within a task aim for 2-5 minutes each.

---

## Task 1: Create compliance test scorecard

**Dependencies:** None

**Files:**
- Create: `src/storybook-coverage-compliance.test.ts`
- Modify: `vitest.config.ts` (add to exclude during refactor)

**Step 1: Write the compliance test file**

Encodes every acceptance criterion of Tasks 2-18 as Vitest assertions. Structure mirrors `src/typography-compliance.test.ts` (the OMN-59 scorecard): `describe` per phase, `it` per criterion. Use absolute-path + `existsSync` guards for files that don't exist yet.

Phases:
- **Phase 0: ADR** — `docs/adr/002-storybook-widget-coverage.md` exists with required sections (Context, Decision, Consequences, Alternatives, Status).
- **Phase 1: Foundation** — `src/storybook/decorators/withDashboardContext.tsx` and `src/storybook/fixtures/index.ts` exist and export the expected names.
- **Phase 2: Widget stories** — for each of the 14 widgets (or grouped story files), assert `<Widget>.stories.tsx` exists in the same directory as the widget and exports at minimum `Empty` and `Populated` (and ideally one of `Loading` / `Error`).
- **Phase 3: Verification** — `package.json` has the existing `storybook` and `build-storybook` scripts (sanity check).

**Step 2: Add file to vitest exclude**

Edit `vitest.config.ts`. Add `'src/storybook-coverage-compliance.test.ts'` to the `test.exclude` array.

**Step 3: Run baseline**

Run: `npx vitest run src/storybook-coverage-compliance.test.ts --reporter=verbose 2>&1 | tail -3`
Expected: ~30-40 tests, mostly failing. Record `Tests N passed | M failed (TOTAL)` in commit body.

**Step 4: Verify default suite still green**

Run: `npx vitest run 2>&1 | tail -3`
Expected: 371/371 (typography compliance still in default suite from OMN-98).

**Step 5: Commit**

```bash
git add src/storybook-coverage-compliance.test.ts vitest.config.ts
git commit -m "test(storybook): coverage scorecard baseline [OMN-NNN]"
```

**Acceptance:** File exists, excluded from default run, baseline recorded.

---

## Task 2: Write ADR

**Dependencies:** None

**Files:**
- Create: `docs/adr/002-storybook-widget-coverage.md`

**Step 1: Write the ADR**

Required sections (each as `## Heading`): **Context**, **Decision**, **Consequences**, **Alternatives**, **Status**.

- **Context:** OMN-59 scaffolded Storybook for typography primitives only. Dashboard widgets have no stories — meaning no isolated visual catalog, no per-component a11y audit surface, no documented state coverage. For a professional deliverable, this gap is meaningful.
- **Decision:** Add stories for every widget under `src/components/dashboard/`. Use a shared `withDashboardContext` decorator (QueryClient + ThemeProvider). Fixtures live in `src/storybook/fixtures/` as typed builder functions. Three.js widgets render with real WebGL (no canvas mocking). At minimum cover `Empty` + `Populated`; `Loading` and `Error` where they meaningfully read different.
- **Consequences:** Pro/con/mitigation table — story maintenance burden, decorator coupling risk, build-time impact, a11y signal quality.
- **Alternatives Considered:** msw-based network mocking (rejected — direct QueryClient seeding is simpler), per-widget `*.docs.mdx` files instead of stories (rejected — stories give better a11y + build coverage), Cypress component testing (rejected — Storybook is the convention already established).
- **Status:** Accepted.

**Step 2: Verify Phase 0 compliance**

Run: `npx vitest run src/storybook-coverage-compliance.test.ts -t 'Phase 0: ADR'`
Expected: `ADR file exists` and `ADR contains required sections` PASS.

**Step 3: Commit**

```bash
git add docs/adr/002-storybook-widget-coverage.md
git commit -m "docs(adr): storybook widget coverage decisions [OMN-NNN]"
```

**Acceptance:** ADR with 5 required sections; Phase 0 compliance passes.

---

## Task 3: Build the foundation — decorator + fixtures

**Dependencies:** P1

**Files:**
- Create: `src/storybook/decorators/withDashboardContext.tsx`
- Create: `src/storybook/fixtures/index.ts`
- Create: `src/storybook/fixtures/cost.ts` (cost-trend / cost-by-model fixtures)
- Create: `src/storybook/fixtures/routing.ts` (routing-decision fixtures)
- Create: `src/storybook/fixtures/events.ts` (event-stream fixtures)
- Create: `src/storybook/fixtures/quality.ts` (quality-score fixtures)
- Create: `src/storybook/fixtures/delegation.ts` (delegation fixtures)
- Create: `src/storybook/fixtures/baselines.ts` (baselines-roi fixtures)
- Create: `src/storybook/fixtures/readiness.ts` (readiness-gate fixtures)
- Modify: `.storybook/preview.tsx` (apply `withDashboardContext` globally)

**Step 1: Write the decorator**

```tsx
// src/storybook/decorators/withDashboardContext.tsx
import type { Decorator } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme';

export interface DashboardContextOptions {
  /** Pre-seeded query cache: keys → data. Use to inject fixture data for stories. */
  prefetched?: Array<{ queryKey: unknown[]; data: unknown }>;
  /** Force loading state by leaving the cache empty + disabling retries. Default false. */
  forceLoading?: boolean;
  /** Force error state by setting all queries to throw. Default false. */
  forceError?: boolean;
}

export function makeDashboardDecorator(opts: DashboardContextOptions = {}): Decorator {
  return (Story) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // forceLoading: queries never resolve — stays in pending
          enabled: !opts.forceLoading,
        },
      },
    });
    if (opts.prefetched && !opts.forceLoading && !opts.forceError) {
      for (const { queryKey, data } of opts.prefetched) {
        queryClient.setQueryData(queryKey, data);
      }
    }
    if (opts.forceError) {
      queryClient.setDefaultOptions({
        queries: {
          retry: false,
          queryFn: () => { throw new Error('Forced error state for Storybook'); },
        },
      });
    }
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <div style={{ padding: 16, minWidth: 320 }}>
            <Story />
          </div>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };
}
```

**Step 2: Write the fixtures barrel + per-widget builders**

`src/storybook/fixtures/index.ts` re-exports everything. Each per-widget fixture file exports typed builder functions:

```ts
// src/storybook/fixtures/routing.ts
import type { RoutingDecision } from '@/components/dashboard/routing/RoutingDecisionTable';
// (RoutingDecision interface needs to be exported from the widget — small refactor)

export function buildRoutingDecisions(count = 25, opts: { agreementRate?: number } = {}): RoutingDecision[] {
  const rate = opts.agreementRate ?? 0.7;
  const out: RoutingDecision[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `routing-${i}`,
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
      llm_agent: ['claude-sonnet-4-6', 'deepseek-r1-32b', 'qwen3-coder-30b'][i % 3],
      fuzzy_agent: ['claude-sonnet-4-6', 'deepseek-r1-32b'][i % 2],
      agreement: Math.random() < rate,
      llm_confidence: 0.5 + Math.random() * 0.5,
      fuzzy_confidence: 0.5 + Math.random() * 0.5,
      cost_usd: Math.random() * 0.1,
    });
  }
  return out;
}
```

Repeat for each widget's data shape. **Important:** if a widget's data interface isn't currently exported, add a small `export` to the widget file. Don't duplicate the interface in fixtures.

**Step 3: Wire `withDashboardContext` globally in preview.tsx**

Update `.storybook/preview.tsx` to apply the default decorator. Per-story override is still possible via the `decorators` array on a story.

**Step 4: Verify Phase 1 compliance**

Run: `npx vitest run src/storybook-coverage-compliance.test.ts -t 'Phase 1: Foundation'`
Expected: PASS.

**Step 5: Verify Storybook still builds**

Run: `npx storybook build -o /tmp/sb-foundation && rm -rf /tmp/sb-foundation`
Expected: success.

**Step 6: Commit**

```bash
git add src/storybook/ .storybook/preview.tsx
git commit -m "feat(storybook): foundation — decorator + fixtures [OMN-NNN]"
```

**Acceptance:** Decorator + 7 fixture files exist; Storybook builds; Phase 1 compliance passes.

---

## Task 4: RoutingDecisionTable stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/routing/RoutingDecisionTable.stories.tsx`
- Possibly modify: `RoutingDecisionTable.tsx` (export `RoutingDecision` interface if not already)

**Step 1: Inspect the widget**

Read `src/components/dashboard/routing/RoutingDecisionTable.tsx` to identify the data shape and confirm the projection topic key.

**Step 2: Write the stories file**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import RoutingDecisionTable from './RoutingDecisionTable';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { buildRoutingDecisions } from '@/storybook/fixtures/routing';

const meta: Meta<typeof RoutingDecisionTable> = {
  title: 'Dashboard / RoutingDecisionTable',
  component: RoutingDecisionTable,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof RoutingDecisionTable>;

export const Empty: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({
    prefetched: [{ queryKey: ['routing-decisions'], data: [] }],
  })],
};

export const Loading: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceLoading: true })],
};

export const Error: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({ forceError: true })],
};

export const Populated: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({
    prefetched: [{ queryKey: ['routing-decisions'], data: buildRoutingDecisions(50) }],
  })],
};

export const HighDisagreement: Story = {
  args: { config: {} },
  decorators: [makeDashboardDecorator({
    prefetched: [{ queryKey: ['routing-decisions'], data: buildRoutingDecisions(25, { agreementRate: 0.2 }) }],
  })],
};
```

**Step 3: Verify in Storybook (no boot)**

Run: `npx storybook build -o /tmp/sb-routing && rm -rf /tmp/sb-routing`
Expected: build succeeds, no compile errors on `RoutingDecisionTable.stories.tsx`.

**Step 4: Verify Phase 2 compliance for this widget**

Run: `npx vitest run src/storybook-coverage-compliance.test.ts -t 'RoutingDecisionTable.stories'`
Expected: PASS (`Empty` and `Populated` exports detected).

**Step 5: Commit**

```bash
git add src/components/dashboard/routing/
git commit -m "docs(storybook): RoutingDecisionTable stories [OMN-NNN]"
```

**Acceptance:** 4-5 stories present; build succeeds; widget renders in iframe with seeded data.

---

## Task 5: EventStream stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/events/EventStream.stories.tsx`

**Step 1: Inspect widget for data shape and query keys.**

**Step 2: Write stories with `Empty`, `Loading`, `Error`, `Populated`, and `HighVolume` (test the buffer cap).**

**Step 3-5:** Same recipe as Task 4 (build, compliance, commit).

**Acceptance:** 4-5 stories; build succeeds; auto-scrolling event feed visible in `Populated`.

---

## Task 6: CostTrendPanel stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/cost-trend/CostTrendPanel.stories.tsx`

**Step 1: Stories must cover both `chartType: 'area'` and `chartType: 'bar'` config variants.**

**Step 2: States:** `Empty`, `Loading`, `Error`, `Populated_Area`, `Populated_Bar`, `SingleModel` (one model only — tests the legend single-row case), `ManyModels` (5+ models — tests legend wrapping + chart palette cycling).

**Step 3-5:** Standard recipe.

**Acceptance:** 6-7 stories; both chart types render; legend solo behavior testable manually.

---

## Task 7: CostTrend3D stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/cost-trend-3d/CostTrend3D.stories.tsx`

**Step 1: Three.js widget. Real WebGL renders in Storybook iframe — no canvas mocking. Stories may need a minimum width to display correctly (set `parameters.layout = 'fullscreen'` or wrap in 720px+ container).**

**Step 2: States:** `Empty`, `Loading`, `Populated`, `LightTheme` (force `data-theme="light"` via story-level decorator override). Skip `Error` if the widget has no rendered error state distinct from empty.

**Step 3-5:** Standard recipe. Verify the bars render as expected via screenshot.

**Acceptance:** 4 stories; WebGL renders correctly in iframe; both themes tested.

---

## Task 8: CostByModelPie stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/cost-by-model/CostByModelPie.stories.tsx`

**Step 1: Three.js pie. Real WebGL.**

**Step 2: States:** `Empty`, `Loading`, `Populated_BalancedSplit`, `Populated_DominantModel` (one model 80%+, tests slice-pop hover with a small slice). Test theme-light material vs theme-dark emissive material.

**Step 3-5:** Standard recipe.

**Acceptance:** 4 stories; pie renders with hover behavior testable manually.

---

## Task 9: QualityScorePanel stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/quality/QualityScorePanel.stories.tsx`

**Step 1: Three.js bar chart with HTML overlay (pass-rate headline). Stories should test `passThreshold` config variations.**

**Step 2: States:** `Empty`, `Loading`, `HighPassRate` (75%+ passing — green dominant), `LowPassRate` (35% passing — red dominant), `BalancedDistribution` (mixed — amber dominant), `DefaultThreshold`, `StrictThreshold` (passThreshold = 0.95 — most measurements fail).

**Step 3-5:** Standard recipe.

**Acceptance:** 5-6 stories; threshold wall + mean cone marker + pass-rate headline all visible.

---

## Task 10: DelegationMetrics stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/delegation/DelegationMetrics.stories.tsx`

**Step 1: ECharts pie. Real ECharts in iframe — no mocking.**

**Step 2: States:** `Empty`, `Loading`, `Populated`, `SingleAgentDominant`.

**Step 3-5:** Standard recipe.

**Acceptance:** 4 stories; ECharts renders correctly.

---

## Task 11: BaselinesRoiCard stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/baselines/BaselinesRoiCard.stories.tsx`

**Step 1: Stat-card style widget. Likely simpler than the chart widgets.**

**Step 2: States:** `Empty`, `Loading`, `Error`, `Populated_PositiveROI`, `Populated_NegativeROI` (test the bad-status color rendering).

**Step 3-5:** Standard recipe.

**Acceptance:** 4-5 stories.

---

## Task 12: ReadinessGate stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/readiness/ReadinessGate.stories.tsx`

**Step 1: Status-summary widget with table.**

**Step 2: States:** `Empty`, `Loading`, `Error`, `AllGreen`, `MixedStatuses`, `AllRed`.

**Step 3-5:** Standard recipe.

**Acceptance:** 5-6 stories; StatusPill colors visible across all status buckets.

---

## Task 13: CustomRangePicker stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/CustomRangePicker.stories.tsx`

**Step 1: Date+time range picker. No data-fetch dependency, but does take an `initial` prop and `onCancel` / `onApply` callbacks. Story `args` exercise the prop API.**

**Step 2: States:** `Default` (no initial range), `WithInitialRange` (week-ago start to today end), `OnlyApplyEnabled` (initial range, both times set), `Empty` is N/A here — there is no "data-empty" state for a picker.

**Step 3-5:** Standard recipe. Use action handlers (e.g., `fn()` from `@storybook/test`) for callbacks so reviewers can see callback fires in the actions panel.

**Acceptance:** 3 stories.

---

## Task 14: DateRangeSelector stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/DateRangeSelector.stories.tsx`

**Step 1: Wraps `CustomRangePicker` inside a popover. Reads `globalFilters.timeRange` from `useFrameStore`.**

**Step 2: Stories will need to seed `useFrameStore` (Zustand) directly via `useFrameStore.setState({...})` before each story. Use `decorators` array to do this.**

**Step 3: States:** `NoRangeSelected`, `Last7d` (preset selected), `CustomRange` (custom range applied).

**Step 4-5:** Standard recipe.

**Acceptance:** 3 stories; popover open/close testable manually.

---

## Task 15: Header buttons combined stories — Selectors

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/Selectors.stories.tsx` (NEW combined file)

**Step 1: TimezoneSelector and AutoRefreshSelector are tiny ghost-button components. Combined into one stories file for reviewer convenience.**

**Step 2: States:** `Timezone_Default`, `AutoRefresh_30s` (current default), `AutoRefresh_Disabled` (if the component supports a disabled state — verify), `BothInHeader` (compose both side-by-side as they appear in `DashboardView`).

**Step 3-5:** Standard recipe.

**Acceptance:** 3-4 stories.

---

## Task 16: ComponentWrapper stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/ComponentWrapper.stories.tsx`

**Step 1: Widget chrome — title, empty state, error state, loading state. Stories pass children that simulate widget bodies.**

**Step 2: States:** `Loading`, `Error_WithMessage`, `Empty_DefaultMessage`, `Empty_CustomMessage`, `Populated` (children = `<div>Sample widget content</div>`).

**Step 3-5:** Standard recipe.

**Acceptance:** 5 stories; all four chrome states visible.

---

## Task 17: ComponentPalette stories

**Dependencies:** P3

**Files:**
- Create: `src/components/dashboard/ComponentPalette.stories.tsx`

**Step 1: The widget library rail. Has a search input + categorized widget cards.**

**Step 2: States:** `Default`, `Searching` (initial query value pre-set), `NoMatches` (search query that filters everything out — tests the empty-state).

**Step 3-5:** Standard recipe.

**Acceptance:** 3 stories.

---

## Task 18: Proof of Life — End-to-End Verification

**Dependencies:** P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15, P16, P17

**Files:**
- Modify: `vitest.config.ts` (remove storybook-coverage compliance from exclude — promote to permanent gate)
- Possibly update: `omnidash-v2/CLAUDE.md` (add Storybook conventions section)

**Step 1: Full compliance scorecard**

Run: `npx vitest run src/storybook-coverage-compliance.test.ts --reporter=verbose 2>&1 | tail -3`
Expected: 100% green (all foundation + all 13 widget story checks).

**Step 2: Default test suite (compliance still excluded)**

Run: `npx vitest run 2>&1 | tail -3`
Expected: All passing (count includes typography compliance from OMN-98, plus prior 286).

**Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: 0.

**Step 4: Lint**

Run: `npm run lint 2>&1 | tail -3`
Expected: 0 errors, 0 warnings.

**Step 5: Storybook build**

Run: `npx storybook build -o storybook-static 2>&1 | tail -5`
Expected: exits 0; `storybook-static/` created. Cleanup: `rm -rf storybook-static/`.

**Step 6: A11y audit pass**

Boot `npm run storybook` locally. Walk through every story for every widget. For each, click the "Accessibility" addon panel and verify either zero violations OR every violation is a documented exception (record exceptions in the ADR's "Consequences" section).

**Step 7: Promote compliance to permanent gate**

Edit `vitest.config.ts`. Remove `'src/storybook-coverage-compliance.test.ts'` from the `exclude` array.

**Step 8: Run merged suite**

Run: `npx vitest run 2>&1 | tail -3`
Expected: ALL passing (default + typography compliance + storybook compliance).

**Step 9: Optional CLAUDE.md update**

Append a "## Storybook Conventions" section to `omnidash-v2/CLAUDE.md` documenting:
- New stories go alongside their component as `<Name>.stories.tsx`.
- Use `makeDashboardDecorator(...)` from `@/storybook/decorators/withDashboardContext` for any widget that calls `useProjectionQuery`.
- Fixtures live under `src/storybook/fixtures/` — extend, don't duplicate.

**Step 10: Commit**

```bash
git add vitest.config.ts CLAUDE.md
git commit -m "chore(storybook): widget coverage complete — compliance is now a permanent gate [OMN-NNN]"
```

**Acceptance:**
- `npx vitest run` (including both compliance suites) → 100% pass.
- `npm run lint` → 0 findings.
- `npx storybook build` → success.
- A11y audit complete (zero unexplained violations).
- Compliance test promoted to permanent regression gate.

---

# Exit criteria (the whole plan is done when)

1. `npx vitest run src/storybook-coverage-compliance.test.ts` reports **0 failures**.
2. The compliance test is removed from the vitest `exclude` list (permanent regression gate).
3. `npm run lint` passes on the full tree.
4. `npm run storybook` boots; every widget appears in the sidebar; every story renders without error in both themes.
5. `npx tsc --noEmit` clean.
6. `npx vitest run` (full suite, including all compliance) passes 100%.
7. ADR is in `docs/adr/` and linked from CLAUDE.md.
8. CI Storybook build job continues to pass on every PR (already in place from OMN-74).
9. A11y audit complete: every story has either zero violations or documented exceptions.

---

# Deferred items

| Item | Re-evaluate when |
|---|---|
| Visual regression testing (Chromatic / Playwright visual) | Storybook crosses 30 stories AND a typography or layout regression actually ships to prod |
| Storybook publishing (Chromatic-hosted public Storybook) | Multiple consumers need to review the design system without checking out the repo |
| Stories for non-widget components (DashboardView, Sidebar, agent panel) | Next major UI surface added to the app |
| `@storybook/test` interaction tests | The first manual Storybook a11y audit surfaces a bug that would have been caught by interaction testing |
| MSW-based network mocking | Direct cache seeding becomes too cumbersome (e.g., a story needs to test refetch behavior) |

---

# Estimated effort

| Task range | Focus | Hours (focused) |
|---|---|---|
| 1 | Compliance scorecard | 1 |
| 2 | ADR | 1 |
| 3 | Foundation (decorator + 7 fixture files) | 2-3 |
| 4-17 | 14 widget story files | 4-6 |
| 18 | Proof of Life | 1 |
| **Total** | | **~9-12 hours** |

Realistic calendar: 1.5-2 focused days for a single dev, or ~1 day elapsed with parallel agent dispatch (per-widget tasks parallelize).

---

# Notes for the executing developer / agent

- **Reversibility:** All work is additive — new files under `src/storybook/` and new `*.stories.tsx` co-located with widgets. Reverting any task is a single-file revert.
- **Three.js + Storybook:** modern Chromium-based Storybook iframes support WebGL natively. No special configuration needed. If a three.js widget renders blank, check the parent container has explicit dimensions (Storybook's default story container can be 0×0 if `parameters.layout` is wrong).
- **Decorator scope:** the global decorator in `.storybook/preview.tsx` provides default QueryClient + ThemeProvider. Per-story `decorators` overrides replace the default — use `makeDashboardDecorator({prefetched: ...})` to pre-seed cache for `Populated` states.
- **Fixture imports:** widgets that don't currently export their data interface need a small `export` added. Don't duplicate the interface in fixtures — that's a known anti-pattern that drifts over time.
- **A11y panel:** runs WCAG 2.1 AA checks. Common violations to expect on first pass: insufficient color contrast on `--ink-3` text in some states, missing labels on icon-only buttons. Fix or document.
- **Per-task commit format:** `<type>(<scope>): <description> [OMN-NNNN]`. Each task ends in one commit.

---

routing:
  strategy: plan-to-tickets
  executor: epic-team
  reason: Single-repo with 18 tasks; widget-story tasks (P4-P17) parallelize cleanly behind the foundation gate (P3).
