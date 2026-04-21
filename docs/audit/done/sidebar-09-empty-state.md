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
status: done
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

**Issue [MINOR]** — `lineHeight` divergence on empty-state wrapper.
- Prototype (`src/app.jsx:404-412`): `lineHeight:1.5` on the wrapper `<div>` inline style.
- v2 (`src/components/frame/Sidebar.tsx:203`): `lineHeight: 1.6` on the wrapper `<div>` inline style.
- Impact: ~0.1em of extra vertical spacing between `No dashboards yet.` and the CTA button. Purely stylistic; no layout shift beyond ~2px.
- Fix: change `lineHeight: 1.6` → `lineHeight: 1.5` in `Sidebar.tsx` line 203.

All other inline-style values on the wrapper match verbatim (`padding: '20px 12px'`, `fontSize: '12px'`, `color: 'var(--sidebar-ink-2)'`, `textAlign: 'center'`).

Button inline style values match (modulo the documented intentional `--accent` → `--brand` rename): `color: 'var(--brand)'`, `textDecoration: 'underline'`, `marginTop: '4px'`.

### Structure

- No issues found.

The block is correctly gated on `dashboards.length === 0` (line 202), renders the wrapper `<div>`, a literal `<br />` (line 205), and a `<button>` whose `onClick={handleCreate}` wraps the CTA text. `handleCreate` is the v2 equivalent of the prototype's `onCreate` prop (it invokes `createDashboard` and sets rename state — an intentional, documented deviation per the file header). Closing `</div>` of `.dash-list` is present (line 214).

### Content

- No issues found.

Wrapper text reads `No dashboards yet.` verbatim (line 204). Button text reads `Create your first one →` (line 210) with the correct right-arrow glyph `→` (U+2192), not the `->` digraph.

## Resolution

Fixed in commit `d15bc4c` — lineHeight adjusted from 1.6 to 1.5 to match prototype.
