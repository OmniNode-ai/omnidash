---
id: widget-library-01
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "629-630"
prototype_css:
  file: OmniDash.html
  lines: "442-454"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-library-01 — Outer `<aside className="library">` with open/close class state

Covers the outer `<aside>` element for the widget library rail, and the `.library` / `.library.open` class-based open/close transform state.

## Prototype JSX (verbatim)

```jsx
  return (
    <aside className="library open">
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .library {
    position: fixed;
    top: 52px; right: 0;
    width: 360px; height: calc(100vh - 52px);
    background: var(--panel);
    border-left: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(.2,.8,.2,1);
    z-index: 50;
  }
  .library.open { transform: none; }
```

Note: prototype uses `var(--accent)` elsewhere in the library block; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/library.css` with identical values (fixed positioning, 360px width, top offset 52px, slide-in transform, cubic-bezier timing, z-index 50, box-shadow).
- ☐ **Structure** — v2 `ComponentPalette.tsx` renders the rail as `<aside>` with class name `library` (plus an `open` modifier toggled by visibility state), not a `<div>` or other element.
- ☐ **Content** — static class names match exactly: `library` and `library.open` (no renamed classes like `palette` or `component-palette`).

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
