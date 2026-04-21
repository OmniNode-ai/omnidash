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
status: audited
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

- No issues found.

All prototype rules for `.dash-list`, `.dash-item` (including `:hover` and `.active`), `.dash-item .dash-marker`, and `.dash-item.active .dash-marker` are present at `src/styles/sidebar.css:70-106` with identical values. The `var(--accent)` → `var(--brand)` substitution at line 104 is the documented OMN-42 rename (called out in the file header at lines 2-3), not a finding.

### Structure

- No issues found.

`src/components/frame/Sidebar.tsx:138-200` wraps the list in `<div className="dash-list">`, maps `dashboards` with `key={d.id}`, applies an equivalent conditional `active` class via `` `dash-item${isActive ? ' active' : ''}` `` (line 145), wires `onClick={() => setActiveDashboardById(d.id)}` (line 146), and renders `<span className="dash-marker">` as the first child at lines 149-151. The template-literal form (no leading space before `active`) produces an identical rendered class string and is not a deviation. A `data-testid` attribute (line 144) is additive and does not affect fidelity.

### Content

- No issues found.

Marker content at `src/components/frame/Sidebar.tsx:150` is `isActive ? '▸' : String(i + 1).padStart(2, '0')`, matching the prototype character-for-character (U+25B8 BLACK RIGHT-POINTING SMALL TRIANGLE and zero-padded 2-digit index).

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
