---
id: empty-state-05
component: EmptyState
prototype_jsx:
  file: src/app.jsx
  lines: "579-583"
prototype_css:
  file: "N/A (inline styles in app.jsx; `.btn.primary` class lives in OmniDash.html)"
  lines: "N/A"
v2_targets:
  - src/pages/DashboardView.tsx
status: todo
dependencies:
  - empty-state-01
blocked_reason: null
---

# empty-state-05 — CTA button "Add first widget"

Covers the primary-styled call-to-action button at the bottom of the empty state, with a `plus` icon and the label "Add first widget". The button itself uses the shared `btn primary` class (defined elsewhere in OmniDash.html) with only a single `position: relative` inline override.

Note: v2 has no dedicated `EmptyState.tsx` — v2 renders empty-state inline within `DashboardView.tsx`. Target is `DashboardView.tsx`.

## Prototype JSX (verbatim)

```jsx
      <button className="btn primary" onClick={onAdd} style={{position:"relative"}}>
        <Icon name="plus" size={14}/> Add first widget
      </button>
    </div>
  );
}
```

## Prototype inline styles (verbatim)

The prototype uses inline `style={{}}` for the stacking-context fix only — **OmniDash.html contains no `.empty*` selector**, but the visual styling here derives from the shared `.btn.primary` class (audited separately under the button chunks). The inline style object on the button:

```js
{ position: "relative" }
```

The `position: relative` is required so the button renders above the diagonal-stripe overlay from empty-state-02.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — v2 CTA button carries `className="btn primary"` (so it inherits the shared primary-button styling from the global button CSS) and adds `position: relative` inline to lift above the stripe overlay. No additional inline overrides.
- ☐ **Structure** — a single `<button>` element as the last child of the outer empty-state container. Wires `onClick` to the component's `onAdd` prop (whatever v2 calls its equivalent — e.g., the "enter edit mode" or "open palette" callback). The button contains exactly two children in order: the `Icon` and the trailing text.
- ☐ **Content** — icon is `<Icon name="plus" size={14}/>` (name string `"plus"`, size numeric `14`). Trailing label is exactly `" Add first widget"` (note the leading space after the icon). No trailing punctuation.

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
