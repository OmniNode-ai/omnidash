---
id: dashboard-11
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "463-465"
prototype_css:
  file: OmniDash.html
  lines: "439"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: audited
dependencies:
  - dashboard-01
  - dashboard-07
blocked_reason: null
---

# dashboard-11 — `.library-open .grid .widget` transition hook

Covers the cross-cutting CSS rule that adds a transform transition to widget cards when the widget library rail is open. The `library-open` class is expected to be applied to an ancestor (root `<App>` / layout wrapper) when `libOpen` is true; DashboardView participates only by rendering `.grid` under that ancestor and by applying the `paddingRight: 380` inline style on `.dash-body` (audited in dashboard-01).

## Prototype JSX (verbatim)

```jsx
    <div className="dash-body" data-screen-label="01 Populated Dashboard"
         style={libOpen ? {paddingRight: 380} : {}}>
```

_Cross-reference: the `library-open` class itself is toggled by a parent component, not DashboardView. Confirm in the v2 parent (likely `src/pages/DashboardBuilder.tsx` or a layout wrapper) that the class is applied when `libOpen` is true so the selector below can match._

## Prototype CSS (verbatim, scoped to elements above)

```css
  .library-open .grid .widget { transition: transform 0.2s; }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — the `.library-open .grid .widget` rule exists in v2 `src/styles/dashboard.css` with exactly `transition: transform 0.2s;`.
- Structure — some ancestor of `.grid` (the app root, main layout, or builder wrapper) toggles a `library-open` className when the widget library rail is open. DashboardView itself does not apply this class; verify the ancestor wiring still functions so the selector resolves.
- Content — class name is exactly `library-open` (hyphenated, not `libraryOpen` or `library_open`); transition duration is exactly `0.2s` (not `200ms` literal in the stylesheet unless v2 explicitly chose to normalize — if so, note as intentional).

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. `src/styles/dashboard.css:153` contains exactly `.library-open .grid .widget { transition: transform 0.2s; }` — byte-identical to the prototype rule.

### Structure

**Issue: `library-open` class is never applied by any ancestor in v2 — selector can never match.**

- Severity: CRITICAL (dead rule — the transition hook will never fire when the widget library rail is toggled).
- Evidence: `grep -rn "library-open\|libOpen\|libraryOpen"` across `/mnt/c/Code/omninode_ai/omnidash-v2/src` returns exactly one hit — the CSS rule itself at `src/styles/dashboard.css:153`. There is no `libOpen` state, no className toggle in `DashboardView.tsx`, and no ancestor wrapper (no `DashboardBuilder.tsx` found; the prototype's `App`/layout-level toggle was not ported).
- Prototype contract (from `src/app.jsx:463-465` cross-ref in the chunk and the `paddingRight: 380` sibling behavior already audited in dashboard-01): an ancestor of `.dash-body` sets `className="library-open"` when `libOpen === true`. v2's `DashboardView.tsx` renders `.dash-body` and `.grid` (lines 176, 184) but neither it nor any wrapper component sets the flag.
- Consequence: the CSS rule is inert. When the widget library rail eventually lands in v2, this selector will silently fail to apply the `transform 0.2s` transition unless the ancestor wiring is added alongside it.
- Note: dashboard-01's `paddingRight: 380` inline style is also absent from v2's `.dash-body` element (line 176 has no `style` prop conditional on `libOpen`), which is consistent with the whole `libOpen` feature being unported — not a regression within this chunk, but confirms the structural gap is systemic.

### Content

- No issues found. Class name is hyphenated `library-open` (not camelCase or snake_case); duration is `0.2s` (not `200ms`); selector chain `.library-open .grid .widget` matches the prototype exactly.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
