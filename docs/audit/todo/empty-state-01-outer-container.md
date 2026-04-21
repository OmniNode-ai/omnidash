---
id: empty-state-01
component: EmptyState
prototype_jsx:
  file: src/app.jsx
  lines: "546-557"
prototype_css:
  file: "N/A (inline styles in app.jsx)"
  lines: "N/A"
v2_targets:
  - src/pages/DashboardView.tsx
status: todo
dependencies: []
blocked_reason: null
---

# empty-state-01 — `EmptyState` outer dashed container

Covers the `EmptyState` function component's outer `<div>` wrapper: the dashed-border card that holds the empty-dashboard message. All styling is inline on this element; there is no matching `.empty*` selector in OmniDash.html.

Note: v2 has no dedicated `EmptyState.tsx` — v2 renders empty-state inline within `DashboardView.tsx`. Target is `DashboardView.tsx`.

## Prototype JSX (verbatim)

```jsx
function EmptyState({ onAdd }) {
  return (
    <div style={{
      border: "1.5px dashed var(--line)",
      borderRadius: 14,
      padding: "56px 20px",
      textAlign: "center",
      margin: "0 24px",
      color: "var(--ink-3)",
      position: "relative",
      overflow: "hidden",
    }}>
```

## Prototype inline styles (verbatim)

The prototype uses inline `style={{}}` objects in JSX — **OmniDash.html contains no corresponding `.empty*` selector** (confirmed by grep for `empty` against OmniDash.html: zero matches). The style object attached to the outer container:

```js
{
  border: "1.5px dashed var(--line)",
  borderRadius: 14,
  padding: "56px 20px",
  textAlign: "center",
  margin: "0 24px",
  color: "var(--ink-3)",
  position: "relative",
  overflow: "hidden",
}
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — v2's outer empty-state wrapper applies every property in the inline style object above with identical values: `border: 1.5px dashed var(--line)`, `border-radius: 14px`, `padding: 56px 20px`, `text-align: center`, `margin: 0 24px`, `color: var(--ink-3)`, `position: relative`, `overflow: hidden`.
- ☐ **Structure** — v2 renders a single outer `<div>` (not nested wrappers) as the empty-state root, matching the prototype's top-level element. No extra className or wrapper component added.
- ☐ **Content** — the container itself contains no text; all static content lives in child chunks. Verify no stray text, data attributes, or className bleeds onto this element.

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
