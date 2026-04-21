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
status: audited
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

**Issue [CRITICAL]**: v2 empty-state icon tile is entirely missing — no styled 48×48 rounded panel.
- Prototype: chunk's quoted JSX block lines 27–35 render a `<div>` with inline styles `width: 48, height: 48, borderRadius: 10, background: "var(--panel-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", margin: "0 auto 14px", color: "var(--accent-ink)", position: "relative"`.
- v2: `src/pages/DashboardView.tsx:178-182` renders only a single flex container with a text string — zero width/height/border-radius/background/border tile exists. None of the ten required style properties are applied anywhere.
- Impact: User sees a bare centered sentence instead of the branded empty-state card; the visual anchor (rounded panel with accent-colored glyph) that signals "this is an empty surface, not a broken one" is absent.

### Structure

**Issue [CRITICAL]**: The icon-tile `<div>` element is not present in the v2 DOM tree.
- Prototype: chunk's quoted block shows a `<div>` wrapper whose sole child is `<Icon name="grid" size={22}/>`, positioned as the second child of the outer empty-state container (after the stripe overlay, before the headline).
- v2: `src/pages/DashboardView.tsx:178-182` — the empty-state branch is a single `<div>` containing only the fallback text string. There is no wrapper div, no stripe overlay, no headline, and therefore no slot in which the icon tile could be the "second child". The entire empty-state structure from the prototype is collapsed to a one-line text node.
- Impact: Fix for this chunk cannot land in isolation — empty-state-01 (outer container + stripe) must be built first so the tile has a parent to sit inside. Dependency on `empty-state-01` in frontmatter is correct.

### Content

**Issue [CRITICAL]**: The `<Icon name="grid" size={22}/>` child is not rendered in v2.
- Prototype: chunk's quoted block line 34 renders `<Icon name="grid" size={22}/>` as the tile's only child.
- v2: `src/pages/DashboardView.tsx:177-182` — no `Icon` component is imported or used anywhere in the empty-state branch; neither the name `"grid"` nor the size `22` appears. The `Icon` symbol is not imported in this file at all.
- Impact: Even once the tile wrapper is added, the glyph that makes the tile recognizable as a dashboard-empty affordance will be missing unless `Icon` is imported and invoked with exactly `name="grid"` and `size={22}`.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
