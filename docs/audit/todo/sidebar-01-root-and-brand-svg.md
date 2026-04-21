---
id: sidebar-01
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "341-358"
prototype_css:
  file: OmniDash.html
  lines: "96-110"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-01 — Sidebar root, `.brand` wrapper, and `.brand-mark` SVG

Covers the outer `<aside className="sidebar">` element, the `<div className="brand">` wrapper, and the `<svg className="brand-mark">` with its gradient defs and three paths.

## Prototype JSX (verbatim)

```jsx
    <aside className="sidebar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" fill="none">
          <defs>
            <linearGradient id="bm-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="oklch(70% 0.14 230)"/>
              <stop offset="55%" stopColor="oklch(75% 0.13 200)"/>
              <stop offset="100%" stopColor="oklch(82% 0.14 170)"/>
            </linearGradient>
          </defs>
          {/* hexagon outer */}
          <path d="M16 2 L28 9 L28 23 L16 30 L4 23 L4 9 Z"
                stroke="url(#bm-g)" strokeWidth="2.2" strokeLinejoin="miter"/>
          {/* angular D-chevron inside */}
          <path d="M11 9 L11 23 L17 23 L22 18 L22 14 L17 9 Z"
                stroke="url(#bm-g)" strokeWidth="2" strokeLinejoin="miter" fill="none"/>
          <path d="M14 14 L18 18" stroke="url(#bm-g)" strokeWidth="2" strokeLinecap="square"/>
        </svg>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
.sidebar {
  background: var(--sidebar);
  color: var(--sidebar-ink);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sidebar-line);
}
.brand {
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--sidebar-line);
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark { width: 28px; height: 28px; flex-shrink: 0; }
```

Note: prototype uses `var(--accent)` in places; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values.
- ☐ **Structure** — v2 `Sidebar.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names and attributes (`viewBox`, `xmlns`, `fill`, `stroke`, `strokeWidth`, `strokeLinejoin`, etc.).
- ☐ **Content** — static attributes match exactly: SVG `viewBox="0 0 32 32"`, gradient `id="bm-g"`, gradient stop `offset` and `stopColor` values, path `d` attributes (coordinates), path stroke widths.

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
