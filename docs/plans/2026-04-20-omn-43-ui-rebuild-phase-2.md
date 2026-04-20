---
epic_id: OMN-22
ticket_id: OMN-43
---

# Plan: UI rebuild phase 2 (Frame, Header, Sidebar, DashboardView)

**Ticket:** [OMN-43](https://linear.app/voxglitch/issue/OMN-43)

## What ships

First phase where the page visibly changes. The chrome is rebuilt around Tailwind + shadcn primitives matching the Claude Design prototype's regular theme.

1. Install shadcn components we need for the frame work: `button`, `dropdown-menu`, `input`, `separator`, `tooltip`.
2. Extend the Zustand `dashboardSlice` with a `dashboards: DashboardDefinition[]` array and `createDashboard`, `renameDashboard`, `deleteDashboard`, `setActiveDashboardById` actions. Persist the list and `lastActiveName` to localStorage. Per-dashboard layouts still live via `layoutPersistence`.
3. Rebuild `FrameLayout` as a 2-column grid (240px sidebar, 1fr main, 52px topbar).
4. Rebuild `Header` as a simple brand-left, slot-right topbar.
5. Create new `Sidebar` with dashboard list, `+` button, inline rename, per-row `...` menu (rename / delete via `DropdownMenu`).
6. Rebuild `DashboardView` (renamed from `DashboardBuilder.tsx`) as strict 2-column grid flowing widgets top-to-bottom. Drop `react-grid-layout`-based DashboardGrid. Edit-mode wiring retained; WidgetLibrary still opens the old ComponentPalette for now (OMN-44 replaces it).
7. Remove the inline "+ New dashboard" form from the old Header (OMN-38 scope). New-dashboard happens in the Sidebar now.
8. Every new or rebuilt UI file gets a `SOURCE:` header comment. Append rows to `docs/ui-rebuild-traceability.md`.

## Files to create / modify

- **New**: `src/components/frame/Sidebar.tsx` — prototype `src/app.jsx:339-422` + CSS `OmniDash.html:93-240`.
- **Rewrite**: `src/components/frame/FrameLayout.tsx` — prototype `OmniDash.html:93-95` (`.app { display: grid; grid-template-columns: 240px 1fr; height: 100vh; }`).
- **Rewrite**: `src/components/frame/Header.tsx` — prototype `src/app.jsx:423-451` + CSS `OmniDash.html:242-326`.
- **Rename + rewrite**: `src/pages/DashboardBuilder.tsx` → `src/pages/DashboardView.tsx`. Prototype `src/app.jsx:452-537` + `OmniDash.html:327-439`.
- **Extend**: `src/store/dashboardSlice.ts`, `src/store/types.ts`.
- **Remove**: `src/components/dashboard/DashboardGrid.tsx` (replaced by the inline 2-column grid in `DashboardView`), `react-grid-layout` and `@types/react-grid-layout` from `package.json`.
- **Keep**: `ComponentPalette.tsx` for now — it still works as the palette, becomes `WidgetLibrary` in OMN-44.

## Store shape change

Before:
```ts
{ activeDashboard: DashboardDefinition | null, ... }
```

After:
```ts
{
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,  // id of active dashboard in dashboards array
  // legacy accessor: activeDashboard = dashboards.find(d => d.id === activeDashboardId) ?? null
  ...
}
```

Deliver `activeDashboard` as a getter/selector so existing consumers don't need changes.

## localStorage keys

- `omnidash.dashboards.list.v1` — JSON array of DashboardDefinition (metadata-only view; layout bodies still in `./dashboard-layouts/*.json`)
- `omnidash.lastActiveName.v1` — string

## Preservation

- `layoutPersistence.write/read` API unchanged.
- `useProjectionQuery`, `ComponentConfigPanel`, widgets all unchanged.
- All 221 existing tests pass (some will need updates for new component names).

## Out of scope

- Drag-and-drop (OMN-44).
- Full removal of vanilla-extract (OMN-45).
- TweaksPanel (deferred).
- WidgetLibrary right-dock (OMN-44 — ComponentPalette stays as-is for now).

## Definition of Done

- [ ] Sidebar renders list of dashboards; create / rename / delete / switch all work.
- [ ] `+` button in Sidebar replaces the old Header inline form.
- [ ] Main content renders in strict 2-column grid.
- [ ] Save + reload hydrates the last-active dashboard (lastActiveName lookup).
- [ ] `react-grid-layout` and `@types/react-grid-layout` removed from `package.json`.
- [ ] Every new/rewritten component has a `SOURCE:` header.
- [ ] Traceability doc has new rows for Sidebar, FrameLayout, Header, DashboardView.
- [ ] `npm run check` and `npm test` both pass.
