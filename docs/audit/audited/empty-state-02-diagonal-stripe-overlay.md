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
status: audited
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

**Issue [CRITICAL]**: Diagonal-stripe overlay is completely absent from v2.
- Prototype: Renders an absolutely-positioned decorative `<div>` with `backgroundImage: "repeating-linear-gradient(45deg, transparent 0 10px, var(--line-2) 10px 11px)"`, `opacity: 0.4`, and `pointerEvents: "none"` (chunk lines 27-32).
- v2: `src/pages/DashboardView.tsx:177-182` renders only a single centered `<div>` containing text — no absolutely-positioned overlay element, no gradient, no stripes. None of the five required CSS properties (`position: absolute`, `inset: 0`, the `repeating-linear-gradient` background, `opacity: 0.4`, `pointer-events: none`) are applied anywhere in the empty-state fallback.
- Impact: The dashed card's characteristic 45-degree hatched texture is missing entirely; v2's empty state appears as flat centered text with no visual treatment, losing the prototype's graph-paper-under-glass aesthetic and the signal that this is a "no content yet" placeholder zone.

### Structure

**Issue [CRITICAL]**: Overlay `<div>` element does not exist in v2's empty-state DOM.
- Prototype: The decorative `<div/>` is the first child of the outer empty-state container, preceding subsequent content children (chunk lines 27-32, per spec it stacks under siblings that carry `position: relative`).
- v2: `src/pages/DashboardView.tsx:177-182` — the empty branch produces exactly one flex `<div>` with inline text; there is no sibling overlay element, no wrapper establishing stacking context, and no `position: relative` parent for overlay containment. The element was neither replaced with a `::before` pseudo-element (no CSS rule targets this state) nor preserved as a div — it is simply omitted.
- Impact: Because the overlay element is missing, even if styles were added later there is no DOM node to paint them on; the fix requires adding the `<div/>` as first child of a newly-introduced relative-positioned empty-state container (pairs with empty-state-01's missing dashed outer container).

### Content

- No issues found.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
