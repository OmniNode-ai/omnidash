---
id: widget-library-04
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "641-645"
prototype_css:
  file: OmniDash.html
  lines: "477-482"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: audited
dependencies: []
blocked_reason: null
---

# widget-library-04 — `.lib-body` scroll container and `.lib-group-title` category headers

Covers the scrollable `.lib-body` region and the per-category `.lib-group-title` header that groups widgets by their `category` field. Also covers the `Object.entries(grouped).map(...)` iteration over grouped catalog entries.

## Prototype JSX (verbatim)

```jsx
      <div className="lib-body">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="lib-group-title">{cat}</div>
            {items.map(c => (
```

Also relevant from the component's grouping logic (lines 624-627):

```jsx
  const grouped = filtered.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c);
    return acc;
  }, {});
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .lib-body { flex: 1; overflow-y: auto; padding: 10px 14px 20px; }
  .lib-group-title {
    padding: 10px 4px 6px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-3); font-weight: 600;
  }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.lib-body` is `flex: 1` with vertical scroll and `10px 14px 20px` padding; `.lib-group-title` has `10px 4px 6px` padding, 11px uppercase text with 0.08em letter-spacing, 600 weight, `var(--ink-3)` color.
- ☐ **Structure** — v2 renders a `<div className="lib-body">` containing one `<div key={cat}>` per category group; each group contains a `<div className="lib-group-title">` with the category label followed by the mapped cards. Grouping derives from `reduce` over `filtered` keyed by `c.category`.
- ☐ **Content** — category strings match the catalog's `c.category` values verbatim and are rendered with their original casing (the CSS uppercases visually via `text-transform`).

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found.

  `library.css:41` defines `.lib-body { flex: 1; overflow-y: auto; padding: 10px 14px 20px; }` matching the prototype verbatim. `library.css:42-46` defines `.lib-group-title` with `padding: 10px 4px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); font-weight: 600;` — all six properties match the prototype block at lines 477-482 exactly.

### Structure

**Issue [MINOR]**: v2 iterates a fixed category enum instead of `Object.entries(grouped)`, changing group ordering semantics.
- Prototype: `{Object.entries(grouped).map(([cat, items]) => (...))}` (chunk lines 26-30) iterates groups in the insertion order of the reduce — i.e., whatever order the catalog's entries happen to produce. There is no pre-defined category ordering.
- v2: `ComponentPalette.tsx:44` maps over `COMPONENT_CATEGORIES` (the `component-manifest` enum constant) and pulls each bucket from a `Map` keyed by category. `items.length === 0 return null` is applied (line 46), so empty groups are hidden.
- Impact: v2 renders categories in a deterministic enum-defined order regardless of catalog content, whereas the prototype follows the catalog's natural ordering. User-visible ordering of category headings can differ from prototype when the catalog is not pre-sorted by the enum's order. Functionally equivalent for non-empty categories, but the grouping/derivation mechanism diverges from the prototype's simple reduce.

**Issue [MINOR]**: v2 uses a `Map` populated from the fixed enum; prototype uses a plain object keyed by whatever `c.category` string happens to be.
- Prototype: `const grouped = filtered.reduce((acc, c) => { (acc[c.category] = acc[c.category] || []).push(c); return acc; }, {});` (chunk lines 35-38). Any arbitrary `c.category` string produces a group.
- v2: `ComponentPalette.tsx:23-33` pre-seeds a `Map<ComponentCategory, ...>` with `COMPONENT_CATEGORIES`, then only pushes via `groups.get(c.manifest.category)` (line 29) — components whose category is not in the enum are silently dropped (`if (list) list.push(c)`).
- Impact: In v2, a component with a category value outside the `COMPONENT_CATEGORIES` enum will disappear from the library entirely rather than forming its own group as the prototype would do. Behavioural divergence at the data layer; may mask registry drift.

### Content

- No issues found.

  The category label rendered inside `<div className="lib-group-title">{cat}</div>` (ComponentPalette.tsx:49) uses the raw category key verbatim, identical to the prototype (chunk line 28). CSS `text-transform: uppercase` handles visual casing. Since v2's `cat` comes from the `COMPONENT_CATEGORIES` enum strings (which are the canonical manifest category values), the rendered text matches what each manifest's `c.category` would produce in the prototype for any valid category.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
