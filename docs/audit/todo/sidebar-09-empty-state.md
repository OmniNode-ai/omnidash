---
id: sidebar-09
component: Sidebar
prototype_jsx:
  file: src/app.jsx
  lines: "404-412"
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

# sidebar-09 — Empty-state fallback when `dashboards.length === 0`

Covers the conditional block rendered when there are no dashboards: an inline-styled wrapper `<div>`, the `"No dashboards yet."` copy with a `<br/>`, and a `<button>` with inline styles that calls `onCreate` and reads `Create your first one →`. Also covers the closing `</div>` of `.dash-list`.

## Prototype JSX (verbatim)

```jsx
        {dashboards.length === 0 && (
          <div style={{padding:"20px 12px", fontSize:12, color:"var(--sidebar-ink-2)", textAlign:"center", lineHeight:1.5}}>
            No dashboards yet.<br/>
            <button onClick={onCreate} style={{color:"var(--accent)", textDecoration:"underline", marginTop:4}}>
              Create your first one →
            </button>
          </div>
        )}
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

No dedicated CSS classes — the empty-state wrapper and its button are styled entirely via inline `style` props. There are no `.sidebar` CSS rules that target this subtree.

Note: prototype uses `var(--accent)` in places; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — inline style objects match exactly. Wrapper `<div>`: `padding:"20px 12px"`, `fontSize:12`, `color:"var(--sidebar-ink-2)"`, `textAlign:"center"`, `lineHeight:1.5`. Button: `color:"var(--accent)"` (or `"var(--brand)"` per OMN-42), `textDecoration:"underline"`, `marginTop:4`.
- ☐ **Structure** — v2 `Sidebar.tsx` gates this block on `dashboards.length === 0`, renders the wrapper `<div>`, the literal `<br/>`, and a `<button>` with `onClick={onCreate}` wrapping the CTA text.
- ☐ **Content** — text matches exactly: wrapper text reads `No dashboards yet.`, button text reads `Create your first one →` (note the right-arrow glyph `→`, not `->`).

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
