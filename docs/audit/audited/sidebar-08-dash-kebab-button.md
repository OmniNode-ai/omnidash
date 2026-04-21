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
status: audited
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

- No issues found.

All three prototype rules port verbatim to `src/styles/sidebar.css:108-114`:
- `.dash-item .dash-kebab` — identical `opacity: 0; width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; transition: opacity 0.15s, background 0.15s;`
- `.dash-item:hover .dash-kebab, .dash-item.active .dash-kebab { opacity: 1; }` — identical.
- `.dash-item .dash-kebab:hover { background: oklch(36% 0.01 260); }` — identical.

### Structure

**Issue [MINOR]** — Menu trigger pattern is a documented rewrite.

The prototype's bare `<button>` with a parent-owned `onMenu(d.id, e)` handler is replaced in v2 by a shadcn `DropdownMenu` / `DropdownMenuTrigger asChild` wrapper (`Sidebar.tsx:173-197`). The button's `onClick` only calls `e.stopPropagation()`; the menu opening is delegated to shadcn. This deviation is explicitly listed in the file header comment (line 5: "`...` kebab menu implemented via shadcn DropdownMenu instead of a custom positioned div"). Visual/behavioral outcome (kebab button opens a menu on click) is preserved. Flagging as MINOR stylistic/architectural divergence rather than a defect.

**Issue [MINOR]** — `data-menu-trigger` attribute not present.

Prototype adds `data-menu-trigger` (no value) on the button (`src/app.jsx:398`). v2 omits it (`Sidebar.tsx:175-181`). Since the prototype's outside-click-to-close logic keyed off this attribute and v2 uses shadcn's own dismissal, the attribute is functionally unused — but it's a verbatim-content deviation from the chunk's Content checklist. Consumers grepping for `[data-menu-trigger]` in test/automation code would miss v2. No functional regression in the sidebar itself.

### Content

**Issue [MINOR]** — Kebab icon uses `lucide-react` `MoreHorizontal` instead of prototype `<Icon name="kebab" size={14}/>`.

`Sidebar.tsx:180` renders `<MoreHorizontal size={14} />` (three horizontal dots). The prototype's `<Icon name="kebab" />` also renders three dots at `size={14}`. Glyph and size match; only the icon-component source differs. This is a documented v2-wide pattern (lucide-react used everywhere instead of the prototype's custom `Icon` factory). MINOR stylistic divergence.

v2 additionally adds an `aria-label={`Dashboard options for ${d.name}`}` on the button — an accessibility improvement beyond the prototype. No regression.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
