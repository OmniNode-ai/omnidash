---
id: widget-library-02
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "631-637"
prototype_css:
  file: OmniDash.html
  lines: "455-461"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: audited
dependencies: []
blocked_reason: null
---

# widget-library-02 — `.lib-head` title, subtitle, and close button

Covers the `.lib-head` region at the top of the rail: the `<h3>` title "Widget Library", the `<p>` subtitle, and the close `icon-btn` with its `x` icon.

## Prototype JSX (verbatim)

```jsx
      <div className="lib-head">
        <div>
          <h3>Widget Library</h3>
          <p>Drag onto the dashboard, or click to add.</p>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="x" size={16}/></button>
      </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .lib-head {
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--line);
    display: flex; align-items: center; justify-content: space-between;
  }
  .lib-head h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .lib-head p { margin: 2px 0 0; font-size: 12px; color: var(--ink-3); }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.lib-head` padding (16px 18px 12px), bottom border, flex layout with space-between; `h3` at 15px/600 weight with -0.01em letter-spacing and zero margin; `p` at 12px with `var(--ink-3)` color and 2px top margin.
- ☐ **Structure** — v2 renders a `<div className="lib-head">` containing an inner wrapper `<div>` with `<h3>` + `<p>`, followed by a `<button className="icon-btn">` that wraps an x-icon sized 16 and wires to the close handler.
- ☐ **Content** — title text is exactly `Widget Library`; subtitle text is exactly `Drag onto the dashboard, or click to add.`; close icon is `x` at `size={16}`.

## Findings

> Structure each issue as a block. If none, write `- No issues found.` per axis.

### Design

- No issues found. `.lib-head`, `.lib-head h3`, and `.lib-head p` rules in `src/styles/library.css:19-25` are a verbatim port of the prototype block (padding `16px 18px 12px`, bottom border, flex `space-between`, h3 `15px`/`600`/`-0.01em`/`margin:0`, p `2px 0 0`/`12px`/`var(--ink-3)`).

### Structure

**Issue [CRITICAL]**: Close `icon-btn` is missing entirely from `.lib-head`.
- Prototype: `.lib-head` ends with `<button className="icon-btn" onClick={onClose}><Icon name="x" size={16}/></button>` (chunk lines 25-31), making it a two-child flex row where `justify-content: space-between` pushes the title block left and the close button right.
- v2: `src/components/dashboard/ComponentPalette.tsx:37-42` renders only the inner `<div>` with `<h3>` + `<p>`; there is no close button, no `<Icon name="x" size={16}/>`, and no `onClose` prop on `ComponentPaletteProps` (`src/components/dashboard/ComponentPalette.tsx:17-20`).
- Impact: Users cannot dismiss the Widget Library rail from inside the rail. The `space-between` layout also degenerates to a single flex child pinned left, so the visual balance of the header is wrong even when the rail is open.

### Content

**Issue [MAJOR]**: Subtitle copy does not match prototype.
- Prototype: `<p>Drag onto the dashboard, or click to add.</p>` (chunk line 28) — communicates both affordances (drag + click).
- v2: `src/components/dashboard/ComponentPalette.tsx:40` renders `<p>Click a widget to add it to the dashboard.</p>`.
- Impact: Users are told only about the click path, hiding the drag-to-place affordance the prototype advertises. Wording and length also differ, changing the visual rhythm of the header.

**Issue [CRITICAL]**: Close-button `x` icon at `size={16}` is absent.
- Prototype: `<Icon name="x" size={16}/>` inside the `.icon-btn` (chunk line 30).
- v2: No `Icon` import and no `x` glyph rendered anywhere in `ComponentPalette.tsx`.
- Impact: The `x` affordance that signals "this panel is closable" is not present, compounding the structural gap above. (Tracked here under Content for the icon name/size mismatch; the missing element itself is covered by the Structure CRITICAL.)

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
