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
status: done
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

- No issues found. `library.css:47-73` ports every prototype rule verbatim: `.lib-card` (1px `var(--line)` border, 10px radius, 12px padding, `var(--panel)` bg, `grab` cursor, flex `gap: 12px`, `margin-bottom: 8px`, transition covering border-color/box-shadow/transform), `.lib-card:hover` (border to `var(--brand)` per documented `--accent`→`--brand` rename, `var(--shadow-sm)`), `.lib-card:active` (`grabbing` cursor, `scale(0.99)`), `.lib-card-thumb` (56×56, 7px radius, `var(--panel-2)` bg, 1px `var(--line-2)` border, grid-centered, `var(--brand-ink)` per same rename), `.lib-card-info` (`flex: 1; min-width: 0`), `.lib-card-name` (13px/600, 2px bottom margin), `.lib-card-desc` (11.5px, `var(--ink-3)`, `line-height: 1.4`). Token rename `var(--accent-ink)` → `var(--brand-ink)` at `library.css:69` is the expected OMN-42 mapping and not a finding.

### Structure

**Issue [CRITICAL]**: `.lib-card-thumb` element is entirely absent from every card (user-flagged missing feature)
- Prototype: line 33 of the quoted JSX renders `<div className="lib-card-thumb"><Icon name={c.icon} size={22} stroke={1.5}/></div>` as the first child of every `.lib-card`, before `.lib-card-info`.
- v2: `ComponentPalette.tsx:67-72` renders only `<div className="lib-card-info">…</div>` as the sole child of `.lib-card`; no thumb div, no `<Icon>` import, no icon visualization. Source comment at `ComponentPalette.tsx:9-10` acknowledges the omission.
- Impact: Every widget card loses its 56×56 icon square. The card loses the visual anchor that distinguishes widget types at a glance and collapses to a text-only row, breaking the prototype's two-column card layout and the reserved `var(--panel-2)` tile the CSS still styles. This is the user-flagged regression.

**Issue [MAJOR]**: `.lib-card` is not draggable and has no drag handlers
- Prototype: the quoted JSX sets `draggable`, `onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; onDragStart(c.id); }}`, and `onDragEnd={onDragEnd}` on the root `.lib-card` div.
- v2: `ComponentPalette.tsx:53-67` omits `draggable`, `onDragStart`, and `onDragEnd` entirely; the `ComponentPaletteProps` interface at `ComponentPalette.tsx:17-20` exposes only `onAddComponent`, no drag callbacks.
- Impact: Users cannot drag widgets from the palette onto the canvas. CSS `cursor: grab` / `cursor: grabbing` at `library.css:52,61` now lie about the affordance, and the `effectAllowed = "copy"` contract that the drop target expects is missing.

**Issue [MAJOR]**: Card key uses `c.name` instead of `c.id`
- Prototype: line 26 uses `key={c.id}`.
- v2: `ComponentPalette.tsx:54` uses `key={c.name}`.
- Impact: Different semantic identifier; relies on registered-component `name` being unique instead of a stable id. Low visual impact but diverges from prototype contract.

**Issue [MAJOR]**: v2 adds button-role / keyboard handling not present in prototype
- Prototype: the quoted JSX has no `role`, `tabIndex`, `aria-disabled`, or `onKeyDown` on `.lib-card`.
- v2: `ComponentPalette.tsx:55-66` adds `role="button"`, `tabIndex={disabled ? -1 : 0}`, `aria-disabled={disabled || undefined}`, and an `onKeyDown` handler that fires `onAddComponent` on Enter/Space.
- Impact: v2 substitutes a keyboard-activatable button pattern for the prototype's drag-and-click pattern. Not visually regressive, but it's a structural deviation layered on top of the missing drag support; once drag is restored, re-evaluate whether the role="button" pattern should stay or be dropped for fidelity.

**Issue [MAJOR]**: v2 conditionally appends `added` class driven by `disabled`, prototype always appends empty string
- Prototype: line 27 is `className={`lib-card ${addedTypes.has(c.id) ? "" : ""}`}` — both branches emit empty string, so the `.added` modifier is never applied in the quoted block.
- v2: `ComponentPalette.tsx:58` is `className={`lib-card${disabled ? ' added' : ''}`}`, driven by `c.status !== 'available'`.
- Impact: v2 visually marks non-available components with the `.lib-card.added` style (0.5 opacity, dashed border at `library.css:62`). Prototype in this chunk shows no such branching. Flag for review — v2's behavior is arguably useful but is not in the prototype reference.

**Issue [MAJOR]**: v2 renders extra `.lib-card-added-badge` child not in prototype structure
- Prototype: lines 33-36 show exactly three children under `.lib-card`: `.lib-card-thumb`, then `.lib-card-info` containing `.lib-card-name` and `.lib-card-desc`. No badge element.
- v2: `ComponentPalette.tsx:71` renders `{disabled && <div className="lib-card-added-badge">· not implemented</div>}` inside `.lib-card-info`.
- Impact: Adds a "· not implemented" label on disabled cards. Extra structure beyond the prototype contract for this chunk.

### Content

**Issue [CRITICAL]**: No `<Icon>` rendered per card
- Prototype: line 33 renders `<Icon name={c.icon} size={22} stroke={1.5}/>` inside `.lib-card-thumb`, driven by `c.icon`.
- v2: `ComponentPalette.tsx` never imports an `Icon` component and never renders one; the file has no reference to `c.icon` or a manifest icon field. The source-comment admission at `ComponentPalette.tsx:9` says "v2 manifests don't carry an icon reference."
- Impact: No per-widget iconography at all — the defining visual element of each palette row is absent. Also implies a data gap: `ComponentManifest` likely needs an `icon` field before this can be restored.

**Issue [MAJOR]**: `dataTransfer.effectAllowed = "copy"` literal missing
- Prototype: line 29 sets `e.dataTransfer.effectAllowed = "copy"` inside `onDragStart`.
- v2: `ComponentPalette.tsx:53-67` has no `onDragStart`, so the literal does not exist.
- Impact: Dependent on the drag-handler fix above; when drag is re-added, the `"copy"` effect must be re-added alongside it so the drop cursor matches the prototype.

**Issue [MAJOR]**: Name text sourced from `c.manifest.displayName` instead of `c.name`
- Prototype: line 35 renders `{c.name}` inside `.lib-card-name`.
- v2: `ComponentPalette.tsx:69` renders `{c.manifest.displayName}`.
- Impact: Different data path. Visually the text may look identical when `displayName` mirrors `name`, but the binding diverges from the prototype contract and can produce different strings when manifests customize `displayName`.

**Issue [MAJOR]**: Description text sourced from `c.manifest.description` instead of `c.desc`
- Prototype: line 36 renders `{c.desc}` inside `.lib-card-desc`.
- v2: `ComponentPalette.tsx:70` renders `{c.manifest.description}`.
- Impact: Same shape as the name divergence — different data path, different field on the registered component.

**Issue [MAJOR]**: Quick-add callback wiring diverges
- Prototype: line 31 calls `onQuickAdd(c.id)` from the card's `onClick`.
- v2: `ComponentPalette.tsx:59` calls `onAddComponent(c.name)`, and the prop is named `onAddComponent` at `ComponentPalette.tsx:19`.
- Impact: Different prop name and different argument (name vs id). Functional behavior (click-to-add) is preserved, but the contract differs from the prototype.

## Resolution

Fixed in commit `4145b96` — feat(ui): port EmptyState + WidgetLibrary missing structure [OMN-48].
