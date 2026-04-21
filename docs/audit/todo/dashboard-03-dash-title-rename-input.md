---
id: dashboard-03
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "468-478"
prototype_css:
  file: OmniDash.html
  lines: "272-284"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-02
blocked_reason: null
---

# dashboard-03 — `.dash-title` editable rename `<input>` branch

Covers the `editingTitle === true` branch of the title render: the `<input className="dash-title">` element with autoFocus, defaultValue from `dash.name`, blur-to-commit and Enter/Escape keyboard handlers, and inline `fontSize:22, fontWeight:600` style.

## Prototype JSX (verbatim)

```jsx
          {editingTitle ? (
            <input
              className="dash-title" autoFocus
              defaultValue={dash.name}
              onBlur={(e) => { onRename(e.target.value); setEditingTitle(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              style={{fontSize:22, fontWeight:600}}
            />
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
  .dash-title input {
    font: inherit; letter-spacing: inherit;
    background: transparent; border: none; outline: none; color: inherit;
    width: 100%;
  }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.dash-title` rule matches all properties (font-size 22px, font-weight 600, letter-spacing -0.015em, padding 2px 8px, border-radius 6px, margin-left -8px, transition). `.dash-title:hover` sets `background: var(--panel-2)`. `.dash-title input` rule matches (font inherit, letter-spacing inherit, transparent background, no border/outline, width 100%).
- Structure — when `editingTitle` is true v2 renders an `<input>` with `className="dash-title"`, `autoFocus`, `defaultValue={dash.name}`, `onBlur` handler that calls `onRename` with `e.target.value` then clears editing state, and an `onKeyDown` handler with the two branches (Enter → blur, Escape → clear editing state).
- Content — inline style object is exactly `{fontSize:22, fontWeight:600}` (numeric, not string). Key matches are case-sensitive: `"Enter"` and `"Escape"`.

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
