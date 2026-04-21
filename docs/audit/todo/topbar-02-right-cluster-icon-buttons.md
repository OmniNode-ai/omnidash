---
id: topbar-02
component: Topbar
prototype_jsx:
  file: src/app.jsx
  lines: "432-438"
prototype_css:
  file: OmniDash.html
  lines: "233-246"
v2_targets:
  - src/components/frame/Header.tsx
  - src/styles/topbar.css
status: todo
dependencies: []
blocked_reason: null
---

# topbar-02 — `.topbar-right` wrapper and `.icon-btn` group

Covers the right-side cluster opening `<div className="topbar-right">` and the three `.icon-btn` buttons (Refresh, Help, Notifications) including the Notifications button's inner `.badge` dot.

## Prototype JSX (verbatim)

```jsx
      <div className="topbar-right">
        <button className="icon-btn" title="Refresh"><Icon name="refresh" size={16}/></button>
        <button className="icon-btn" title="Help"><Icon name="help" size={16}/></button>
        <button className="icon-btn" title="Notifications">
          <Icon name="bell" size={16}/>
          <span className="badge"/>
        </button>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .topbar-right { display: flex; align-items: center; gap: 6px; }
  .icon-btn {
    width: 34px; height: 34px; border-radius: 6px;
    display: grid; place-items: center;
    color: var(--ink-2);
    position: relative;
    transition: background 0.15s, color 0.15s;
  }
  .icon-btn:hover { background: var(--panel-2); color: var(--ink); }
  .icon-btn .badge {
    position: absolute; top: 6px; right: 7px;
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--status-bad); box-shadow: 0 0 0 2px var(--panel);
  }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/topbar.css` with identical values (including `:hover` state and the `.icon-btn .badge` positioning).
- ☐ **Structure** — v2 `Header.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names and attributes (`title` on each `<button>`; `name`/`size` on each `<Icon>`; self-closing `<span className="badge"/>` nested inside the Notifications button).
- ☐ **Content** — static attributes match exactly: button titles (`Refresh`, `Help`, `Notifications`), Icon names (`refresh`, `help`, `bell`), Icon `size={16}` on all three.

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
