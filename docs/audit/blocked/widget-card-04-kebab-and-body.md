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
status: blocked
dependencies: []
blocked_reason: "Deferred to OMN-44 (drag-and-drop + kebab menu wiring). See DashboardView.tsx:8 and ComponentWrapper.tsx:9 for scope note."
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

- No issues found.

(The `.widget-kebab` rule in `src/styles/dashboard.css:97-102` matches the prototype exactly: 26×26, `border-radius: 5px`, grid-centered, `color: var(--ink-3)`, hover swaps to `background: var(--panel-2); color: var(--ink)`, `transition: background 0.15s, color 0.15s`. The `.widget-body` rule at `src/styles/dashboard.css:104` uses `padding: 14px var(--pad-x) var(--pad-x)` as specified.)

### Structure

**Issue [CRITICAL]**: `.widget-kebab` button missing entirely from ComponentWrapper
- Prototype: `src/app.jsx:606-608` — `<button className="widget-kebab" data-menu-trigger onClick={onMenu}><Icon name="kebab" size={16}/></button>` is the last child of `.widget-head`, sibling of `.widget-head-left`.
- v2: `src/components/dashboard/ComponentWrapper.tsx:35-40` — `.widget-head` contains only `.widget-head-left` and the always-on `.widget-live` span. No kebab button, no `data-menu-trigger`, no onClick. The source comment at line 9 acknowledges the omission ("menu lives in the outer shell (ComponentCell) and will be wired in a later pass").
- Impact: The header has no overflow/options affordance at this layer; users cannot open the widget menu from the card chrome that the prototype defines. The CSS for `.widget-kebab` is shipped but unused at this component level, meaning hover affordances and `data-menu-trigger` outside-click detection are non-functional unless a wrapping shell renders the button. The prototype's three-slot header (left / live / kebab) collapses to a two-slot layout.

**Issue [MAJOR]**: `.widget-body` wraps status overlays instead of child content with an "Unknown widget" fallback
- Prototype: `src/app.jsx:610-612` — body renders `cat.render(...)` or an inline fallback `<div style={{color:"var(--ink-3)"}}>Unknown widget</div>` when the catalog entry is missing; no loading/error/empty chrome inside.
- v2: `src/components/dashboard/ComponentWrapper.tsx:41-53` — body renders Loading / Error / Empty / children states. Conceptually close to the prototype's purpose but introduces states the prototype does not define inside the body and drops the explicit "unknown widget" branch.
- Impact: Divergent state taxonomy inside `.widget-body`. Acceptable as noted in the file header comment, but it means the prototype's single "Unknown widget" fallback path is replaced by three separate states, changing what a consumer of ComponentWrapper sees when no data/catalog entry is available.

### Content

**Issue [MAJOR]**: Kebab icon and `data-menu-trigger` attribute missing
- Prototype: `src/app.jsx:607` — `<Icon name="kebab" size={16}/>` inside the button; `data-menu-trigger` present (value-less), consumed by outside-click detection.
- v2: `src/components/dashboard/ComponentWrapper.tsx` — no kebab icon rendered and no `data-menu-trigger` attribute anywhere in this component.
- Impact: Outside-click detection hooked via `data-menu-trigger` cannot bind here; any menu system relying on this attribute at the widget chrome level is non-functional through ComponentWrapper. This is a consequence of the structural omission above but tracked separately because the `data-menu-trigger` attribute is a load-bearing hook, not decorative.

**Issue [MINOR]**: "Unknown widget" fallback copy replaced with Loading/Error/Empty states
- Prototype: `src/app.jsx:611` — literal text `Unknown widget` with inline `color: var(--ink-3)`.
- v2: `src/components/dashboard/ComponentWrapper.tsx:42-51` — renders `Loading...`, `Error: {error.message}`, and `emptyMessage || 'No data available'` / `emptyHint`. Color token `var(--ink-3)` preserved in loading and empty branches; error branch uses `var(--status-bad)`.
- Impact: Copy and information density inside the body differ from the prototype. Color tokens match on the ink-3 branches, so visual fidelity is preserved for non-error states, but the user-facing wording and the number of possible states diverge from the prototype spec.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
