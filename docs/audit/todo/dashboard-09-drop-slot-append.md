---
id: dashboard-09
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "522-534"
prototype_css:
  file: OmniDash.html
  lines: "419-434"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: todo
dependencies:
  - dashboard-07
blocked_reason: null
---

# dashboard-09 — trailing `.drop-slot` "drop to append" + fragment/body close

Covers the trailing "drop to append" drop slot rendered at the end of `.grid` when a drag is in progress, plus the fragment and `.dash-body` closing tags. The drop slot's `active` modifier toggles when `dragOverSlot === dash.widgets.length`.

## Prototype JSX (verbatim)

```jsx
            {dragging && (
              <div
                className={`drop-slot ${dragOverSlot === dash.widgets.length ? "active" : ""}`}
                onDragOver={(e) => handleSlotDragOver(e, dash.widgets.length)}
                onDrop={(e) => { e.preventDefault(); onDropAt(dash.widgets.length); }}
              >
                drop to append
              </div>
            )}
          </div>
        </>
      )}
    </div>
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

- Design — `.drop-slot` base rule (border 1.5px dashed, radius var, min-height 80px, grid place-items center, color ink-3, font-size 12px, IBM Plex Mono, transition) and `.drop-slot.active` override (border-color, background, color, min-height 120px) match v2 `src/styles/dashboard.css` exactly (modulo the accent→brand token rename).
- Structure — v2 renders the trailing `<div className="drop-slot …">` only when `dragging` is truthy. Template literal appends `" active"` when `dragOverSlot === dash.widgets.length`. `onDragOver` wires to `handleSlotDragOver(e, dash.widgets.length)`; `onDrop` calls `e.preventDefault()` then `onDropAt(dash.widgets.length)`. Closing tags reach back through `</div>` (grid), `</>` (fragment), `</div>` (dash-body).
- Content — literal body text is exactly `"drop to append"` (lowercase, no trailing period). The append index passed to handlers is `dash.widgets.length` (not `dash.widgets.length - 1`).

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
