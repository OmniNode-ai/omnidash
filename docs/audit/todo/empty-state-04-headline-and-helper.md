---
id: empty-state-04
component: EmptyState
prototype_jsx:
  file: src/app.jsx
  lines: "573-578"
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

# empty-state-04 — Headline and helper text

Covers the two text blocks beneath the icon tile: the bold headline "This dashboard is empty" and the smaller helper line "Add a widget to start monitoring. Drag from the library, or click below."

Note: v2 has no dedicated `EmptyState.tsx` — v2 renders empty-state inline within `DashboardView.tsx`. Target is `DashboardView.tsx`.

## Prototype JSX (verbatim)

```jsx
      <div style={{fontSize:17, fontWeight:600, color:"var(--ink)", marginBottom:6, position:"relative"}}>
        This dashboard is empty
      </div>
      <div style={{fontSize:13, marginBottom:16, position:"relative"}}>
        Add a widget to start monitoring. Drag from the library, or click below.
      </div>
```

## Prototype inline styles (verbatim)

The prototype uses inline `style={{}}` — **OmniDash.html contains no corresponding selector** (confirmed by grep for `empty` against OmniDash.html: zero matches).

Headline style object:

```js
{ fontSize: 17, fontWeight: 600, color: "var(--ink)", marginBottom: 6, position: "relative" }
```

Helper-text style object:

```js
{ fontSize: 13, marginBottom: 16, position: "relative" }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — v2 headline applies `font-size: 17px`, `font-weight: 600`, `color: var(--ink)`, `margin-bottom: 6px`, `position: relative`. v2 helper text applies `font-size: 13px`, `margin-bottom: 16px`, `position: relative` (color inherits from the outer container's `var(--ink-3)`).
- ☐ **Structure** — two sibling `<div>` elements (not `<h2>` / `<p>`), headline first then helper, both as direct children of the outer empty-state container after the icon tile and before the CTA button.
- ☐ **Content** — text strings are exactly `"This dashboard is empty"` and `"Add a widget to start monitoring. Drag from the library, or click below."`. Verify punctuation (period, comma, final period), capitalization, and wording verbatim. No i18n keys.

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
