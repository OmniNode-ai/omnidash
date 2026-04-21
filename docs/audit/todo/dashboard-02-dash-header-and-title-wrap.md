---
id: dashboard-02
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "466-468"
prototype_css:
  file: OmniDash.html
  lines: "266-271"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-01
blocked_reason: null
---

# dashboard-02 — `.dash-header` and `.dash-title-wrap` wrappers

Covers the `.dash-header` row and its first child `.dash-title-wrap` wrapper element that groups the title and meta row on the left side of the header.

## Prototype JSX (verbatim)

```jsx
      <div className="dash-header">
        <div className="dash-title-wrap">
          {editingTitle ? (
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-header {
    padding: 20px 24px 14px;
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px;
  }
  .dash-title-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.dash-header` has `padding: 20px 24px 14px`, `display: flex`, `align-items: flex-start`, `justify-content: space-between`, `gap: 16px`. `.dash-title-wrap` has `display: flex`, `flex-direction: column`, `gap: 4px`, `min-width: 0`.
- Structure — v2 `DashboardView.tsx` renders `<div className="dash-header">` as first child of `.dash-body`, and `<div className="dash-title-wrap">` as its first child, followed (later chunks) by `<div className="header-actions">` as the second child of `.dash-header`.
- Content — no static text content in this chunk; only the conditional on `editingTitle` ternary opens here (both branches are covered in dashboard-03 and dashboard-04).

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
