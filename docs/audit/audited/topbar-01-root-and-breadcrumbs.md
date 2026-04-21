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
status: audited
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

- No issues found.

All prototype CSS properties for `.topbar`, `.breadcrumbs`, `.breadcrumbs .sep`, and `.breadcrumbs .cur` are present in `src/styles/topbar.css` with identical values (height 52px, flex-shrink 0, flex + space-between, padding 0 20px, border-bottom 1px solid var(--line), background var(--panel); breadcrumbs gap 8px, color var(--ink-2), font-size 13px; sep color var(--ink-3); cur color var(--ink), font-weight 500).

### Structure

**Issue [CRITICAL]**: Missing `<Icon name="menu" size={16}/>` as first child of `.breadcrumbs`.
- Prototype: `src/app.jsx:427` (inside the JSX block quoted above)
- v2: `src/components/frame/Header.tsx:26-30` — the `<nav className="breadcrumbs">` contains only `Home / Dashboards` spans; the hamburger/menu icon that precedes `Home` in the prototype is not rendered.
- Impact: User-visible loss of the left-side menu affordance next to the breadcrumb trail; changes the visual rhythm of the topbar left cluster.

**Issue [MINOR]**: Outer wrapper tag changed from `<div>` to `<header>`.
- Prototype: `src/app.jsx:425` — `<div className="topbar">`
- v2: `src/components/frame/Header.tsx:24` — `<header className="topbar">`
- Impact: Semantic upgrade only; not user-visible. Class name and styles still apply identically. Flag for reviewer awareness.

**Issue [MINOR]**: Inner breadcrumbs wrapper tag changed from `<div>` to `<nav>`.
- Prototype: `src/app.jsx:426` — `<div className="breadcrumbs">`
- v2: `src/components/frame/Header.tsx:26` — `<nav className="breadcrumbs">`
- Impact: Semantic upgrade only; not user-visible. Class name and styles still apply identically.

### Content

**Issue [CRITICAL]**: Menu icon content missing entirely.
- Prototype: `src/app.jsx:427` — `<Icon name="menu" size={16}/>`
- v2: `src/components/frame/Header.tsx:26-30` — no menu icon rendered; no lucide import for a `Menu` equivalent in the breadcrumbs cluster.
- Impact: The `menu` glyph at 16px that the prototype places before "Home" is absent. Users lose a visible menu-icon cue at the start of the breadcrumb cluster.

Static text otherwise matches: `Home`, `/`, `Dashboards` all present with correct class names (`sep`, `cur`).

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
