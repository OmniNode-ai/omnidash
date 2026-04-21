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
**Status**: ⬜ pending
The "Workspace" dropdown in the sidebar does not do anything.
Investigation (2026-04-21): confirmed no `onClick`, no dropdown content, no behavior wired. Safe to remove.

### 3. Page cannot scroll below the fold
**Status**: ⬜ pending
Content below the viewport is not reachable. Likely a `.dash-body` or
main-content overflow rule that's blocking scroll. Needs diagnosis.

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
**Status**: ⬜ pending
The "N widgets" count in the dash-meta row is not useful. Remove it. The
count in the widget library footer stays.

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
**Status**: ⬜ pending
Remove the user chip (avatar + "Jamie Sun" + "Platform Eng") until there
is a real user system.

### 24. Remove notifications bell + help circle
**Status**: ⬜ pending
No notifications system or help system exists to back these icons. Remove.

### 25. AI circular button — check spec first
**Status**: 📝 keep
Investigation (2026-04-21): found only one spec reference in
`docs/ui-fidelity-inventory-2026-04-20.md`, which says agent UI is "out of
Part 3 scope (not in prototype)" but does not say to remove it. The
AgentOrchestrator + AgentChatPanel + supporting code is pre-existing
(present in the unzipped `omnidash-v2.zip`). clone45 decided to keep it;
Claude Design will update its visuals out-of-band.

### 26. "All systems normal" — comment out
**Status**: ⬜ pending
No health monitoring is wired to back this indicator. Remove or comment out.

### 27. Version number in sidebar foot — remove
**Status**: ⬜ pending
The `v2.15` string is hardcoded, not sourced from `package.json`. Remove.

### 28. Hamburger icon on the breadcrumb
**Status**: ⬜ pending
Icon currently sits to the left of "Home / Dashboards" and looks like a
menu trigger but does nothing. Remove or replace if users would expect it
to open something.

---

## Progress tracking

- Total items: 28
- Pending: 25
- Done: 0
- Retracted / n/a: 2 (#17, #18)
- Keep as-is: 1 (#25)

As we close items, mark the status and add a one-line note about how it
was resolved (e.g. "Fixed in commit abc1234").
