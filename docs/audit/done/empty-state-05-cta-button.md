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
status: done
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

**Issue [CRITICAL]**: No CTA button rendered in v2 empty state.
- Prototype: `<button className="btn primary" onClick={onAdd} style={{position:"relative"}}>` (chunk lines 27-29) — primary-styled button using the shared `.btn.primary` class (defined in `src/styles/buttons.css:16-20`) with `position: relative` inline.
- v2: `src/pages/DashboardView.tsx:177-182` renders only a `<div>` of plain text ("Empty dashboard — click Edit to add components") styled with `color: var(--ink-2); fontSize: 14px`. No `<button>` is emitted at all, so `.btn.primary` styling and the `position: relative` stacking-context fix are both absent.
- Impact: User sees an instruction string instead of a clickable primary CTA. Hierarchy of the empty state is lost and the one-click path into edit/add flow is removed — user must find and click the header "Edit" button instead.

### Structure

**Issue [CRITICAL]**: Button element and click handler are missing.
- Prototype: The empty state's last child is a `<button>` wired to `onAdd` (chunk line 27), containing exactly two children — `<Icon name="plus" size={14}/>` and the trailing text (chunk line 28).
- v2: `src/pages/DashboardView.tsx:178-182` renders a single text `<div>`. There is no `<button>`, no `onClick`, no icon child, and no handler wired to a v2 equivalent of `onAdd` (e.g., `handleEdit` at line 53 or `setEditMode(true)` / opening the palette).
- Impact: Empty state provides no interactive affordance. The structural contract of "container + CTA button as final child" is broken; downstream chunks depending on the button's presence (icon, label) have nothing to attach to.

### Content

**Issue [CRITICAL]**: Icon and label text are absent.
- Prototype: Icon is `<Icon name="plus" size={14}/>` followed by the literal label ` Add first widget` (leading space preserved; chunk line 28). No trailing punctuation.
- v2: `src/pages/DashboardView.tsx:179-181` emits the strings `'Add components from the palette'` (edit mode) or `'Empty dashboard — click Edit to add components'` (view mode). No plus icon is rendered, and neither string matches the prototype copy `Add first widget`.
- Impact: Copy does not match the design; the visual "plus" glyph that communicates "create new" is missing, so the empty state reads as a status message rather than an invitation to act.

## Resolution

Fixed in commit `4145b96` — feat(ui): port EmptyState + WidgetLibrary missing structure [OMN-48].
