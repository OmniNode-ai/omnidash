---
id: empty-state-02
component: EmptyState
prototype_jsx:
  file: src/app.jsx
  lines: "558-563"
prototype_css:
  file: "N/A (inline styles in app.jsx)"
  lines: "N/A"
v2_targets:
  - src/pages/DashboardView.tsx
status: todo
dependencies:
  - empty-state-01
blocked_reason: null
---

# empty-state-02 — Diagonal-stripe decorative overlay

Covers the absolutely-positioned decorative `<div>` that paints repeating 45-degree stripes across the dashed container. This is a purely decorative overlay driven by `repeating-linear-gradient` with `pointerEvents: "none"` so it does not intercept clicks.

Note: v2 has no dedicated `EmptyState.tsx` — v2 renders empty-state inline within `DashboardView.tsx`. Target is `DashboardView.tsx`.

## Prototype JSX (verbatim)

```jsx
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(45deg, transparent 0 10px, var(--line-2) 10px 11px)",
        opacity: 0.4,
        pointerEvents: "none",
      }}/>
```

## Prototype inline styles (verbatim)

The prototype uses inline `style={{}}` — **OmniDash.html contains no corresponding selector** (confirmed by grep for `empty` against OmniDash.html: zero matches). The style object on the overlay:

```js
{
  position: "absolute",
  inset: 0,
  backgroundImage: "repeating-linear-gradient(45deg, transparent 0 10px, var(--line-2) 10px 11px)",
  opacity: 0.4,
  pointerEvents: "none",
}
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — v2 renders a stripe overlay with exactly these properties: `position: absolute`, `inset: 0`, `background-image: repeating-linear-gradient(45deg, transparent 0 10px, var(--line-2) 10px 11px)`, `opacity: 0.4`, `pointer-events: none`. Gradient angle, stop distances (0 → 10px transparent, 10px → 11px stripe), and the `var(--line-2)` token must all be preserved exactly.
- ☐ **Structure** — the overlay is a self-closing `<div/>` placed as the **first child** of the outer empty-state container (so subsequent children stack visually above it via `position: relative` on those children).
- ☐ **Content** — the overlay is empty (no text, no children). Verify v2 did not collapse the overlay into a `::before` pseudo-element or omit it entirely.

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
