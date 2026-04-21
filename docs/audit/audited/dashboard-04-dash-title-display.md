---
id: dashboard-04
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "479-484"
prototype_css:
  file: OmniDash.html
  lines: "272-279"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: audited
dependencies:
  - dashboard-02
blocked_reason: null
---

# dashboard-04 — `.dash-title` non-editing display branch with chevron

Covers the `editingTitle === false` branch: a clickable `<div className="dash-title">` that shows the dashboard name followed by a `chevron-down` `<Icon>`. Clicking it toggles `setEditingTitle(true)`.

## Prototype JSX (verbatim)

```jsx
          ) : (
            <div className="dash-title" onClick={() => setEditingTitle(true)} title="Click to rename">
              {dash.name}
              <Icon name="chevron-down" size={18} style={{color:"var(--ink-3)"}}/>
            </div>
          )}
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 22px; font-weight: 600; letter-spacing: -0.015em;
    cursor: pointer; color: var(--ink);
    padding: 2px 8px; border-radius: 6px; margin-left: -8px;
    transition: background 0.15s;
  }
  .dash-title:hover { background: var(--panel-2); }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.dash-title` rule matches verbatim (see dashboard-03 for the shared rule). Confirm the `cursor: pointer` and `:hover` background change are present in v2 `src/styles/dashboard.css`.
- Structure — when `editingTitle` is false v2 renders `<div className="dash-title">` with `onClick` toggling editing state, `title="Click to rename"` tooltip, `{dash.name}` text node, then an `<Icon name="chevron-down" size={18}>` child with inline style `{color: "var(--ink-3)"}`.
- Content — icon `name` is literal `"chevron-down"`, `size` is numeric `18`, inline style color token is `var(--ink-3)`. Tooltip string is exactly `"Click to rename"`.

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. `.dash-title` rule in `src/styles/dashboard.css:12-18` matches prototype verbatim (display: flex, align-items: center, gap: 8px, font-size: 22px, font-weight: 600, letter-spacing: -0.015em, cursor: pointer, color: var(--ink), padding: 2px 8px, border-radius: 6px, margin-left: -8px, transition: background 0.15s). `:hover { background: var(--panel-2); }` present at line 19.

### Structure

**Issue: `.dash-title` display branch is missing the `onClick` handler, `title` tooltip, and chevron `<Icon>` child**

- Location: `src/pages/DashboardView.tsx:135-137`
- Expected (prototype): `<div className="dash-title" onClick={() => setEditingTitle(true)} title="Click to rename">{dash.name}<Icon name="chevron-down" size={18} style={{color:"var(--ink-3)"}}/></div>`
- Actual (v2): `<div className="dash-title">{activeDashboard.name}</div>` — no `onClick`, no `title` attribute, no `<Icon name="chevron-down">` child.
- Impact: CRITICAL. The entire click-to-rename affordance (including chevron indicator and tooltip) is absent. There is also no `editingTitle` state or branching (no ternary), so dashboard-03 (input branch) is implicitly unreachable too.

### Content

**Issue: chevron-down icon literal is absent**

- Location: `src/pages/DashboardView.tsx:135-137`
- Expected: `<Icon name="chevron-down" size={18} style={{color: "var(--ink-3)"}}/>` child with `name="chevron-down"`, numeric `size={18}`, inline style color `var(--ink-3)`.
- Actual: no `<Icon>` element rendered inside `.dash-title`.
- Impact: CRITICAL content miss — icon asset and color token both absent.

**Issue: "Click to rename" tooltip string is absent**

- Location: `src/pages/DashboardView.tsx:135`
- Expected: `title="Click to rename"` attribute on the `.dash-title` div.
- Actual: no `title` attribute set.
- Impact: CRITICAL content miss — accessibility/affordance hint is not rendered.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
