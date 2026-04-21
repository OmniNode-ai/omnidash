---
id: topbar-01
component: Topbar
prototype_jsx:
  file: src/app.jsx
  lines: "425-431"
prototype_css:
  file: OmniDash.html
  lines: "222-231"
v2_targets:
  - src/components/frame/Header.tsx
  - src/styles/topbar.css
status: todo
dependencies: []
blocked_reason: null
---

# topbar-01 — Topbar root and `.breadcrumbs` cluster

Covers the outer `<div className="topbar">` wrapper and the left-hand `<div className="breadcrumbs">` cluster containing the menu icon, `Home`, separator, and current-page label.

## Prototype JSX (verbatim)

```jsx
    <div className="topbar">
      <div className="breadcrumbs">
        <Icon name="menu" size={16}/>
        <span>Home</span>
        <span className="sep">/</span>
        <span className="cur">Dashboards</span>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .topbar {
    height: 52px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  .breadcrumbs { display: flex; align-items: center; gap: 8px; color: var(--ink-2); font-size: 13px; }
  .breadcrumbs .sep { color: var(--ink-3); }
  .breadcrumbs .cur { color: var(--ink); font-weight: 500; }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/topbar.css` with identical values.
- ☐ **Structure** — v2 `Header.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names and attributes (`name`, `size` on `<Icon>`; class names on spans).
- ☐ **Content** — static text/attributes match exactly: menu Icon `name="menu"` and `size={16}`, `Home` text, separator `/` text, current-page label `Dashboards`.

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
