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
status: todo
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

(fill in)

### Structure

(fill in)

### Content

(fill in)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
