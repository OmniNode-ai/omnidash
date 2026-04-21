---
id: widget-card-04
component: WidgetCard
prototype_jsx:
  file: src/app.jsx
  lines: "606-613"
prototype_css:
  file: OmniDash.html
  lines: "383-390"
v2_targets:
  - src/components/dashboard/ComponentWrapper.tsx
  - src/styles/dashboard.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-card-04 — `.widget-kebab` options button and `.widget-body` container

Covers the right-side kebab-menu button in the header (`<button className="widget-kebab">` with the `kebab` icon at size 16 and the `data-menu-trigger` attribute), the closing of `.widget-head`, and the `<div className="widget-body">` that wraps the catalog-rendered widget content (or an "Unknown widget" fallback).

## Prototype JSX (verbatim)

```jsx
        <button className="widget-kebab" data-menu-trigger onClick={onMenu}>
          <Icon name="kebab" size={16}/>
        </button>
      </div>
      <div className="widget-body">
        {cat ? cat.render({ tick, widget: w }) : <div style={{color:"var(--ink-3)"}}>Unknown widget</div>}
      </div>
    </div>
  );
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .widget-kebab {
    width: 26px; height: 26px; border-radius: 5px;
    display: grid; place-items: center; color: var(--ink-3);
    transition: background 0.15s, color 0.15s;
  }
  .widget-kebab:hover { background: var(--panel-2); color: var(--ink); }

  .widget-body { padding: 14px var(--pad-x) var(--pad-x); }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/dashboard.css` with identical values: kebab button is 26×26 with 5px radius, grid-centered, `--ink-3` default color transitioning to `--ink` on hover with `--panel-2` background; the transition covers both `background` and `color` at 0.15s. Body uses 14px top padding and `--pad-x` for the other three sides.
- ☐ **Structure** — v2 `ComponentWrapper.tsx` has a `<button className="widget-kebab">` as the last child of `.widget-head` (sibling of `.widget-head-left`), with `data-menu-trigger` attribute and `onClick` bound to the options/menu handler. After `.widget-head` closes, a `<div className="widget-body">` follows as the second child of `.widget`. Body renders the child content (in v2, the dynamically loaded component), with a fallback node when the component/catalog entry is missing.
- ☐ **Content** — the kebab icon is `Icon name="kebab" size={16}`; the `data-menu-trigger` attribute is present (used by outside-click detection) and has no value. The fallback node in `.widget-body` uses inline style `color: var(--ink-3)` and the literal text "Unknown widget" — v2 may substitute its own fallback copy but should use the same token for color.

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
