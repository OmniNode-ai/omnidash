---
id: widget-library-03
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "638-640"
prototype_css:
  file: OmniDash.html
  lines: "462-476"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-library-03 — `.lib-search` input (user-flagged missing feature)

Covers the `.lib-search` wrapper and its `<input>` that filters the catalog by name/desc substring match. **User explicitly flagged this as missing from v2 `ComponentPalette.tsx`.**

## Prototype JSX (verbatim)

```jsx
      <div className="lib-search">
        <input placeholder="Search widgets…" value={q} onChange={e => setQ(e.target.value)}/>
      </div>
```

Also relevant from the component state and filter logic (lines 619, 621-623):

```jsx
  const [q, setQ] = useState("");
  const filtered = WIDGET_CATALOG.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.desc.toLowerCase().includes(q.toLowerCase())
  );
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .lib-search {
    padding: 12px 18px;
    border-bottom: 1px solid var(--line-2);
  }
  .lib-search input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s, background 0.15s;
  }
  .lib-search input:focus { border-color: var(--accent); background: var(--panel); }
```

Note: prototype uses `var(--accent)` in the `:focus` rule; v2 renamed that token to `var(--brand)` during OMN-42. The substitution is not a finding — it's a documented intentional rename.

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.lib-search` wrapper has 12px/18px padding and a bottom border using `var(--line-2)`; input is full width with 8px/12px padding, 6px border radius, 13px font, `var(--panel-2)` background, `var(--line)` border, no default outline, and 150ms border-color + background transitions; focus state swaps border to `var(--brand)` (proto: `--accent`) and background to `var(--panel)`.
- ☐ **Structure** — v2 `ComponentPalette.tsx` renders a `<div className="lib-search">` containing a single `<input>` element wired to a controlled `q` state via `useState("")` and `onChange`. **Surfacing gap:** if v2 has no search input element at all, file a top-level "missing feature" issue under Structure.
- ☐ **Content** — placeholder text is exactly `Search widgets…` (note the Unicode horizontal ellipsis `…`, U+2026, not three ASCII dots); filter logic matches case-insensitively against both `name` and `desc` of each catalog entry.

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
