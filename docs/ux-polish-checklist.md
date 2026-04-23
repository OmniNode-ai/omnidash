# UX polish checklist (post-OMN-48)

Original 28-item list that clone45 dictated on 2026-04-21 after reviewing the
post-OMN-48 dashboard. Preserved as-is here so we can work through them
one at a time together. Updated status column as we go.

Legend:
- ⬜ pending
- ✅ done
- 🟡 partially done
- ❌ retracted
- 📝 decided to keep as-is

## The list

### 1. Rename dashboard — text white on white
**Status**: ✅ done (commit `c64ba6c`)
Sidebar rename input now has a tinted dark background with brand-colored
border, sidebar-ink text color, and auto-selects the existing name via a
callback ref + requestAnimationFrame (so Radix's focus management doesn't
steal focus back to the kebab trigger).

### 2. Workspace dropdown — remove
**Status**: ✅ done (commit `d07defa`)
Dropped the hardcoded "Platform Eng" Workspace chip + its CSS rules + the
ChevronDown import. Test updated to assert the chip is absent.

### 3. Page cannot scroll below the fold
**Status**: ✅ done (commit pending)
Root cause: `.main` (right column in FrameLayout) had no height constraint,
so children exceeding 100vh pushed `.main` past the viewport, and
`body { overflow: hidden }` clipped them unreachably. Fixed by adding
`height: 100%; min-height: 0; overflow: hidden` to `.main` so it's pinned
to its 100vh `.app` grid cell. Internal scroll happens inside `.dash-body`
as intended.

### 4. Widget text contrast — audit all
**Status**: ✅ done (commit pending)
Audited every widget body. Findings:
- DelegationMetrics / BaselinesROICard labels were already `--ink`
  (darkest), not `--ink-3`. Perceived faintness was from the tiny
  `0.6875rem` (~11px) font size. Bumped both to `0.75rem` (12px).
- QualityScorePanel "Mean Score" summary row was `--ink-2` — this is
  the widget's only non-chart content, so promoted to `--ink` and
  bumped `0.75rem` → `0.8125rem`.
- All other `--ink-3` / `mutedForeground` usage is in chrome
  (loading, empty state, timestamps, chart axes, table-cell
  metadata, search placeholder) — appropriate for those roles and
  left alone.

### 5. Cost Trend chart — 2× height
**Status**: ✅ done
`CostTrendPanel` now renders with fixed `height: '320px'`. `height: 100%`
resolved to nothing because `.widget-body` had no height constraint, so
the chart fell back to the 200px minHeight. 320px is roughly 2× that,
matching the user's request.

### 6. Quality Score chart — height fix
**Status**: ✅ done
`QualityScorePanel` chart now uses fixed `height: '320px'` to match
CostTrendPanel. Prior `flex:1 + minHeight:150px` inside an unconstrained
`height:100%` flex column was resolving to ~7px, which was the original
bug.

### 7. Widget library closes on dashboard switch
**Status**: ✅ done
`DashboardView.tsx` useEffect watches active dashboard ID and closes
the library when it changes.

### 8. Remove unnecessary sub-card depth
**Status**: ✅ done
Widgets that previously double-wrapped (outer card → inner card → content)
have been flattened so the widget body is rendered directly inside
`ComponentWrapper`.

### 9. Grid reflow — masonry layout
**Status**: ✅ done (commit pending)
Switched `.grid` from `display: grid; grid-template-columns: 1fr 1fr` to
`columns: 2; column-gap: var(--row-gap)`. `.widget` gets
`break-inside: avoid` + `margin-bottom: var(--row-gap)`. Shorter widgets
now stack under their column-mates instead of leaving dead space.

Broken current behavior:
```
a b
| |
  |   <-- gap under a because b is taller
c d
```
Target:
```
a b
| |
c |
  d
```

### 10. Config panel needs a rework
**Status**: ✅ done
`ComponentConfigPanel` is now a floating centered modal rather than a
slide-out right column, so it no longer collides with the widget
library rail.

### 11. Routing decisions table — size, search, sort, paginate
**Status**: ✅ done
`RoutingDecisionTable.tsx` now has: fixed `height: 360` scrollable
container, search input filtering on agents + agreement, three-state
click-to-sort headers (asc → desc → clear) with `aria-sort`, and
`PAGE_SIZE=25` pagination with Previous/Next + result count.

### 12. Drag-and-drop for adding widgets
**Status**: ⬜ pending
No drag interaction for placing widgets on the dashboard. Prototype has it.
This is the OMN-44 scope from the audit (6 blocked chunks in `docs/audit/blocked/`).

### 13. Easier widget removal
**Status**: ✅ done
Folded into #14 — removal is the "Remove Widget" item in the per-widget
kebab menu, available in both view and edit mode.

### 14. Kebab menu on every widget
**Status**: ✅ done
`ComponentWrapper` renders a `MoreVertical` kebab button top-right when
any of `onConfigure` / `onDuplicate` / `onDelete` is supplied by
`WidgetChromeContext`. Menu is available in both view and edit mode;
click-widget-to-configure is disabled.

### 15. Widget library open/close — smooth
**Status**: ✅ done
Library panel is now always rendered and toggles the `.library.open`
class, letting the prototype's `transform 0.3s` transition run in both
directions.

### 16. Timezone selector — localStorage-backed
**Status**: ⬜ pending
Timezone should be a dropdown. Selection persists in `localStorage` and
applies to all dashboards in the browser session.

### 17. Refresh button
**Status**: ❌ retracted
clone45 retracted after confirming the Refresh button already exists.

### 18. (Skipped in original list)
**Status**: ❌ n/a

### 19. Auto-refresh countdown with pause
**Status**: ⬜ pending
Auto-refresh should display a countdown (ticking down every second) rather
than a static interval. Defaults to paused. A small pause/play button sits
to the right of the countdown.

### 20. Remove widget count under dashboard name
**Status**: ✅ done (commit `89d5d53`)
Dropped the `<span>{N} widgets</span>` and its trailing `·` separator from
the dash-meta row.

### 21. Escape key closes the widget library
**Status**: ✅ done
Window-level `keydown` handler in `DashboardView.tsx` closes the library
when Escape is pressed and the library is open.

### 22. Light/dark theme working
**Status**: ✅ done (commit pending)
Root cause confirmed as suspected: ThemeProvider was setting
`theme-dark`/`theme-light` classes on `<body>`, which drives the legacy
vanilla-extract theme, but NOT the `data-theme` attribute on `<html>`
that activates the OKLCH tokens in globals.css used by all
prototype-ported chrome. Theme toggle was therefore a no-op for the
widget/sidebar/topbar surfaces. Fix: set both in parallel. Also added
a synchronous `data-theme="dark"` bootstrap in index.html to prevent
the light-mode flash before React hydrates.

### 23. Remove user info top-right
**Status**: ✅ done (commit `e32827c`)
Dropped the `.user-chip` div with its avatar + "Jamie Sun" + "Platform Eng"
placeholder.

### 24. Remove notifications bell + help circle
**Status**: ✅ done (commit `e32827c`)
Dropped both icon buttons + the `Bell` / `HelpCircle` lucide imports.

### 25. AI circular button — check spec first
**Status**: 📝 keep
Investigation (2026-04-21): found only one spec reference in
`docs/ui-fidelity-inventory-2026-04-20.md`, which says agent UI is "out of
Part 3 scope (not in prototype)" but does not say to remove it. The
AgentOrchestrator + AgentChatPanel + supporting code is pre-existing
(present in the unzipped `omnidash-v2.zip`). clone45 decided to keep it;
Claude Design will update its visuals out-of-band.

### 26. "All systems normal" — comment out
**Status**: ✅ done (commit `e5fb461`)
Removed the entire `.sidebar-foot` div (dot + status text + version).

### 27. Version number in sidebar foot — remove
**Status**: ✅ done (commit `e5fb461`)
Rolled into the sidebar-foot removal. Also moved `@keyframes pulse` from
sidebar.css to globals.css so it remains available for the widget-live
badge animation.

### 30. Chart colors lack differentiation
**Status**: ✅ done (commit pending)
Root cause confirmed: `useThemeColors()` reads `--chart-*` from
`document.documentElement`, but the tokens were only defined on
vanilla-extract's `.theme-*` class applied to `<body>` — so the hook
fell back to gray `#888888` for every series. Fix: add `--chart-1`
through `--chart-7` directly on `:root` in `globals.css` with seven
distinct hues (blue / teal / yellow / orange-red / magenta / purple /
cyan) at similar lightness + chroma, deliberately clear of the brand
green (`--accent-h = 120`). Dark theme gets a brighter variant at the
same hues for series-identity consistency across toggle. Also added
`--status-healthy/warning/error` aliases so `useThemeColors()` resolves
status tokens the same way.

### 29. Sidebar kebab menu items — hover highlight + pointer cursor
**Status**: ✅ done (commit pending)
Fixed at the component level in `src/components/ui/dropdown-menu.tsx`
so every DropdownMenu in the app benefits. Two issues: (a) cursor was
`cursor-default` — changed to `cursor-pointer`; (b) `focus:bg-accent`
did fire but `--accent` is a near-white OKLCH green that was invisible
on the white panel. Switched the highlight bg to `--panel-2` (the
prototype's convention, see `dashboard.css .menu-item:hover`). Covered
`hover:`, `focus:`, and `data-[highlighted]:` selectors to catch every
path Radix uses for highlighting.

### 28. Hamburger icon on the breadcrumb
**Status**: ✅ done (commit `e32827c`)
Removed the leading `<Menu size={16}/>` icon from the breadcrumbs nav.

---

## Progress tracking

- Total items: 28
- Pending: 3 (#12, #16, #19)
- Done: 24 (#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #13, #14, #15, #20, #21, #22, #23, #24, #26, #27, #28, #29, #30 — plus ReadinessGate tabular rework, off-list)
- Retracted / n/a: 2 (#17, #18)
- Keep as-is: 1 (#25)

As we close items, mark the status and add a one-line note about how it
was resolved (e.g. "Fixed in commit abc1234").
