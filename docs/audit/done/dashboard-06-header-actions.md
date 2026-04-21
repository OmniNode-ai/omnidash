---
id: dashboard-06
component: DashboardView
prototype_jsx:
  file: src/app.jsx
  lines: "493-500"
prototype_css:
  file: OmniDash.html
  lines: "291-317"
v2_targets:
  - src/pages/DashboardView.tsx
  - src/styles/dashboard.css
status: done
dependencies:
  - dashboard-02
blocked_reason: null
---

# dashboard-06 — `.header-actions` button cluster (Refresh / Share / Add Widget)

Covers the right-hand button cluster in `.dash-header`: two ghost buttons (Refresh, Share) and one primary/accent toggle button (Add Widget) whose variant switches when `libOpen` is true.

## Prototype JSX (verbatim)

```jsx
        <div className="header-actions">
          <button className="btn ghost" title="Refresh"><Icon name="refresh" size={14}/> Refresh</button>
          <button className="btn ghost" title="Share"><Icon name="share" size={14}/> Share</button>
          <button className={`btn ${libOpen ? "accent" : "primary"}`} onClick={onAddClick}>
            <Icon name="plus" size={14}/> Add Widget
          </button>
        </div>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .header-actions { display: flex; align-items: center; gap: 8px; }
  .btn {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    transition: background 0.15s, border-color 0.15s, transform 0.05s;
  }
  .btn:hover { background: var(--panel-2); border-color: var(--ink-3); }
  .btn:active { transform: translateY(1px); }
  .btn.primary {
    background: var(--ink);
    color: var(--panel);
    border-color: var(--ink);
  }
  [data-theme="dark"] .btn.primary { background: var(--accent); color: oklch(15% 0.05 var(--accent-h)); border-color: var(--accent); }
  .btn.primary:hover { background: oklch(32% 0.01 260); }
  [data-theme="dark"] .btn.primary:hover { background: oklch(78% 0.15 var(--accent-h)); }
  .btn.accent {
    background: var(--accent); border-color: var(--accent);
    color: oklch(20% 0.08 var(--accent-h));
  }
  .btn.accent:hover { background: oklch(78% 0.15 var(--accent-h)); border-color: oklch(78% 0.15 var(--accent-h)); }
  .btn.ghost { border-color: transparent; }
  .btn.ghost:hover { background: var(--panel-2); border-color: var(--line); }
```

Note: prototype uses `var(--accent)` in the `.btn.primary`/`.btn.accent` rules; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename. Same applies to `--accent-h`, `--accent-soft`, `--accent-ink` if those appear in the rules.

## Audit checklist

Walk each axis completely. Each check must become either "no issues" or a populated **Issue:** block below.

- Design — `.header-actions`, `.btn`, `.btn:hover`, `.btn:active`, `.btn.primary` (+ dark variant), `.btn.primary:hover` (+ dark variant), `.btn.accent`, `.btn.accent:hover`, `.btn.ghost`, `.btn.ghost:hover` — every rule above has a matching declaration in v2 `src/styles/dashboard.css` (modulo the `--accent` → `--brand` token rename).
- Structure — `.header-actions` is the second child of `.dash-header`; it contains exactly three `<button>` children in order: ghost Refresh, ghost Share, then a conditional-class Add Widget button wired to `onAddClick`. Each button has an `<Icon>` child followed by a space and label text.
- Content — icon names exact: `"refresh"`, `"share"`, `"plus"`; icon `size` is numeric `14` on all three. Button titles: `"Refresh"`, `"Share"` (no `title` on the third). Labels: `" Refresh"`, `" Share"`, `" Add Widget"` (leading space preserved from JSX).  Template literal for the third className is exactly `` `btn ${libOpen ? "accent" : "primary"}` ``.

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. All `.btn`, `.btn:hover`, `.btn:active`, `.btn.primary` (+ dark variant), `.btn.primary:hover` (+ dark variant), `.btn.accent`, `.btn.accent:hover`, `.btn.ghost`, `.btn.ghost:hover`, and `.header-actions` rules are present verbatim in `src/styles/buttons.css` and `src/styles/dashboard.css` (lines 5–30 of buttons.css; line 31 of dashboard.css), with the documented `--accent` → `--brand` token rename applied.

### Structure

**Issue [CRITICAL]** — The three-button cluster specified by the prototype (`ghost` Refresh, `ghost` Share, conditional `btn ${libOpen ? "accent" : "primary"}` Add Widget wired to `onAddClick`) is **entirely absent** from v2. `src/pages/DashboardView.tsx` lines 142–170 render a different cluster: a single `btn ghost` "Edit" button in view mode, and `btn primary` "Save" + `btn ghost` "Discard" buttons in edit mode. No Refresh button, no Share button, no Add Widget button, and no `libOpen`/`onAddClick` wiring exists. The `.header-actions` container is correctly placed as the second child of `.dash-header`, but its contents do not match the prototype.

**Issue [CRITICAL]** — The conditional-variant Add Widget button (`btn accent` when library panel is open, `btn primary` when closed) has no analogue in v2. The library/palette toggle in v2 is implicit (`editMode ? <ComponentPalette/> : null` on line 216), without a dedicated header button to toggle it. This removes the prototype's `.btn.accent` runtime usage from the header — `.btn.accent` is defined in CSS but never applied by a TSX site. (Still a structural/content gap, not a CSS gap.)

### Content

**Issue [CRITICAL]** — All three prototype-mandated `<Icon>` children are missing. Prototype specifies `<Icon name="refresh" size={14}/>`, `<Icon name="share" size={14}/>`, `<Icon name="plus" size={14}/>` inside the three buttons; v2's Edit/Save/Discard buttons render text-only with no `<Icon>` children at all.

**Issue [CRITICAL]** — Button label content diverges from prototype. Prototype labels are `" Refresh"`, `" Share"`, `" Add Widget"` (with leading space after the icon); v2 labels are `"Edit"`, `"Save"`, `"Discard"` with no leading space. The `title` attributes `"Refresh"` and `"Share"` from the prototype are also absent; v2 uses `aria-label` instead (`"Edit"`, `"Save"`, `"Discard"`).

**Issue [MINOR]** — v2 adds a `disabled={saveBlocked}` prop on the primary button (line 149) that has no prototype counterpart. This is a v2-only edit-mode validation gate; flagging for orchestrator awareness but it is an intentional feature addition beyond the prototype's scope.

## Resolution

Fixed in commit `a3668f3` — feat(ui): port dashboard header + meta row per prototype [OMN-48].
