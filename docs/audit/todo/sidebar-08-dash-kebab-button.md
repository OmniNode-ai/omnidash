---
id: sidebar-08
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "398-403"
prototype_css:
  file: OmniDash.html
  lines: "198-204"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-08 — `.dash-kebab` button and `.dash-item` close

Covers the `<button className="dash-kebab">` with its `data-menu-trigger` attribute, `onClick` that stops propagation and opens the row menu, the kebab `<Icon>`, and the closing `</div>` of each `.dash-item` plus the map's `))}`.

## Prototype JSX (verbatim)

```jsx
            <button className="dash-kebab" data-menu-trigger
                    onClick={(e) => { e.stopPropagation(); onMenu(d.id, e); }}>
              <Icon name="kebab" size={14}/>
            </button>
          </div>
        ))}
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-item .dash-kebab {
    opacity: 0; width: 20px; height: 20px; border-radius: 4px;
    display: grid; place-items: center;
    transition: opacity 0.15s, background 0.15s;
  }
  .dash-item:hover .dash-kebab, .dash-item.active .dash-kebab { opacity: 1; }
  .dash-item .dash-kebab:hover { background: oklch(36% 0.01 260); }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values (including `opacity: 0` default, `.dash-item:hover .dash-kebab` and `.dash-item.active .dash-kebab` reveal, and the `:hover` background).
- ☐ **Structure** — v2 `Sidebar.tsx` renders a `<button className="dash-kebab">` with the `data-menu-trigger` attribute, an `onClick` that calls `e.stopPropagation()` then `onMenu(d.id, e)`, and the kebab `<Icon>` at `size={14}`. The `.dash-item` `<div>` and the map callback both close correctly.
- ☐ **Content** — attributes match exactly: `className="dash-kebab"`, `data-menu-trigger` (no value), `<Icon name="kebab" size={14}/>`.

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
