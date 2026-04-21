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
status: audited
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

- No issues found. `.drop-slot` and `.drop-slot.active` rules in `src/styles/dashboard.css:133-148` match the prototype (border 1.5px dashed var(--line), radius var(--radius-lg), min-height 80px, grid place-items center, var(--ink-3), 12px, IBM Plex Mono, transitions on border-color/background/min-height). Active state sets border-color/background/color using the `--brand*` tokens (intentional OMN-42 rename, documented in the chunk preamble and in `src/styles/dashboard.css:2-3`) and min-height 120px.

### Structure

**Issue: `DropIndicator` component not implemented in v2.**
- Axis: Structure
- Severity: CRITICAL (blocking for dashboard-07/dashboard-08 drop-preview render sites, but see dependency note — dashboard-10 depends on dashboard-09, which is almost certainly also unimplemented since full drag-and-drop is deferred per `src/pages/DashboardView.tsx:8` ("Drag-and-drop deferred to OMN-44")).
- Evidence: grep for `DropIndicator` across `/mnt/c/Code/omninode_ai/omnidash-v2/src` returns zero matches. `src/pages/DashboardView.tsx` contains no `<div className="drop-slot active">` render, no `gridColumn: "1 / -1"` span, and no "drop here" text. The only references to `drop-slot` in v2 are the CSS rules themselves (`src/styles/dashboard.css:133`, `:143`).
- Expected: a `DropIndicator` function component returning `<div className="drop-slot active" style={{gridColumn: "1 / -1", minHeight: 60}}>▼ drop here</div>`, no props, used as an inline preview inside `.grid` at the two render sites governed by dashboard-07/dashboard-08.
- Recommendation: defer implementation until dashboard-09 / OMN-44 full drag-and-drop work lands; verify the header comment in `DashboardView.tsx` is updated when drag preview is wired in.

### Content

**Issue: literal "▼ drop here" string and inline style object are absent.**
- Axis: Content
- Severity: CRITICAL (same root cause as the Structure finding — the component is not rendered anywhere, so the U+25BC triangle + space + lowercase `drop here` text and the `gridColumn`/`minHeight` inline style keys are not present in v2).
- Evidence: grep for `drop here` across `src/` returns zero matches.
- Recommendation: rolled up with the Structure fix.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
