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
status: todo
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

(fill in)

### Structure

(fill in)

### Content

(fill in)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
