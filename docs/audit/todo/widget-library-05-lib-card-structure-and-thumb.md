---
id: widget-library-05
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "646-657"
prototype_css:
  file: OmniDash.html
  lines: "483-509"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-library-05 — `.lib-card` structure with icon thumb, info, name, desc (user-flagged missing feature)

Covers the draggable `.lib-card` element and its three child regions: `.lib-card-thumb` (**user explicitly flagged icon thumbs as missing from v2**), `.lib-card-info`, `.lib-card-name`, and `.lib-card-desc`.

## Prototype JSX (verbatim)

```jsx
              <div
                key={c.id}
                className={`lib-card ${addedTypes.has(c.id) ? "" : ""}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; onDragStart(c.id); }}
                onDragEnd={onDragEnd}
                onClick={() => onQuickAdd(c.id)}
              >
                <div className="lib-card-thumb"><Icon name={c.icon} size={22} stroke={1.5}/></div>
                <div className="lib-card-info">
                  <div className="lib-card-name">{c.name}</div>
                  <div className="lib-card-desc">{c.desc}</div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .lib-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px;
    background: var(--panel);
    cursor: grab;
    display: flex; gap: 12px;
    margin-bottom: 8px;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  }
  .lib-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }
  .lib-card:active { cursor: grabbing; transform: scale(0.99); }
  .lib-card-thumb {
    width: 56px; height: 56px; flex-shrink: 0;
    border-radius: 7px;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    display: grid; place-items: center;
    color: var(--accent-ink);
  }
  .lib-card-info { flex: 1; min-width: 0; }
  .lib-card-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .lib-card-desc { font-size: 11.5px; color: var(--ink-3); line-height: 1.4; }
```

Note: prototype uses `var(--accent)` in the `.lib-card:hover` rule; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename. `.lib-card-thumb` uses `var(--accent-ink)` which is a separate token — verify v2's rename mapping.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.lib-card` has 1px `var(--line)` border, 10px radius, 12px padding, `var(--panel)` background, `grab` cursor, flex with 12px gap, 8px bottom margin, and a transition covering border-color, box-shadow, and transform; hover swaps border to brand and adds `var(--shadow-sm)`; active switches to `grabbing` cursor and `scale(0.99)`. `.lib-card-thumb` is 56x56 with 7px radius, `var(--panel-2)` background, 1px `var(--line-2)` border, grid-centered content, `var(--accent-ink)` color. `.lib-card-info` is `flex: 1` with `min-width: 0`. `.lib-card-name` is 13px/600 with 2px bottom margin. `.lib-card-desc` is 11.5px, `var(--ink-3)` color, 1.4 line-height.
- ☐ **Structure** — v2 `ComponentPalette.tsx` renders each card as a `<div className="lib-card">` with `draggable`, `onDragStart` (setting `effectAllowed = "copy"` and calling the drag-start callback with the type id), `onDragEnd`, and `onClick` (calling the quick-add callback). Inside: `.lib-card-thumb` wrapping an `<Icon>` at `size={22}` and `stroke={1.5}` driven by `c.icon`, followed by `.lib-card-info` wrapping `.lib-card-name` ({c.name}) and `.lib-card-desc` ({c.desc}). **Surfacing gap:** if v2 omits `.lib-card-thumb` or renders no icon visualization per widget, file a top-level "missing feature" issue under Structure.
- ☐ **Content** — each card's key is `c.id`; thumb icon name comes from `c.icon`; name text comes from `c.name`; desc text comes from `c.desc`. Icon size is exactly `22` with stroke width `1.5`. The `dataTransfer.effectAllowed` literal is `"copy"`.

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
