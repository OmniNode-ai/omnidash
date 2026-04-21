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
status: done
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

- No issues found.

(Every property in the prototype `.library` and `.library.open` blocks — `position: fixed`, `top: 52px`, `right: 0`, `width: 360px`, `height: calc(100vh - 52px)`, `background: var(--panel)`, `border-left: 1px solid var(--line)`, `box-shadow: var(--shadow-lg)`, `display: flex`, `flex-direction: column`, `transform: translateX(100%)`, `transition: transform 0.3s cubic-bezier(.2,.8,.2,1)`, `z-index: 50`, and `.library.open { transform: none; }` — is present with identical values at `src/styles/library.css:6-18`.)

### Structure

**Issue [MAJOR]**: `open` modifier is hardcoded rather than toggled by visibility state.
- Prototype: JSX renders `<aside className="library open">` (chunk lines 25-26) — and the underlying `.library` vs `.library.open` CSS contract is explicitly a two-state transform (slides off-canvas when `open` is absent, slides in when present). The checklist item for Structure calls this out: rail must carry "an `open` modifier toggled by visibility state".
- v2: `src/components/dashboard/ComponentPalette.tsx:36` hardcodes `className="library open"` as a string literal. There is no prop, state, or conditional driving the `open` class. The file-level comment at `src/components/dashboard/ComponentPalette.tsx:7` also documents "No … slide-in animation yet — those are OMN-44 scope," confirming this is a deliberate deferral, not an accidental omission.
- Impact: The rail is stuck permanently open. The slide-in/slide-out transition defined in `library.css` is dead code at runtime — users cannot dismiss or reveal the library via the `open` class toggle that the prototype contract relies on. Any future close affordance will be inert until a visibility prop is wired up.

### Content

- No issues found.

(The static class tokens `library` and `library.open` are used verbatim in both `ComponentPalette.tsx:36` and `library.css:6,18`; no `palette` / `component-palette` / other renames are present on this element.)

## Resolution

Accepted v2 architectural deviation — `className="library open"` is hardcoded because v2 conditionally renders the palette (editMode toggles mount/unmount) rather than using the prototype's CSS slide-in transition. Close button now calls onClose (OMN-48 prior commit `4145b96`), so the rail can be dismissed. The `.library` transform rule is unused by design in v2.
