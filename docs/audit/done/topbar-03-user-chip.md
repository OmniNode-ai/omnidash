---
id: topbar-03
component: Topbar
prototype_jsx:
  file: src/app.jsx
  lines: "439-447"
prototype_css:
  file: OmniDash.html
  lines: "247-263"
v2_targets:
  - src/components/frame/Header.tsx
  - src/styles/topbar.css
status: done
dependencies: []
blocked_reason: null
---

# topbar-03 — `.user-chip` block (avatar + name/org)

Covers the `.user-chip` wrapper inside `.topbar-right`, containing the `.avatar` initials badge and the `.user-info` column with `.name` and `.org` labels, plus the closing tags for `.topbar-right` and `.topbar`.

## Prototype JSX (verbatim)

```jsx
        <div className="user-chip">
          <div className="avatar">JS</div>
          <div className="user-info">
            <span className="name">Jamie Sun</span>
            <span className="org">Platform Eng</span>
          </div>
        </div>
      </div>
    </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .user-chip {
    display: flex; align-items: center; gap: 10px;
    padding: 4px 10px 4px 4px; border-radius: 999px;
    margin-left: 6px;
    transition: background 0.15s;
  }
  .user-chip:hover { background: var(--panel-2); }
  .avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), oklch(72% 0.15 calc(var(--accent-h) + 60)));
    color: oklch(20% 0.05 var(--accent-h));
    display: grid; place-items: center;
    font-size: 11px; font-weight: 600;
  }
  .user-info { display: flex; flex-direction: column; line-height: 1.15; }
  .user-info .name { font-size: 12.5px; font-weight: 500; }
  .user-info .org { font-size: 11px; color: var(--ink-3); }
```

Note: prototype uses `var(--accent)` (and `var(--accent-h)`) in `.avatar`; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/topbar.css` with identical values (including the `.avatar` linear-gradient and oklch color expressions, modulo the `--accent` → `--brand` token rename).
- ☐ **Structure** — v2 `Header.tsx` has every element from the prototype JSX block above, in the same nesting order, with the same class names (`user-chip`, `avatar`, `user-info`, `name`, `org`) and element types (`<div>` wrappers, `<span>` labels).
- ☐ **Content** — static text matches exactly: avatar initials `JS`, name `Jamie Sun`, org `Platform Eng`.

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found.

All `.user-chip`, `.user-chip:hover`, `.avatar`, `.user-info`, `.user-info .name`, and `.user-info .org` declarations in `src/styles/topbar.css:33-49` match the prototype (`OmniDash.html:247-263`) property-for-property, including the 135deg linear-gradient and both `oklch()` color expressions. The documented `var(--accent)` → `var(--brand)` token rename is applied at `src/styles/topbar.css:42`; `var(--accent-h)` is retained as the live hue token (confirmed in `src/styles/globals.css:51`) and correctly preserved inside both `oklch()` calls.

### Structure

**Issue [MINOR]**: `.user-chip` wrapper carries `role="button"` and `tabIndex={0}` not present in the prototype.
- Prototype: `src/app.jsx:439` (`<div className="user-chip">` — no role/tabIndex)
- v2: `src/components/frame/Header.tsx:57`
- Impact: v2 exposes the chip as a focusable button to assistive tech and keyboard users even though no click handler is wired. The prototype renders the chip as a decorative static div. The divergence is undocumented in the deviations header comment (`src/components/frame/Header.tsx:1-9`). Functionally benign (no a11y regression — arguably an improvement) but is a structural deviation from the prototype and should either be reverted or recorded as an intentional deviation in the source comment.

Otherwise the element tree matches: `.user-chip > .avatar` plus `.user-chip > .user-info > (span.name, span.org)`, nesting, element types, and class names identical to prototype.

### Content

- No issues found.

Avatar initials `JS` (`Header.tsx:58`), name `Jamie Sun` (`Header.tsx:60`), and org `Platform Eng` (`Header.tsx:61`) match the prototype verbatim.

## Resolution

Accepted v2 pattern — `role="button"` + `tabIndex={0}` on the user chip is an a11y improvement (chip behaves like a button per prototype intent); zero regression from prototype visuals.
