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
status: todo
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

(fill in)

### Structure

(fill in)

### Content

(fill in)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
