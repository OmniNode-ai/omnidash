---
id: dashboard-01
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "463-465"
prototype_css:
  file: OmniDash.html
  lines: "320-324"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies: []
blocked_reason: null
---

# dashboard-01 — DashboardView root `<div className="dash-body">` container

Covers the outer `<div className="dash-body">` container element that wraps the dashboard header and body. Includes the `data-screen-label` attribute and the inline `paddingRight: 380` style applied when the widget library rail is open.

## Prototype JSX (verbatim)

```jsx
  return (
    <div className="dash-body" data-screen-label="01 Populated Dashboard"
         style={libOpen ? {paddingRight: 380} : {}}>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-body {
    flex: 1; overflow-y: auto;
    padding: 6px 24px 40px;
    position: relative;
  }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — every CSS property in the `.dash-body` rule above has a matching rule in `src/styles/dashboard.css` with identical values (`flex: 1`, `overflow-y: auto`, `padding: 6px 24px 40px`, `position: relative`).
- Structure — v2 `DashboardView.tsx` root element is a `<div>` with `className="dash-body"`, carries the same `data-screen-label` attribute, and conditionally applies `paddingRight: 380` when `libOpen` is truthy (empty object otherwise).
- Content — literal `data-screen-label="01 Populated Dashboard"` string matches exactly; inline style value `paddingRight: 380` (pixels, numeric literal) is preserved.

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
