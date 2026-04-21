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
status: todo
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

(fill in)

### Structure

(fill in)

### Content

(fill in)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
