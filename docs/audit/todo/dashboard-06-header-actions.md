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
status: todo
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

(fill in)

### Structure

(fill in)

### Content

(fill in)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
