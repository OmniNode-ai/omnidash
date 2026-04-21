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
status: audited
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

**Issue [CRITICAL]**: Headline `<div>` with 17px / 600-weight / `var(--ink)` / 6px margin-bottom styling is entirely absent.
- Prototype: two styled `<div>` elements — headline `{ fontSize: 17, fontWeight: 600, color: "var(--ink)", marginBottom: 6, position: "relative" }` (chunk lines 27-29, 41-43).
- v2: `DashboardView.tsx:178` renders a single flex-centered `<div>` with `color: var(--ink-2)`, `fontSize: 14px`; no headline element exists, no `var(--ink)` color, no 600 weight, no 17px size, no 6px margin-bottom, no `position: relative`.
- Impact: User sees a single dim gray sentence instead of a two-tier "bold title + helper line" hierarchy — the empty state reads as a status line rather than an onboarding prompt.

**Issue [CRITICAL]**: Helper text styling (13px, 16px margin-bottom, `position: relative`) is absent.
- Prototype: helper `<div>` styled `{ fontSize: 13, marginBottom: 16, position: "relative" }` (chunk lines 30-32, 47-49).
- v2: `DashboardView.tsx:178` uses `fontSize: '14px'` with no margin-bottom and no `position: relative`; color is `var(--ink-2)` (inherits correctly by coincidence, but size is wrong).
- Impact: Text is 1px larger than prototype and lacks the 16px bottom spacing that separates helper from the (also missing) CTA button.

### Structure

**Issue [CRITICAL]**: Two-sibling-`<div>` structure (headline + helper) is missing; v2 has a single text node inside a flex centerer.
- Prototype: two sibling `<div>` elements in document order — headline first, helper second — as direct children of the empty-state container, positioned after the icon tile and before the CTA button (chunk lines 26-33).
- v2: `DashboardView.tsx:177-182` renders one `<div>` containing a single ternary-selected string; no icon tile, no CTA button, no sibling structure, no outer empty-state container (`.empty-state` class absent).
- Impact: The prototype's vertical stack (icon -> title -> helper -> CTA) is collapsed to a single centered line; users have no visual call-to-action and no way to distinguish title from description.

### Content

**Issue [CRITICAL]**: Required text strings "This dashboard is empty" and "Add a widget to start monitoring. Drag from the library, or click below." are both absent.
- Prototype: verbatim strings `"This dashboard is empty"` and `"Add a widget to start monitoring. Drag from the library, or click below."` (chunk lines 28, 31).
- v2: `DashboardView.tsx:179-181` renders either `'Add components from the palette'` (edit mode) or `'Empty dashboard — click Edit to add components'` (view mode). Neither matches the prototype headline or helper wording.
- Impact: User sees completely different copy. The prototype's instructional helper ("Drag from the library, or click below.") is lost, so the affordance hint about the CTA button is gone. Wording, punctuation, and capitalization all diverge.

**Issue [MAJOR]**: v2 branches on `editMode` to show different copy; prototype has a single static string pair.
- Prototype: headline and helper are static regardless of mode (chunk lines 26-33).
- v2: `DashboardView.tsx:179-181` conditionally swaps the entire message based on `editMode`.
- Impact: Behavior divergence — the prototype relies on the empty state being mode-invariant so the CTA button drives the add-widget flow; v2's edit-mode copy assumes a separate palette flow.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
