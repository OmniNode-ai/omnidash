---
id: dashboard-07
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "502-509"
prototype_css:
  file: OmniDash.html
  lines: "325-330"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: audited
dependencies:
  - dashboard-01
blocked_reason: null
---

# dashboard-07 — Empty-vs-populated conditional and `.grid` container

Covers the top-level conditional that selects `<EmptyState/>` when `dash.widgets.length === 0` versus the populated `.grid` branch. Also covers the `.grid` opening container and the `React.Fragment`-wrapped `.map` iteration start, including the leading `<DropIndicator/>` drop preview at index `i`.

## Prototype JSX (verbatim)

```jsx
      {dash.widgets.length === 0 ? (
        <EmptyState onAdd={onAddClick}/>
      ) : (
        <>
          <div className="grid">
            {dash.widgets.map((w, i) => (
              <React.Fragment key={w.id}>
                {dragging && dragOverSlot === i && <DropIndicator/>}
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--row-gap);
    align-items: start;
  }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.grid` in v2 `src/styles/dashboard.css` declares `display: grid`, `grid-template-columns: 1fr 1fr`, `gap: var(--row-gap)`, `align-items: start` — values identical to prototype.
- Structure — v2 `DashboardView.tsx` wraps the body in a ternary on `dash.widgets.length === 0`. The empty branch renders `<EmptyState onAdd={onAddClick}/>` — **detail delegated to `empty-state-NN` chunks; do not audit EmptyState internals here.** The populated branch opens a fragment, then `<div className="grid">`, then `dash.widgets.map((w, i) => …)` wrapping each iteration in `<React.Fragment key={w.id}>` and rendering a `<DropIndicator/>` before the widget when `dragging && dragOverSlot === i`.
- Content — conditional prop `onAdd` passes through `onAddClick` unchanged. The `key` on `React.Fragment` is `w.id` (not `i`). Guard expression is exactly `dragging && dragOverSlot === i` (strict equality).

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. `.grid` in `src/styles/dashboard.css:39-44` declares `display: grid`, `grid-template-columns: 1fr 1fr`, `gap: var(--row-gap)`, `align-items: start` — identical to prototype.

### Structure

**Issue: CRITICAL — Empty branch renders inline div, not `<EmptyState/>` component.**
v2 `src/pages/DashboardView.tsx:177-182` renders an inline `<div>` with inline flex-center styles and a text message ("Add components from the palette" / "Empty dashboard — click Edit to add components") instead of delegating to `<EmptyState onAdd={onAddClick}/>` as the prototype does. This changes the entire empty-state UX (no illustration, no CTA button, no `onAdd` handler wired). Delegation to `empty-state-NN` chunks is not possible because no EmptyState component is mounted.

**Issue: CRITICAL — No `<React.Fragment>` wrapper around each iteration and no `<DropIndicator/>` drop preview.**
v2 `DashboardView.tsx:185-210` maps directly to `<div className="widget">` without a `React.Fragment key={w.id}` wrapper, and never renders `<DropIndicator/>` before the widget. The `dragging && dragOverSlot === i` guard is absent entirely — drag-and-drop preview is not wired. (Note: file header line 8 acknowledges "Drag-and-drop deferred to OMN-44" so this is a tracked deferral, but from a fidelity standpoint it is still a structural divergence from the prototype.)

**Issue: MINOR — Populated branch lacks the outer `<>` fragment.**
Prototype opens `<>` then `<div className="grid">` (so that sibling elements such as the drop indicator could live alongside). v2 opens `<div className="grid">` directly with no fragment. Harmless given no siblings exist, but diverges from prototype shape.

### Content

**Issue: CRITICAL — Empty-state conditional uses `activeDashboard.layout.length === 0` with no `onAdd`/`onAddClick` prop plumbed.**
Prototype checks `dash.widgets.length === 0` and passes `onAdd={onAddClick}`. v2 checks `activeDashboard.layout.length === 0` (data-model rename, acceptable per file header line 6) but the empty branch has no click handler at all — users cannot add from the empty state. Strict equality on the length check is preserved.

**Issue: MINOR — Map iterator signature `(item)` drops the index.**
Prototype signature is `(w, i) => …` so the index is available for the `dragOverSlot === i` guard. v2 is `(item) => …` with no index. Consistent with the dropped DropIndicator, but worth noting for the OMN-44 restoration.

**Issue: MINOR — `key` is `item.i` rather than `w.id`.**
v2 keys the map by `item.i` (the layout-item identifier in the v2 data model); prototype keys the `React.Fragment` by `w.id`. Semantically equivalent given the v2 data model, but worth tracking.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
