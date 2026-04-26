---
epic_id: OMN-22
---

# OMN-22 UX polish round (post-OMN-48)

Follow-up UX issues surfaced by clone45 after OMN-48 landed. 28 observations
triaged down to 10 tickets grouped by file/theme so each becomes a PR-sized
unit of work. Already-done and user-retracted items are noted at the bottom
for traceability.

## Task 1: Sidebar footer + workspace cleanup

Remove the static Workspace dropdown (no behavior wired), remove the "All
systems normal" indicator (no health monitoring wired), and remove the
hardcoded `v2.15` version string (not sourced from package.json). Drop the
corresponding test assertions that pin those strings.

**Files:** `src/components/frame/Sidebar.tsx`, `src/styles/sidebar.css`,
`src/components/frame/Sidebar.test.tsx`,
`src/components/frame/FrameLayout.test.tsx`.

Dependencies: None

## Task 2: DashboardView interaction polish

Five related fixes to the dashboard shell:

1. Rename input for dashboard title renders white-on-white; set text color
   to `var(--ink)` and keep background transparent.
2. Close the widget library when the active dashboard changes (prevents
   orphaned rail showing after a dashboard switch).
3. Close the widget library when the user presses `Escape`.
4. Animate widget library open/close smoothly — the prototype CSS has a
   300ms transform transition that can't fire because v2 conditionally
   renders. Switch to always-rendered-with-open-class.
5. Remove the "N widgets" count under the dashboard name — it has no
   practical purpose. The count in the library footer stays.

**Files:** `src/pages/DashboardView.tsx`,
`src/components/dashboard/ComponentPalette.tsx`, `src/styles/library.css`,
`src/styles/dashboard.css`.

Dependencies: None

## Task 3: Timezone selector + auto-refresh countdown

Two features in the dash-meta row:

1. Timezone becomes a selectable dropdown. Persisted in `localStorage`,
   shared across all dashboards for the browser session. When a dashboard
   loads, use the saved timezone if one exists.
2. Auto-refresh displays a countdown (e.g. `27s`) that ticks down every
   second instead of showing a static interval. Default state is
   **paused**. A small pause/play button sits to the right of the
   countdown.

**Files:** `src/pages/DashboardView.tsx`, new `src/hooks/useTimezone.ts`
and `src/hooks/useAutoRefresh.ts`.

Dependencies: Task 2

## Task 4: Widget chrome — kebab menu + easy removal + card flattening

Three related changes:

1. Add a kebab menu (`MoreVertical` icon) to the top-right of every widget
   card. Menu contains "Configure" and "Delete". Available at all times,
   not only in edit mode. Disable the current click-widget-to-open-config
   behavior.
2. Easier widget removal — the kebab menu "Delete" option replaces the
   current remove-widget flow, which is only accessible in edit mode via
   an indirect affordance.
3. Flatten the inner card container for widgets that have no children
   (e.g. CostTrendPanel wraps a single CostTrend component in a redundant
   sub-card). Remove the wrapper when the widget body is a single element.

**Files:** `src/components/dashboard/ComponentWrapper.tsx`, individual
widget files under `src/components/dashboard/*/`.

Dependencies: None

## Task 5: Widget contrast audit + chart sizing

Three widget-level visual fixes:

1. Audit every widget for text that renders as `var(--ink-3)` on a light
   background where the value is actually meaningful data (e.g. "Total
   Delegations" label in DelegationMetrics). Promote to `var(--ink-2)` or
   `var(--ink)` where the text is primary content; leave `var(--ink-3)`
   only for secondary hints.
2. Cost Trend chart needs to render about 2× its current height.
3. Quality Score chart currently renders at ~7px tall. Should be the same
   height as Cost Trend after fix #2.

**Files:** every widget under `src/components/dashboard/*/` and the chart
components they compose.

Dependencies: None

## Task 6: Config panel as floating modal

Current `ComponentConfigPanel` slides out from the right as a column, which
collides with the widget library rail (both want the right 380px). The
panel's CSS class (`ComponentConfigPanel_panel__*`) indicates it never
went through the UI fidelity audit. Replace the slide-out with a floating
centered modal triggered by the kebab-menu "Configure" action from Task
4. Use shadcn Dialog.

**Files:** `src/config/ComponentConfigPanel.tsx`,
`src/config/ComponentConfigPanel.css.ts`, `src/pages/DashboardView.tsx`.

Dependencies: Task 4

## Task 7: Routing decisions table — search, sort, paginate

Current RoutingDecisionTable renders every row, unbounded. For production
data that's hundreds to thousands of rows and kills the page. Add:

1. A fixed table height with internal scroll.
2. Text search over llm_agent, fuzzy_agent, agreement columns.
3. Click-to-sort column headers for every column.
4. Pagination (e.g. 25 rows per page) with page controls.

**Files:**
`src/components/dashboard/routing/RoutingDecisionTable.tsx`.

Dependencies: None

## Task 8: Drag-and-drop for adding widgets (OMN-44 revival)

The widget library currently supports click-to-add only. The prototype
also supports drag-from-library-to-grid. This is the same scope as the 6
chunks blocked in `docs/audit/blocked/` (widget-card-01/02/04,
dashboard-08/09/10). After this lands, unblock and move those chunks to
`done/` with Resolution pointing at the fix commit.

**Files:** `src/pages/DashboardView.tsx`,
`src/components/dashboard/ComponentWrapper.tsx`,
`src/components/dashboard/ComponentPalette.tsx`,
`src/styles/dashboard.css`.

Dependencies: Task 4

## Task 9: Grid reflow — masonry instead of fixed rows

Current `.grid` is a CSS grid with fixed rows. If one widget in a row is
taller than its siblings, the shorter widgets leave a dead gap at the
bottom of their row. Switch to a masonry or column-wise flow where
shorter widgets stack beneath each other rather than creating gaps.

Broken current behavior:

```
a b
| |
  |   <-- gap under a because b is taller
c d
```

Target behavior:

```
a b
| |
c |
  d   <-- c flows under a; d flows under b
```

**Files:** `src/styles/dashboard.css`, `src/pages/DashboardView.tsx`.

Dependencies: None

## Task 10: Light/dark theme wiring

`ThemeProvider` and `useTheme` exist but the theme toggle in the top-right
may not actually switch CSS tokens end-to-end. Verify the flow: the
`data-theme` attribute on `<html>` flips the `--bg`, `--ink`, `--panel`,
`--line`, and `--sidebar-*` tokens in `globals.css`. Fix anywhere these
tokens are hardcoded instead of referenced.

**Files:** `src/theme/ThemeProvider.tsx`, `src/theme/themes.css.ts`,
`src/styles/globals.css`, any widget using hardcoded oklch values.

Dependencies: None

## Already addressed — do not ticket

- Header cleanup (remove user chip, Bell, HelpCircle, breadcrumb Menu
  icon) — shipped by clone45 directly as an edit to `Header.tsx`.
- Refresh button existence — clone45 retracted after confirming it was
  already present.
- Agent UI preservation — clone45 ruled to keep the pre-existing
  AgentOrchestrator / AgentChatPanel / AgentActionDispatcher code
  untouched; Claude Design will update its visuals in a separate
  out-of-band pass.

## Constraints

- Branch is `clone45/omn-48-chunked-audit` off `main`. Work here.
- Tests must pass (`npx tsc --noEmit` + `npx vitest run`) before any
  commit. Current baseline: 242 passing.
- All 10 tickets under existing epic OMN-22. Do not create a new epic.
- Do not regenerate `public/component-registry.json` or hand-edit it.
- Do not touch `src/shared/types/generated/` or `node_modules/`.

## Definition of Done (rollup)

- All 10 tickets merged into `clone45/omn-48-chunked-audit` (or a
  follow-up branch rebased onto it).
- 242+ tests passing.
- Tailwind typecheck clean.
- Light and dark themes both render without hardcoded-color regressions.
- Manual smoke test: create dashboard → add widgets via click →
  reconfigure via kebab menu → delete via kebab menu → switch dashboards
  → library closes → Escape closes library → theme toggle flips colors
  everywhere.
