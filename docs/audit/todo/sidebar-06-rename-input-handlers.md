---
id: sidebar-06
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "383-392"
prototype_css:
  file: OmniDash.html
  lines: ""
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-06 — Rename `<input>` element and its event handlers

Covers the ternary open (`renamingId === d.id ? (`), the `<input>` element with `autoFocus` and `defaultValue`, and its `onClick` / `onBlur` / `onKeyDown` handlers (Enter blurs; Escape cancels). Does NOT include the closing style attribute or the `)` — those live in sidebar-07.

## Prototype JSX (verbatim)

```jsx
            {renamingId === d.id ? (
              <input
                autoFocus
                defaultValue={d.name}
                onClick={e => e.stopPropagation()}
                onBlur={e => onRenameEnd(d.id, e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") e.target.blur();
                  if (e.key === "Escape") onRenameEnd(d.id, d.name);
                }}
```

## Prototype CSS (verbatim, scoped to elements above)

No dedicated CSS class — the rename `<input>` is styled via the inline `style` prop (covered in sidebar-07). There are no `.sidebar` CSS rules that target the `<input>` element.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — n/a (no class-based CSS; see sidebar-07 for the inline style).
- ☐ **Structure** — v2 `Sidebar.tsx` wraps the name cell in a ternary gated by `renamingId === d.id`, renders an `<input>` with `autoFocus`, `defaultValue={d.name}`, and all three handlers: `onClick` calls `e.stopPropagation()`, `onBlur` calls `onRenameEnd(d.id, e.target.value)`, and `onKeyDown` blurs on `Enter` and calls `onRenameEnd(d.id, d.name)` on `Escape`.
- ☐ **Content** — handler bodies are literally the expressions above; no extra logging, no trimming, no default values substituted.

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
