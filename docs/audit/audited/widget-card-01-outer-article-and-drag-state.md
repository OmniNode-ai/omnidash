---
id: widget-card-01
component: WidgetCard
prototype_jsx:
  file: src/app.jsx
  lines: "590-597"
prototype_css:
  file: OmniDash.html
  lines: "332-350"
v2_targets:
  - src/components/dashboard/ComponentWrapper.tsx
  - src/styles/dashboard.css
status: audited
dependencies: []
blocked_reason: null
---

# widget-card-01 — Outer `<div className="widget">` wrapper with drag state classes and drag handlers

Covers the root element of `WidgetCard`: the `<div className="widget">` with the conditional `dragging` class, the `draggable` attribute, and the four drag-related event handlers (`onDragStart`, `onDragEnd`, `onDragOver`, `onDrop`). Also covers the sibling CSS state `.widget.drop-target` and the `widget-in` entrance animation.

## Prototype JSX (verbatim)

```jsx
    <div
      className={`widget ${isDragging ? "dragging" : ""}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={onSlotDragOver}
      onDrop={onDrop}
    >
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .widget {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    position: relative;
    transition: box-shadow 0.2s, border-color 0.15s, transform 0.2s, opacity 0.2s;
    animation: widget-in 0.35s cubic-bezier(.2,.8,.2,1);
  }
  @keyframes widget-in {
    from { opacity: 0; transform: translateY(8px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }
  .widget.dragging { opacity: 0.35; }
  .widget.drop-target {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-md);
  }
```

Note: prototype uses `var(--accent)` and `var(--accent-soft)` in `.widget.drop-target`; v2 renamed `--accent` to `--brand` during OMN-42. The substitution to `var(--brand)` / `var(--brand-soft)` is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/dashboard.css` with identical values (accounting for `--accent` → `--brand` rename). Includes the `@keyframes widget-in` rule and the `.widget.dragging` / `.widget.drop-target` state variants.
- ☐ **Structure** — v2 `ComponentWrapper.tsx` renders the outer element with class `widget` (v2 may render as `<article>` or `<div>`; note the prototype here uses `<div>`), toggles the `dragging` class based on drag state, sets the `draggable` attribute, and wires all four handlers (`onDragStart`, `onDragEnd`, `onDragOver`, `onDrop`) with the same semantics.
- ☐ **Content** — the `onDragStart` handler sets `e.dataTransfer.effectAllowed = "move"` before calling the parent callback; the class template interpolates `isDragging ? "dragging" : ""` (no other conditional class on this element at this level).

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. All `.widget` base properties (background, border, border-radius, overflow, box-shadow, position, transition, animation) at `src/styles/dashboard.css:46-55` match the prototype verbatim. `@keyframes widget-in` (`dashboard.css:56-59`) matches prototype lines 48-51. `.widget.dragging` (`dashboard.css:60`) matches prototype. `.widget.drop-target` (`dashboard.css:61-64`) matches with the documented `--accent` → `--brand` / `--accent-soft` → `--brand-soft` rename.

### Structure

**Issue [CRITICAL]**: Outer `<div className="widget">` is missing the `draggable` attribute.
- Prototype: `draggable` attribute set on the root div (chunk lines 25-27 in quoted block: `<div ... draggable ...>`).
- v2: `src/components/dashboard/ComponentWrapper.tsx:34` renders `<div className="widget">` with no `draggable` attribute.
- Impact: Widget cannot initiate HTML5 drag, breaking the "drag to reorder" UX entirely at this layer.

**Issue [CRITICAL]**: Conditional `dragging` class toggle is missing.
- Prototype: `className={\`widget ${isDragging ? "dragging" : ""}\`}` (chunk line 26).
- v2: `ComponentWrapper.tsx:34` uses a static `className="widget"` — no `isDragging` prop, no conditional.
- Impact: The `.widget.dragging { opacity: 0.35 }` visual feedback never applies, so the user gets no indication a widget is being dragged.

**Issue [CRITICAL]**: All four drag event handlers are missing (`onDragStart`, `onDragEnd`, `onDragOver`, `onDrop`).
- Prototype: root div wires `onDragStart`, `onDragEnd`, `onDragOver={onSlotDragOver}`, `onDrop={onDrop}` (chunk lines 28-31).
- v2: `ComponentWrapper.tsx:34` has no drag handlers and no corresponding props in the `ComponentWrapperProps` interface (`ComponentWrapper.tsx:14-22`).
- Impact: Widget is neither a drag source nor a drop target at this layer; the prototype's drag-to-reorder flow cannot run through this component. (Header comment at `ComponentWrapper.tsx:9` acknowledges "OMN-44 handles drag" in an outer shell, but the prototype places these on this exact element — there is a structural divergence from the prototype here.)

**Issue [MINOR]**: `ComponentWrapperProps` has no `isDragging` prop or drag callback props.
- Prototype: parent passes `isDragging`, `onDragStart`, `onDragEnd`, `onSlotDragOver`, `onDrop` into the widget.
- v2: `ComponentWrapper.tsx:14-22` defines only `title`, `isLoading`, `error`, `isEmpty`, `emptyMessage`, `emptyHint`, `children`.
- Impact: Even if a parent wanted to pass drag state/handlers, the component's typed API forbids it.

### Content

**Issue [CRITICAL]**: The `onDragStart` body (`e.dataTransfer.effectAllowed = "move"; onDragStart();`) is not implemented.
- Prototype: `onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}` (chunk line 28).
- v2: no `onDragStart` handler exists on the element (`ComponentWrapper.tsx:34`); `e.dataTransfer.effectAllowed = "move"` is nowhere in this file.
- Impact: Without `effectAllowed = "move"`, the browser's drag cursor and default drop behavior may not reflect a move operation, degrading perceived drag affordance even once handlers are added.

**Issue [MAJOR]**: Class template does not interpolate `isDragging` into the className.
- Prototype: template string `\`widget ${isDragging ? "dragging" : ""}\`` (chunk line 26) — only one conditional, nothing else.
- v2: `ComponentWrapper.tsx:34` uses a plain string literal `"widget"`; no template, no conditional.
- Impact: Dragging-state styling (opacity 0.35) never activates; duplicates the structural finding above from the content/semantics angle.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
