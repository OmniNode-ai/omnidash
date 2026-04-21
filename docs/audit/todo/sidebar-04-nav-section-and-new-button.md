---
id: sidebar-04
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "371-376"
prototype_css:
  file: OmniDash.html
  lines: "142-158"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-04 — Dashboards section header and `.nav-new` button

Covers the `<div className="nav-section">` wrapper, the `<span className="nav-section-title">Dashboards</span>` label, and the `<button className="nav-new">` with its `title`, `onClick`, and plus `<Icon>`.

## Prototype JSX (verbatim)

```jsx
      <div className="nav-section">
        <span className="nav-section-title">Dashboards</span>
        <button className="nav-new" onClick={onCreate} title="New dashboard">
          <Icon name="plus" size={14} stroke={2.4}/>
        </button>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .nav-section {
    padding: 14px 10px 8px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .nav-section-title {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em;
    color: var(--sidebar-ink-2); font-weight: 600; padding: 0 6px;
  }
  .nav-new {
    width: 22px; height: 22px; border-radius: 50%;
    display: grid; place-items: center;
    background: var(--sidebar-ink);
    color: var(--sidebar);
    transition: background 0.15s, transform 0.1s;
  }
  .nav-new:hover { background: var(--accent); color: oklch(15% 0.05 var(--accent-h)); transform: scale(1.08); }
  .nav-new:active { transform: scale(0.96); }
```

Note: prototype uses `var(--accent)` in places; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values (including `:hover` and `:active` states on `.nav-new`).
- ☐ **Structure** — v2 `Sidebar.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names, the button's `onClick={onCreate}` handler, and the plus `<Icon>` with `size={14}` and `stroke={2.4}`.
- ☐ **Content** — static attributes match exactly: title reads `Dashboards`, button `title="New dashboard"`, `<Icon name="plus" size={14} stroke={2.4}/>`.

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
