---
id: sidebar-05
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "377-382"
prototype_css:
  file: OmniDash.html
  lines: "160-196"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-05 — `.dash-list` container, `.dash-item` wrapper, and `.dash-marker`

Covers the `<div className="dash-list">` open, the `dashboards.map` loop, the `.dash-item` row wrapper with its conditional `active` class and `onClick`, and the `<span className="dash-marker">` which shows either `▸` (active) or a zero-padded index.

## Prototype JSX (verbatim)

```jsx
      <div className="dash-list">
        {dashboards.map((d, i) => (
          <div key={d.id}
               className={`dash-item ${d.id === activeId ? "active" : ""}`}
               onClick={() => onSelect(d.id)}>
            <span className="dash-marker">{d.id === activeId ? "▸" : String(i+1).padStart(2,"0")}</span>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-list {
    padding: 0 8px;
    flex: 1;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 1px;
  }
  .dash-item {
    display: grid;
    grid-template-columns: 14px 1fr 20px;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    color: var(--sidebar-ink-2);
    font-size: 13px;
    cursor: pointer;
    position: relative;
    border-radius: 0;
    transition: color 0.12s, background 0.12s;
  }
  .dash-item:hover { color: var(--sidebar-ink); background: oklch(22% 0.01 260); }
  .dash-item.active {
    color: var(--sidebar-ink);
    background: transparent;
    font-weight: 500;
  }
  .dash-item .dash-marker {
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    color: var(--sidebar-ink-2);
    opacity: 0.45;
    text-align: center;
    line-height: 1;
  }
  .dash-item.active .dash-marker {
    color: var(--accent);
    opacity: 1;
  }
```

Note: prototype uses `var(--accent)` in places; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values (including `:hover`, `.active`, and the nested `.dash-item .dash-marker` and `.dash-item.active .dash-marker` selectors).
- ☐ **Structure** — v2 `Sidebar.tsx` maps `dashboards` via a loop, uses `key={d.id}`, applies the template literal `` `dash-item ${d.id === activeId ? "active" : ""}` ``, wires `onClick={() => onSelect(d.id)}`, and renders a `<span className="dash-marker">` as the first child.
- ☐ **Content** — marker content is `▸` when `d.id === activeId`, otherwise `String(i+1).padStart(2,"0")` (e.g. `01`, `02`, …).

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
