---
id: sidebar-07
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "393-397"
prototype_css:
  file: OmniDash.html
  lines: "197-197"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-07 — Rename input inline style, close, and `.dash-name` fallback

Covers the `<input>`'s inline `style` prop (transparent/no-border/inherit), the self-close `/>`, the ternary's `) : (` pivot, and the `<span className="dash-name">` with its `onDoubleClick` handler that starts a rename.

## Prototype JSX (verbatim)

```jsx
                style={{background:"transparent", border:0, outline:0, color:"inherit", font:"inherit", width:"100%"}}
              />
            ) : (
              <span className="dash-name" onDoubleClick={(e) => { e.stopPropagation(); onRenameStart(d.id); }}>{d.name}</span>
            )}
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .dash-item .dash-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.dash-item .dash-name` rule in `src/styles/sidebar.css` has identical properties (`flex: 1`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`). The `<input>`'s inline style object matches exactly: `background:"transparent"`, `border:0`, `outline:0`, `color:"inherit"`, `font:"inherit"`, `width:"100%"`.
- ☐ **Structure** — v2 `Sidebar.tsx` closes the ternary's input branch with `/>`, pivots with `) : (`, renders `<span className="dash-name">` with an `onDoubleClick` that calls `e.stopPropagation()` then `onRenameStart(d.id)`, and renders `{d.name}` as the span's child.
- ☐ **Content** — span body is exactly `{d.name}` (no wrapper, no formatting).

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
