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
status: blocked
dependencies:
  - dashboard-07
blocked_reason: "Deferred to OMN-44 (drag-and-drop + kebab menu wiring). See DashboardView.tsx:8 and ComponentWrapper.tsx:9 for scope note."
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

- No issues found. (No CSS is introduced by this chunk; visual styling is delegated to `widget-card-NN` and `dashboard-09`.)

### Structure

**Issue: CRITICAL — `<WidgetCard/>` component and drag-wiring are entirely missing in v2.**
- Prototype renders `<WidgetCard w={w} tick={tick} isDragging={draggedWidget === w.id} onMenu={...} onDragStart={...} onDragEnd={...} onSlotDragOver={...} onDrop={...} />` inside a `React.Fragment` per item.
- v2 (`src/pages/DashboardView.tsx:185-210`) inlines a plain `<div className="widget">` with a nested `widget-head` / `widget-body`, wrapping a `<ComponentCell/>`. There is no `WidgetCard` component, no `React.Fragment` wrapper, and no drag-related props or handlers on the widget element (`draggable`, `onDragStart`, `onDragEnd`, `onDragOver`, `onDrop` are all absent).
- None of the prototype callback props (`onMenu`, `onDragStart`, `onDragEnd`, `onSlotDragOver`, `onDrop`) are wired through; the kebab/menu surface from the prototype is also not rendered here.
- The `tick` prop (used by prototype widgets for live re-render cadence) is not threaded into the rendered cell.
- Source comment at line 8 (`// Drag-and-drop deferred to OMN-44; strict 2-column grid is non-draggable for now.`) acknowledges this intentional deferral, but the chunk still needs to be called out as missing against prototype parity.

**Issue: CRITICAL — trailing `<DropIndicator/>` after the map is missing.**
- Prototype renders `{dragging && dragOverSlot === dash.widgets.length && <DropIndicator/>}` immediately after the `.map(...)` inside `.grid`.
- v2 renders no trailing sentinel; there is no `dragging`, `dragOverSlot`, or `DropIndicator` reference anywhere in `DashboardView.tsx`, and no `.drop-indicator` rule is used at the grid-tail position.

### Content

**Issue: CRITICAL — prop callback bodies cannot be verified because the callbacks do not exist.**
- Since `<WidgetCard/>` is not rendered, the exactness checks from the checklist (`onDragStart` closure captures `w.id` not `w`; `onDrop` calls `e.preventDefault()` before `onDropAt(i)`; `onSlotDragOver` forwards `(e, i)` in that order; trailing guard is `dash.widgets.length` not `... - 1`) have no counterpart in v2 to audit. All of these must be introduced when drag wiring lands (OMN-44 per the source comment).

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
