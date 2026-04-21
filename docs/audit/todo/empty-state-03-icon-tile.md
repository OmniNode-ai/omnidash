---
id: empty-state-03
component: EmptyState
prototype_jsx:
  file: src/app.jsx
  lines: "564-572"
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

# empty-state-03 — Centered icon tile with `grid` glyph

Covers the 48×48 rounded tile, horizontally centered above the headline, that contains the `grid` icon. The tile sits above the stripe overlay via `position: relative`.

Note: v2 has no dedicated `EmptyState.tsx` — v2 renders empty-state inline within `DashboardView.tsx`. Target is `DashboardView.tsx`.

## Prototype JSX (verbatim)

```jsx
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: "var(--panel-2)", border: "1px solid var(--line)",
        display: "grid", placeItems: "center",
        margin: "0 auto 14px", color: "var(--accent-ink)",
        position: "relative",
      }}>
        <Icon name="grid" size={22}/>
      </div>
```

## Prototype inline styles (verbatim)

The prototype uses inline `style={{}}` — **OmniDash.html contains no corresponding selector** (confirmed by grep for `empty` against OmniDash.html: zero matches). The style object on the icon tile:

```js
{
  width: 48,
  height: 48,
  borderRadius: 10,
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  display: "grid",
  placeItems: "center",
  margin: "0 auto 14px",
  color: "var(--accent-ink)",
  position: "relative",
}
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — v2 icon tile applies every property identically: `width: 48px`, `height: 48px`, `border-radius: 10px`, `background: var(--panel-2)`, `border: 1px solid var(--line)`, `display: grid`, `place-items: center`, `margin: 0 auto 14px`, `color: var(--accent-ink)`, `position: relative`.
- ☐ **Structure** — v2 renders this as a `<div>` containing exactly one child — the `Icon` component — as the second child of the outer empty-state container (after the stripe overlay, before the headline).
- ☐ **Content** — the inner icon is `<Icon name="grid" size={22}/>` — `name` must be the string `"grid"` and `size` must be the number `22`. Do not substitute a different icon name or size.

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
