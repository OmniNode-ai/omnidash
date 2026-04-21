---
id: dashboard-05
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "485-492"
prototype_css:
  file: OmniDash.html
  lines: "85,285-289"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-02
blocked_reason: null
---

# dashboard-05 — `.dash-meta` mono-styled meta row

Covers the `.dash-meta` row directly beneath the title: widget count, timezone, auto-refresh interval, interleaved with `·` separators. Uses `.mono` for numeric values and a `--status-ok` color for the refresh interval.

## Prototype JSX (verbatim)

```jsx
          <div className="dash-meta">
            <span className="mono">{dash.widgets.length} widgets</span>
            <span>·</span>
            <span>Timezone: <span className="mono">UTC−07:00</span></span>
            <span>·</span>
            <span>Auto-refresh <span className="mono" style={{color:"var(--status-ok)"}}>30s</span></span>
          </div>
        </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .mono { font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace; font-feature-settings: "tnum", "ss01"; }
  .dash-meta {
    display: flex; align-items: center; gap: 14px;
    font-size: 12px; color: var(--ink-3);
  }
  .dash-meta .mono { color: var(--ink-2); }
```

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.dash-meta` has `display: flex`, `align-items: center`, `gap: 14px`, `font-size: 12px`, `color: var(--ink-3)`. The descendant `.dash-meta .mono` rule overrides color to `var(--ink-2)`. `.mono` declares the IBM Plex Mono stack with `font-feature-settings: "tnum", "ss01"`.
- Structure — v2 renders `<div className="dash-meta">` with exactly these children in order: `<span className="mono">` widget count, bullet `<span>`, timezone `<span>` (with nested `<span className="mono">`), bullet `<span>`, auto-refresh `<span>` (with nested `<span className="mono" style={{color:"var(--status-ok)"}}>`). The enclosing `.dash-title-wrap` `</div>` closes after this row.
- Content — literal strings are exact: `" widgets"` (leading space from JSX text node after `{dash.widgets.length}`), `"·"` (middle dot U+00B7, not hyphen), `"Timezone: "`, `"UTC−07:00"` (minus-sign U+2212, not ASCII `-`), `"Auto-refresh "`, `"30s"`.

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
