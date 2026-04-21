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
status: audited
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

- No issues found. (n/a — inline style belongs to sidebar-07; class-based CSS has no rules targeting the rename `<input>`.)

### Structure

**Issue [MINOR]**: Rename `<input>` extracted into separate `RenameInput` subcomponent with a `ref` + `useEffect` wrapper
- Prototype: `src/app.jsx:383-392` (inline `<input>` directly inside the ternary)
- v2: `src/components/frame/Sidebar.tsx:60-80` (extracted `RenameInput` functional component, rendered at line 155-159)
- Impact: Structural refactor is acknowledged in the file header (line 7: "Rename in-place handled via local `renamingId` state rather than lifted to App"), but the extraction into a subcomponent is a further deviation not explicitly called out. Behavior is largely equivalent; this is flagged for traceability, not correctness.

### Content

**Issue [MINOR]**: Added `ref.current?.select()` in `useEffect` — input text auto-selects on mount
- Prototype: `src/app.jsx:384` — only `autoFocus`, no selection behavior
- v2: `src/components/frame/Sidebar.tsx:63-65` — `useEffect(() => { ref.current?.select(); }, [])` selects all text
- Impact: User-visible UX divergence. In prototype, focus lands in the input but the text is NOT pre-selected — the user would need to Ctrl+A or triple-click to replace. In v2, the text is auto-selected so typing immediately replaces it. This is a minor but real behavioral difference for fidelity.

**Issue [MAJOR]**: Escape handler diverges — v2 can commit the edited value instead of cancelling
- Prototype: `src/app.jsx:389` — `if (e.key === "Escape") onRenameEnd(d.id, d.name);` — explicitly passes the ORIGINAL name, so the rename is committed with the unchanged value (effective no-op).
- v2: `src/components/frame/Sidebar.tsx:76` — `if (e.key === 'Escape') onCancel();` — only clears `renamingId` via `handleRenameCancel` (line 98-101). However, `onBlur` (line 73: `onBlur={(e) => onCommit(e.target.value)}`) fires when the input loses focus on unmount, calling `handleRenameCommit` with the currently-edited input value, which then calls `renameDashboard(d.id, value)` — committing the edit rather than cancelling it.
- Impact: Pressing Escape after editing does not reliably cancel the change. Depending on React event ordering, Escape may effectively commit the partially-typed value instead of reverting to the original. The prototype sidesteps this by always passing `d.name` (the original) on Escape, so even if `onBlur` also fires, the result is still the original name.

**Issue [NIT]**: `e.target.blur()` → `e.currentTarget.blur()`
- Prototype: `src/app.jsx:388` — `e.target.blur()`
- v2: `src/components/frame/Sidebar.tsx:75` — `e.currentTarget.blur()`
- Impact: Behaviorally equivalent here (keydown target === currentTarget for a focused input); `currentTarget` is the TS-safer choice. No user-visible effect.

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
