---
id: sidebar-10
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "413-418"
prototype_css:
  file: OmniDash.html
  lines: "206-217"
v2_targets:
  - src/components/frame/Sidebar.tsx
  - src/styles/sidebar.css
status: todo
dependencies: []
blocked_reason: null
---

# sidebar-10 — `.sidebar-foot` (pulse dot, status text, version string)

Covers the `<div className="sidebar-foot">` wrapper, the pulsing status `<span className="dot"/>`, the `All systems normal` text span, the inline-styled mono version span (`v2.14`), and the closing `</aside>` of the sidebar root.

## Prototype JSX (verbatim)

```jsx
      <div className="sidebar-foot">
        <span className="dot"/>
        <span>All systems normal</span>
        <span style={{marginLeft:"auto", fontFamily:"'IBM Plex Mono', monospace", fontSize:11}}>v2.14</span>
      </div>
    </aside>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .sidebar-foot {
    padding: 10px 14px;
    border-top: 1px solid var(--sidebar-line);
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; color: var(--sidebar-ink-2);
  }
  .sidebar-foot .dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--status-ok);
    box-shadow: 0 0 0 3px oklch(70% 0.15 145 / 0.15);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/sidebar.css` with identical values, including the `@keyframes pulse` definition. The inline style on the version span matches exactly: `marginLeft:"auto"`, `fontFamily:"'IBM Plex Mono', monospace"`, `fontSize:11`.
- ☐ **Structure** — v2 `Sidebar.tsx` renders the `.sidebar-foot` wrapper with three child spans in order: `.dot` (self-closing, no children), a plain `<span>` for the status text, and a plain `<span>` with the inline style for the version. The `</aside>` closes the sidebar root correctly.
- ☐ **Content** — text matches exactly: status reads `All systems normal`, version reads `v2.14`.

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
