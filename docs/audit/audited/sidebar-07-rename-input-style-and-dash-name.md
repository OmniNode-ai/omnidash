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
status: audited
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

**Issue [CRITICAL]**: Rename `<input>` missing inline style prop — no transparent background, no border/outline reset, no inherited color/font, no `width:100%`.
- Prototype: `src/app.jsx:393` — `style={{background:"transparent", border:0, outline:0, color:"inherit", font:"inherit", width:"100%"}}`
- v2: `src/components/frame/Sidebar.tsx:68-78` (the returned `<input>` has no `style` prop, and `src/styles/sidebar.css` has no `.dash-item input` rule either)
- Impact: When a user double-clicks to rename or creates a new dashboard, the input renders with the browser default chrome (white background, grey border, default font/color, intrinsic width) instead of blending seamlessly into the dashboard row. Visually breaks the sidebar row layout and looks unstyled.

`.dash-item .dash-name` rule at `src/styles/sidebar.css:107` matches prototype exactly (`flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`).

### Structure

- No issues found. The ternary pivots correctly (`) : (`), the span carries `className="dash-name"`, `onDoubleClick` calls `e.stopPropagation()` then triggers the rename. Calling `setRenamingId(d.id)` instead of a prop `onRenameStart(d.id)` is a documented deviation per `Sidebar.tsx:7` (rename handled via local state).

### Content

- No issues found. Span body renders `{d.name}` verbatim with no wrapper or formatting.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
