---
id: dashboard-08
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "510-521"
prototype_css:
  file: OmniDash.html
  lines: "325-330"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-07
blocked_reason: null
---

# dashboard-08 — `<WidgetCard/>` render inside `.grid` + trailing drop indicator

Covers the `<WidgetCard/>` invocation from within the `dash.widgets.map` loop (prop wiring only — WidgetCard internals are audited elsewhere), plus the trailing `<DropIndicator/>` that renders when the drag target is past the last widget.

## Prototype JSX (verbatim)

```jsx
                <WidgetCard
                  w={w} tick={tick}
                  isDragging={draggedWidget === w.id}
                  onMenu={(e) => onMenu(w.id, e)}
                  onDragStart={() => onDragStart(w.id)}
                  onDragEnd={onDragEnd}
                  onSlotDragOver={(e) => handleSlotDragOver(e, i)}
                  onDrop={(e) => { e.preventDefault(); onDropAt(i); }}
                />
              </React.Fragment>
            ))}
            {dragging && dragOverSlot === dash.widgets.length && <DropIndicator/>}
```

## Prototype CSS (verbatim, scoped to elements above)

_No CSS rules are introduced by this chunk directly — styling for `<WidgetCard/>` is owned by the `widget-card-NN` chunk set. The `<DropIndicator/>` styling is covered in `dashboard-09`._

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — no new CSS in this chunk; detail delegated to `widget-card-NN` for the card itself and `dashboard-09` for the drop indicator.
- Structure — v2 renders `<WidgetCard>` inside each `React.Fragment` with exactly these props: `w={w}`, `tick={tick}`, `isDragging={draggedWidget === w.id}`, `onMenu={(e) => onMenu(w.id, e)}`, `onDragStart={() => onDragStart(w.id)}`, `onDragEnd={onDragEnd}`, `onSlotDragOver={(e) => handleSlotDragOver(e, i)}`, `onDrop={(e) => { e.preventDefault(); onDropAt(i); }}`. After the `.map(...)` the trailing `<DropIndicator/>` renders when `dragging && dragOverSlot === dash.widgets.length`. **WidgetCard internals delegated to `widget-card-NN`.**
- Content — prop callback bodies are exact: `onDragStart` closure passes `w.id` (not `w`), `onDrop` calls `e.preventDefault()` before `onDropAt(i)`, `onSlotDragOver` forwards `(e, i)` (not `(i, e)`). Trailing guard condition is `dash.widgets.length` (not `dash.widgets.length - 1`).

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
