---
id: widget-card-02
component: WidgetCard
prototype_jsx:
  file: src/app.jsx
  lines: "598-600"
prototype_css:
  file: OmniDash.html
  lines: "351-364"
v2_targets:
  - src/components/dashboard/ComponentWrapper.tsx
  - src/styles/dashboard.css
status: audited
dependencies: []
blocked_reason: null
---

# widget-card-02 — `.widget-head`, `.widget-head-left`, and `.widget-grip` (drag handle)

Covers the widget header row: the `<div className="widget-head">` container, its left-side `<div className="widget-head-left">` group, and the `<span className="widget-grip">` drag-handle containing the `grip` icon at size 14.

## Prototype JSX (verbatim)

```jsx
      <div className="widget-head">
        <div className="widget-head-left">
          <span className="widget-grip"><Icon name="grip" size={14}/></span>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .widget-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--pad-y) var(--pad-x);
    border-bottom: 1px solid var(--line-2);
  }
  .widget-head-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .widget-grip {
    color: var(--ink-3); cursor: grab;
    opacity: 0; transition: opacity 0.15s;
    display: grid; place-items: center;
    padding: 2px;
  }
  .widget:hover .widget-grip { opacity: 1; }
  .widget-grip:active { cursor: grabbing; }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/dashboard.css` with identical values. Includes the hover-reveal interaction (`.widget:hover .widget-grip { opacity: 1; }`) and the active-state cursor swap (`.widget-grip:active { cursor: grabbing; }`). `--pad-y`, `--pad-x`, `--line-2`, and `--ink-3` tokens must resolve identically.
- ☐ **Structure** — v2 `ComponentWrapper.tsx` has the `.widget-head` div wrapping `.widget-head-left`, and inside that a `<span className="widget-grip">` containing the grip icon. Element tags match (`div` / `div` / `span`), nesting order matches.
- ☐ **Content** — the grip icon is rendered via the shared `Icon` component with `name="grip"` and `size={14}`. No other children appear between `.widget-head` and `.widget-head-left`, and the grip `<span>` is the first child inside `.widget-head-left`.

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found.

All prototype CSS rules for `.widget-head`, `.widget-head-left`, `.widget-grip`, `.widget:hover .widget-grip`, and `.widget-grip:active` are present verbatim in `src/styles/dashboard.css:65-78` with identical property/value pairs. Tokens `--pad-y`, `--pad-x`, `--line-2`, and `--ink-3` are defined in `src/styles/globals.css:61-137` (both light and dark themes).

### Structure

**Issue [CRITICAL]**: `.widget-grip` `<span>` drag handle element is entirely missing from `.widget-head-left`.
- Prototype: `<div className="widget-head-left">` contains `<span className="widget-grip"><Icon name="grip" size={14}/></span>` as its first child (chunk lines 26-27).
- v2: `ComponentWrapper.tsx:36-38` renders `<div className="widget-head-left">` whose only child is `<span className="widget-title">{title}</span>` — no grip span, no Icon. The omission is acknowledged in the file header comment (`ComponentWrapper.tsx:9-10`: "Grip handle and kebab menu omitted at this layer — OMN-44 handles drag").
- Impact: Users see no drag-handle affordance on hover inside the widget header; the prototype's hover-reveal grab cursor UX (keyed off `.widget-grip`) is unreachable. The CSS rules targeting `.widget-grip` / `.widget:hover .widget-grip` / `.widget-grip:active` at `dashboard.css:71-78` are dead code until the span is rendered.

### Content

**Issue [CRITICAL]**: Grip icon via shared `Icon` component with `name="grip"` and `size={14}` is not rendered.
- Prototype: `<Icon name="grip" size={14}/>` inside the `.widget-grip` span (chunk line 27).
- v2: `ComponentWrapper.tsx` has no `Icon` import and no grip icon rendering anywhere in the widget head (file read in full, lines 1-56).
- Impact: No visual grip glyph appears; hover-reveal drag affordance is absent. This is the content-level consequence of the Structure issue above — listed separately because the axis requires verifying icon name and size, both of which are missing rather than incorrect.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
