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
status: blocked
dependencies:
  - dashboard-07
blocked_reason: "Deferred to OMN-44 (drag-and-drop + kebab menu wiring). See DashboardView.tsx:8 and ComponentWrapper.tsx:9 for scope note."
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

- No issues found. `src/styles/dashboard.css` lines 132–148 port the `.drop-slot` base rule and `.drop-slot.active` override byte-for-byte from the prototype, with only the documented `--accent*` → `--brand*` token rename applied to `border-color`, `background`, and `color` in the `.active` modifier. Base rule: border `1.5px dashed var(--line)`, `border-radius: var(--radius-lg)`, `min-height: 80px`, `display: grid; place-items: center`, `color: var(--ink-3)`, `font-size: 12px`, `font-family: "IBM Plex Mono", monospace`, transition tuple matches. Active override raises `min-height` to `120px` as specified.

### Structure

**Issue: trailing `.drop-slot` element is entirely absent from v2 (CRITICAL).**
- Severity: critical
- Prototype: `src/app.jsx:522-534` renders `{dragging && <div className={`drop-slot ${dragOverSlot === dash.widgets.length ? "active" : ""}`} onDragOver={…} onDrop={…}>drop to append</div>}` inside `.grid`, followed by the `.grid` closing `</div>`, the fragment `</>`, and the `.dash-body` closing `</div>`.
- v2: `src/pages/DashboardView.tsx:184-211` closes the `.grid` immediately after the `activeDashboard.layout.map(...)`, with no trailing append drop-slot and no `dragging`/`dragOverSlot`/`handleSlotDragOver`/`onDropAt` state or handlers anywhere in the file. A grep of `DashboardView.tsx` for `dragging|dragOverSlot|drop-slot|onDropAt|handleSlotDragOver` returns zero matches. The prototype's append affordance (drop at index === `dash.widgets.length`) is unreachable in v2.
- Fix intent: introduce drag state parallel to `dashboard-07`/`dashboard-08` (tracked as a dependency in this chunk's frontmatter) and, once `dragging` is wired, render the trailing `.drop-slot` exactly as in the prototype JSX above, passing `dash.widgets.length` (v2 equivalent: `activeDashboard.layout.length`) as the index to both `handleSlotDragOver` and `onDropAt`. Closing-tag structure in v2 already uses `<>…</>` around the grid + palette siblings, so the fragment + `.dash-body` close shape is compatible.

**Issue: `.grid`-trailing closing-tag layout diverges from prototype (MINOR).**
- Severity: minor
- Prototype closes with `</div>` (grid) → `</>` (fragment wrapping dragging branch) → `</div>` (dash-body). v2 `DashboardView.tsx:211-213` closes `</div>` (grid) → `</div>` (dash-body) with no inner fragment because no conditional append slot exists. This is a downstream symptom of the missing `.drop-slot`; once that is added inside a conditional, the fragment structure will naturally align.

### Content

**Issue: literal body text "drop to append" is not present anywhere in v2 (CRITICAL, same root cause as Structure).**
- Severity: critical (symptom of the missing element)
- A grep of the v2 source tree would find no `"drop to append"` string in `DashboardView.tsx`. The chunk's content check cannot pass until the trailing drop-slot is added with the exact lowercase body text `drop to append` (no trailing period, no capitalization).
- The append index contract — pass `activeDashboard.layout.length` (NOT `length - 1`) into both `handleSlotDragOver` and `onDropAt` — must be honored when the element is added.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
