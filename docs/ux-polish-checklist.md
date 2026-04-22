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
**Status**: ⬜ pending
In DelegationMetrics, "Total Delegations" is too light on a light background.
Primary data labels rendered in `var(--ink-3)` should be promoted to
`var(--ink-2)` or `var(--ink)`. Audit every widget for similar misuse.

### 5. Cost Trend chart — 2× height
**Status**: ⬜ pending
Chart should render about twice as tall as it does now.

### 6. Quality Score chart — height fix
**Status**: ⬜ pending
Chart currently renders ~7 pixels tall. Should be the same height as Cost
Trend after fix #5. Likely a flex/height misconfiguration.

### 7. Widget library closes on dashboard switch
**Status**: ⬜ pending
When the widget library is open and the user switches dashboards, the
library should close.

### 8. Remove unnecessary sub-card depth
**Status**: ⬜ pending
Several widgets (e.g. cost-trend-panel) have an outer card containing a
single inner card. Flatten when the widget body is a single element.

### 9. Grid reflow — masonry layout
**Status**: ⬜ pending
Current grid uses fixed rows; taller widgets leave dead gaps under their
shorter siblings. Target: column-wise masonry flow.

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
**Status**: ⬜ pending
The panel (class `ComponentConfigPanel_panel__xaj6hf0`) slides out from the
right. When the widget library is already open, this creates two right
columns on top of each other. Make it a floating modal instead.

### 11. Routing decisions table — size, search, sort, paginate
**Status**: ⬜ pending
Table currently renders every row. Needs:
- Fixed height with internal scroll
- Text search
- Click-to-sort column headers
- Pagination

### 12. Drag-and-drop for adding widgets
**Status**: ⬜ pending
No drag interaction for placing widgets on the dashboard. Prototype has it.
This is the OMN-44 scope from the audit (6 blocked chunks in `docs/audit/blocked/`).

### 13. Easier widget removal
**Status**: ⬜ pending
The current path to remove a widget is unclear. Make it obvious.
(Likely folds into item #14 via the kebab menu's Delete option.)

### 14. Kebab menu on every widget
**Status**: ⬜ pending
Add a kebab menu to the top-right of each widget card. Options: Configure,
Delete. Available at all times, not only in edit mode. Disable the current
click-widget-to-configure behavior.

### 15. Widget library open/close — smooth
**Status**: ⬜ pending
The library should slide in and out with a transition. Currently it
mount/unmounts instantly. The prototype CSS already defines the transition;
we need to always render it and toggle an `open` class instead of
conditionally rendering.

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
**Status**: ⬜ pending
When the library is open, pressing Escape should close it.

### 22. Light/dark theme working
**Status**: ⬜ pending
Theme toggle should flip CSS tokens end-to-end across every surface.
(Investigation note: earlier work suggested the ThemeProvider may not be
setting `data-theme` on the html element correctly, so the
`[data-theme="dark"]` selectors in globals.css would not match. Verify.)

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
**Status**: ⬜ pending
Added during session on 2026-04-21. Lines in the Cost Trend chart, bars
in the Quality Score chart, and pie/bar slices elsewhere render in
similar colors, making them hard to tell apart. Likely root cause:
the `--chart-1` through `--chart-7` CSS tokens in `globals.css` are
either missing, near-identical, or all mapping to a single brand color.
Investigation first, then expand the palette to distinct hues with
sufficient separation in both light and dark themes.

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
- Pending: 18
- Done: 7 (#1, #2, #20, #23, #24, #26, #27, #28 — technically 8)
- Retracted / n/a: 2 (#17, #18)
- Keep as-is: 1 (#25)

As we close items, mark the status and add a one-line note about how it
was resolved (e.g. "Fixed in commit abc1234").
