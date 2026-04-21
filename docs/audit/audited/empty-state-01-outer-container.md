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
status: audited
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

**Issue [CRITICAL]**: v2 empty-state outer container is missing the entire dashed-card treatment.
- Prototype: outer `<div>` carries inline styles `border: "1.5px dashed var(--line)"`, `borderRadius: 14`, `padding: "56px 20px"`, `textAlign: "center"`, `margin: "0 24px"`, `color: "var(--ink-3)"`, `position: "relative"`, `overflow: "hidden"` (chunk lines 28-37 / 45-54).
- v2: at `src/pages/DashboardView.tsx:178` the empty-state wrapper is `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-2)', fontSize: '14px' }}>`. No border, no border-radius, no padding, no horizontal margin, no `position: relative`, no `overflow: hidden`. Uses `var(--ink-2)` instead of `var(--ink-3)`. Adds unrelated flex-centering + `height: 100%` + `fontSize: 14px` that the prototype does not have on this element.
- Impact: the empty-dashboard state renders as a bare centered line of text instead of the prototype's framed dashed "drop-zone" card. The visual affordance that an empty dashboard is a *placeholder waiting for widgets* is lost, and the color shade is one step too dark (ink-2 vs ink-3).

### Structure

**Issue [CRITICAL]**: v2 does not wrap the empty-state in a dedicated component and inlines a differently-shaped `<div>` in the parent dash-body.
- Prototype: a standalone `EmptyState` function component returns a single outer `<div>` (chunk lines 26-37) — the dashed card is the root, rendered by the parent as `<EmptyState onAdd={...} />`.
- v2: there is no `EmptyState` component. `src/pages/DashboardView.tsx:177-182` branches inline inside `<div className="dash-body">` and renders a flex-center `<div>` containing a bare text node. The prototype's root element is effectively absent — v2's wrapper is a different element playing a different role (flex centerer, not dashed card).
- Impact: the prototype's empty-state root element is missing entirely; any child chunks (illustration/headline/body/CTA button) have no container to attach to. Without this wrapper being added back, all downstream empty-state chunks will also fail.

**Issue [MAJOR]**: v2 passes no `onAdd` handler pathway; the empty-state has no hook for a CTA.
- Prototype: `EmptyState({ onAdd })` — the component accepts an `onAdd` prop (chunk line 26) wired to add-widget action in the prototype's parent.
- v2: `DashboardView.tsx:177-182` renders only static text; there is no prop, no callback, no button stub. `handleAddComponent` exists at line 90 but is not reachable from the empty-state branch.
- Impact: even if later chunks re-introduce the CTA button, the plumbing from DashboardView down to the empty-state is absent. Addressing empty-state-01 alone must reintroduce a component boundary that can accept an `onAdd` handler.

### Content

**Issue [MAJOR]**: v2 puts text content directly inside the outer container; the prototype's outer container is text-free.
- Prototype: the audited `<div>` contains no text of its own — it is a pure wrapper; headline/body/CTA live in child elements (chunk lines 28-37).
- v2: `src/pages/DashboardView.tsx:179-181` renders a raw string (`'Add components from the palette'` or `'Empty dashboard — click Edit to add components'`) directly inside the outer wrapper.
- Impact: v2 has inlined what should be child-chunk content into the outer container, coupling structure and copy. Child chunks (headline, body, CTA) will have nowhere to render without first extracting this text out of the outer div.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
