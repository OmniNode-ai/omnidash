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
status: done
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

- No issues found.

All `.topbar-right`, `.icon-btn`, `:hover`, and `.icon-btn .badge` rules in `src/styles/topbar.css:19-32` match the prototype values exactly (width/height 34px, border-radius 6px, display grid, place-items center, color var(--ink-2), position relative, transitions; hover background var(--panel-2), color var(--ink); badge position absolute top 6px right 7px, 7x7, border-radius 50%, background var(--status-bad), box-shadow 0 0 0 2px var(--panel)).

### Structure

**Issue [MINOR]**: Icon component source differs from prototype (`lucide-react` vs custom `<Icon>`)
- Prototype: `src/app.jsx:433-437` uses `<Icon name="refresh|help|bell" size={16}/>`
- v2: `src/components/frame/Header.tsx:12,35,38,41` imports `RefreshCw`, `HelpCircle`, `Bell` from `lucide-react`
- Impact: Visual icon glyph fidelity depends on lucide-react glyphs matching the prototype's custom `<Icon>` set; structurally correct (buttons, nesting, badge span placement are all preserved) but the rendered SVG path is not guaranteed to match pixel-for-pixel.

**Issue [NIT]**: Extra `aria-label` attribute added to each icon button
- Prototype: `src/app.jsx:433-437` — buttons only carry `title` and `className`
- v2: `src/components/frame/Header.tsx:34,37,40` — each button has both `title` and `aria-label`
- Impact: None visually; accessibility-only enhancement. Does not violate structural fidelity but is a non-prototype addition.

### Content

**Issue [MINOR]**: Icon `name` identifiers not preserved (lucide component names instead)
- Prototype: `src/app.jsx:433-437` Icon `name` values are `"refresh"`, `"help"`, `"bell"`
- v2: `src/components/frame/Header.tsx:35,38,41` uses `RefreshCw`, `HelpCircle`, `Bell` components (no `name` prop)
- Impact: Semantically equivalent (refresh → RefreshCw, help → HelpCircle, bell → Bell) but the literal string identifiers from the prototype are gone. Icon `size={16}` and button `title` text (`Refresh`, `Help`, `Notifications`) match exactly.

## Resolution

Accepted v2 pattern — lucide-react icons (`RefreshCw`, `HelpCircle`, `Bell`) substitute for prototype's custom `<Icon>` component; this is the repo-wide convention. `aria-label` additions are a11y improvements.
