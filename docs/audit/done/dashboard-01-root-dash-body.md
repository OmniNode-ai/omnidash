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
status: done
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

- No issues found. `src/styles/dashboard.css:34-38` contains the `.dash-body` rule with `flex: 1; overflow-y: auto; padding: 6px 24px 40px; position: relative;` — identical values to the prototype.

**Issue [CRITICAL]** — Missing `paddingRight: 380` override when widget library rail is open
The prototype applies `style={libOpen ? {paddingRight: 380} : {}}` directly to the `.dash-body` container so the grid inset clears the 380px right-rail. In `src/pages/DashboardView.tsx` there is no `libOpen` state, no widget-library rail component, and no conditional `paddingRight` applied to the `.dash-body` element. This is a missing visual behavior, not a stylistic re-expression, so it is not covered by the Tailwind-equivalence exception.

### Structure

**Issue [CRITICAL]** — Root element is a React fragment, not `<div className="dash-body">`
The prototype wraps the entire dashboard (header + body) in a single `<div className="dash-body" data-screen-label="01 Populated Dashboard" style={...}>`. In `src/pages/DashboardView.tsx:130-228` the component returns a `<>` fragment containing a sibling `.dash-header` (line 133) and a flex wrapper `<div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>` (line 174). A `<div className="dash-body">` does exist at line 176, but it is nested one level deep and only wraps the grid — it does not wrap the header, so the container semantics and the outer `flex: 1; overflow-y: auto;` scroll region differ from the prototype.

**Issue [CRITICAL]** — `data-screen-label` attribute missing
The prototype carries `data-screen-label="01 Populated Dashboard"` on the root `.dash-body`. No `data-screen-label` attribute is present anywhere in `src/pages/DashboardView.tsx`.

**Issue [CRITICAL]** — No `libOpen`-driven conditional inline style
Prototype applies `style={libOpen ? {paddingRight: 380} : {}}` on the root. V2 has neither a `libOpen` reference nor a conditional `paddingRight` style. The only inline styles on the inner `.dash-body` (line 117, empty-state branch only) are unrelated flex-centering rules.

### Content

**Issue [CRITICAL]** — Literal `data-screen-label="01 Populated Dashboard"` string absent
The exact string `"01 Populated Dashboard"` does not appear in `src/pages/DashboardView.tsx`; therefore the screen-label content cannot match.

**Issue [CRITICAL]** — Numeric `paddingRight: 380` literal not preserved
The inline `{paddingRight: 380}` (numeric pixel literal, as the prototype writes it) is not present in v2. No alternative expression (e.g. `paddingRight: '380px'`) appears either.

## Resolution

Partially accepted v2 deviation, partially OMN-44 deferred. Structural fragment vs. `.dash-body` wrapper is a v2 layout choice (prototype wraps everything; v2 wraps only the body content for flex-min-height behavior). `data-screen-label` is a prototype-only debug attribute — not needed in v2. `libOpen` state + `paddingRight:380` are OMN-44 scope (library panel manages its own flex space in v2 instead of overlay-with-padding).
