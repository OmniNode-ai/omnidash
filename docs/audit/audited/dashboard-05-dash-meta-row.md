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
status: audited
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

- No issues found. `dashboard.css:25-29` ports the `.dash-meta` rule verbatim (`display:flex; align-items:center; gap:14px; font-size:12px; color:var(--ink-3);`) and retains the `.dash-meta .mono { color: var(--ink-2); }` descendant override. The global `.mono` rule (IBM Plex Mono + `font-feature-settings: "tnum", "ss01"`) lives in `globals.css` and is not owned by this chunk.

**Issue:** `.mono` rule not verified in this repo's dashboard.css.
- Severity: MINOR
- Axis: Design
- Where (prototype): `OmniDash.html:85`
- Where (v2): not present in `src/styles/dashboard.css`
- Symptom: The `.mono` typography rule is assumed to exist elsewhere (likely `globals.css`); if it is absent, the mono values in the meta row will not render in IBM Plex Mono with tabular/ss01 features. Not verifiable from the two files named in `v2_targets`.
- Suggested remedy: Confirm `.mono` is defined in `src/styles/globals.css` (or equivalent) with the prototype font stack and `font-feature-settings`. Out of scope for this chunk if already present.

### Structure

**Issue:** `.dash-meta` children do not match the prototype.
- Severity: CRITICAL
- Axis: Structure
- Where (prototype): `src/app.jsx:485-491`
- Where (v2): `src/pages/DashboardView.tsx:138-140`
- Symptom: v2 renders a single `<span>` containing only `{layout.length} widget(s)`. The prototype requires five child spans in order: mono widget count, `·` separator, `Timezone: <mono>UTC−07:00</mono>`, `·` separator, `Auto-refresh <mono style="color:var(--status-ok)">30s</mono>`. The `.mono` class is also missing from the widget-count span, so the numeric value no longer picks up the `.dash-meta .mono` color override or the tabular-numeric monospace styling.
- Suggested remedy: Replace the current single-span body with the exact five-span structure from the prototype, wrapping numeric values in `<span className="mono">` and applying `style={{color:"var(--status-ok)"}}` to the `30s` mono span.

### Content

**Issue:** Timezone, separator, and auto-refresh strings absent.
- Severity: CRITICAL
- Axis: Content
- Where (prototype): `src/app.jsx:487-490`
- Where (v2): `src/pages/DashboardView.tsx:139`
- Symptom: The literal strings `·` (U+00B7), `Timezone: `, `UTC−07:00` (with U+2212 minus sign), `Auto-refresh `, and `30s` do not appear anywhere in `DashboardView.tsx`. v2 also pluralizes dynamically (`widget` / `widgets`), whereas the prototype always renders `" widgets"` regardless of count.
- Suggested remedy: Hardcode the prototype strings verbatim, including the U+00B7 middle dots and U+2212 minus sign in the timezone value, and drop the singular/plural branching so the copy matches the prototype exactly.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
