---
id: dashboard-10
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "538-544"
prototype_css:
  file: OmniDash.html
  lines: "419-434"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-09
blocked_reason: null
---

# dashboard-10 — `DropIndicator` component (full-row drop preview)

Covers the stand-alone `DropIndicator` render used as an inline preview inside `.grid` when the drag hovers a slot. It reuses the `.drop-slot.active` styling plus inline overrides to span all grid columns and reduce the min-height.

## Prototype JSX (verbatim)

```jsx
function DropIndicator() {
  return (
    <div className="drop-slot active" style={{gridColumn:"1 / -1", minHeight:60}}>
      ▼ drop here
    </div>
  );
}
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .drop-slot {
    border: 1.5px dashed var(--line);
    border-radius: var(--radius-lg);
    min-height: 80px;
    display: grid; place-items: center;
    color: var(--ink-3);
    font-size: 12px;
    font-family: "IBM Plex Mono", monospace;
    transition: border-color 0.15s, background 0.15s, min-height 0.2s;
  }
  .drop-slot.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-ink);
    min-height: 120px;
  }
```

Note: prototype uses `var(--accent)`, `var(--accent-soft)`, `var(--accent-ink)` in the `.drop-slot.active` rule; v2 renamed the accent token family to `--brand`/`--brand-soft`/`--brand-ink` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.drop-slot` and `.drop-slot.active` rules match (same rules as dashboard-09). Inline style object overrides: `gridColumn: "1 / -1"` (string, spans all columns) and `minHeight: 60` (numeric, overrides the `.drop-slot.active` 120px default for this inline usage).
- Structure — v2 defines a `DropIndicator` function component (or equivalent) that returns a single `<div className="drop-slot active">` with the inline style object; the component takes no props. It is imported/used in `DashboardView.tsx` matching the prototype's two render sites (between-widgets and trailing — covered in dashboard-07 and dashboard-08).
- Content — literal body is exactly `"▼ drop here"` with the black down-pointing triangle U+25BC followed by a single space and lowercase `"drop here"` (no period). Inline style keys are `gridColumn` (camelCase, string value) and `minHeight` (numeric).

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
