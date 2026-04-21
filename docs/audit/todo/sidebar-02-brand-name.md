---
id: sidebar-02
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "359-363"
prototype_css:
  file: OmniDash.html
  lines: "111-123"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-02 — `.brand-name` block (primary + parent lines)

Covers the `<div className="brand-name">` wrapper inside `.brand`, the `<span className="primary">` holding `Omni<em>Dash</em>`, the `<span className="parent">` holding the tagline, and the closing `</div>` of `.brand`.

## Prototype JSX (verbatim)

```jsx
        <div className="brand-name">
          <span className="primary">Omni<em>Dash</em></span>
          <span className="parent">an omninode product</span>
        </div>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .brand-name {
    font-weight: 600; font-size: 15px; letter-spacing: -0.005em;
    display: flex; flex-direction: column; line-height: 1.1;
  }
  .brand-name .primary { color: var(--sidebar-ink); }
  .brand-name .primary em { font-style: normal; color: var(--accent); }
  .brand-name .parent {
    font-family: "IBM Plex Mono", monospace;
    font-size: 9px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--sidebar-ink-2); opacity: 0.7;
    margin-top: 2px;
  }
```

Note: prototype uses `var(--accent)` in places; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values.
- ☐ **Structure** — v2 `Sidebar.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names and attributes (`className`, nested `<em>` inside `.primary`, sibling `<span className="parent">`).
- ☐ **Content** — static text matches exactly: `.primary` reads `Omni<em>Dash</em>` (with the `em` wrapping only `Dash`), `.parent` reads `an omninode product`.

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
