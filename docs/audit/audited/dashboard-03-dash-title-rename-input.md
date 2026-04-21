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
status: audited
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

**Issue: `.dash-title input` CSS rule is present but unused**
- Severity: MINOR
- Location: `src/styles/dashboard.css:20-24`
- Expected: CSS selector `.dash-title input` applies when the title is in edit mode.
- Actual: The CSS rule is ported verbatim (font/letter-spacing inherit, transparent background, no border/outline, width 100%) but there is no `<input>` descendant of `.dash-title` in v2 — the rule is dead code because the input is never rendered.
- Note: Purely a CSS fidelity observation; becomes live once the Structure gap below is resolved.

### Structure

**Issue: `editingTitle === true` branch is entirely missing**
- Severity: CRITICAL
- Location: `src/pages/DashboardView.tsx:134-137`
- Expected: A ternary on `editingTitle` that, when true, renders `<input className="dash-title" autoFocus defaultValue={dash.name} onBlur={…onRename + setEditingTitle(false)} onKeyDown={Enter→blur, Escape→setEditingTitle(false)} />`.
- Actual: v2 renders only a static `<div className="dash-title">{activeDashboard.name}</div>`. There is no `editingTitle` state in `useFrameStore`, no `onRename` handler, no `<input>` element, no autoFocus, no blur-to-commit, and no Enter/Escape keyboard handlers. The rename UX does not exist.
- Also missing: the trigger that would toggle `editingTitle` to true (likely an `onClick` / `onDoubleClick` on the display-branch div — covered by dashboard-02, which this chunk depends on).

### Content

**Issue: Inline `{fontSize:22, fontWeight:600}` style object absent**
- Severity: CRITICAL (derivative of the Structure gap)
- Location: `src/pages/DashboardView.tsx:135` (would be on the missing `<input>`)
- Expected: The input carries the numeric inline style `{fontSize:22, fontWeight:600}` exactly (numbers, not strings).
- Actual: Because no `<input>` is rendered, the inline style is absent. Note that `.dash-title` CSS already provides `font-size: 22px; font-weight: 600;`, so the inline style is technically redundant visually, but the prototype specifies it verbatim on the input element and it must be reproduced for fidelity.

**Issue: Key-name string comparisons `"Enter"` / `"Escape"` absent**
- Severity: CRITICAL (derivative of the Structure gap)
- Location: `src/pages/DashboardView.tsx` (would be inside the missing `onKeyDown`)
- Expected: `onKeyDown` handler with case-sensitive comparisons `e.key === "Enter"` (triggers `e.target.blur()`) and `e.key === "Escape"` (triggers `setEditingTitle(false)`).
- Actual: No `onKeyDown` handler exists; neither key comparison is present in the file.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
