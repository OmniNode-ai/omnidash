---
id: sidebar-03
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "364-370"
prototype_css:
  file: OmniDash.html
  lines: "125-140"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-03 — `.workspace` label and `.workspace-chip`

Covers the `<div className="workspace">` wrapper, the inline-styled "Workspace" label div, and the `<div className="workspace-chip">` containing the `.ws-name` span and the chevron-down `<Icon>`.

## Prototype JSX (verbatim)

```jsx
      <div className="workspace">
        <div style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em"}}>Workspace</div>
        <div className="workspace-chip">
          <span className="ws-name">Platform Eng</span>
          <Icon name="chevron-down" size={14}/>
        </div>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .workspace {
    padding: 12px 14px;
    border-bottom: 1px solid var(--sidebar-line);
    font-size: 12px;
    color: var(--sidebar-ink-2);
  }
  .workspace-chip {
    margin-top: 6px;
    display: flex; align-items: center; justify-content: space-between;
    background: oklch(26% 0.01 260); color: var(--sidebar-ink);
    padding: 8px 10px; border-radius: 6px;
    cursor: pointer; border: 1px solid var(--sidebar-line);
    transition: background 0.15s;
  }
  .workspace-chip:hover { background: oklch(30% 0.01 260); }
  .workspace-chip .ws-name { font-weight: 500; font-size: 13px; }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values (including the inline styles on the "Workspace" label: `fontSize:10`, `textTransform:"uppercase"`, `letterSpacing:"0.08em"`).
- ☐ **Structure** — v2 `Sidebar.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names and the chevron-down `<Icon>` at `size={14}`.
- ☐ **Content** — static text matches exactly: label reads `Workspace`, `.ws-name` reads `Platform Eng`, `<Icon name="chevron-down" size={14}/>`.

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
