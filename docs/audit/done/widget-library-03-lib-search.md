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
status: done
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

- No issues found. The `.lib-search` and `.lib-search input` / `.lib-search input:focus` rules in `src/styles/library.css:26-40` are a verbatim port of the prototype's CSS (lines 462-476) with the documented `--accent` → `--brand` token rename on the focus rule (library.css:40). All padding (12px 18px wrapper, 8px 12px input), 6px radius, 13px font, `var(--panel-2)` background, `var(--line)` border, `outline: none`, and 150ms `border-color`/`background` transitions match exactly. Note that the CSS rules are currently dead code because no markup targets them — the missing-markup issue is logged under Structure.

### Structure

**Issue [CRITICAL]**: `.lib-search` wrapper and its `<input>` are entirely absent from v2 (user-flagged missing feature).
- Prototype: `src/app.jsx:638-640` renders `<div className="lib-search"><input placeholder="Search widgets…" value={q} onChange={e => setQ(e.target.value)}/></div>` between `.lib-head` and the card list, with `q`/`setQ` state declared at `src/app.jsx:619` and a substring filter at `src/app.jsx:621-623`.
- v2: `src/components/dashboard/ComponentPalette.tsx:37-43` jumps straight from the `.lib-head` block to the `.lib-body` group iteration — there is no `lib-search` div, no `<input>`, no `useState` for a query string, and no filter step over `components`. The source comment at `ComponentPalette.tsx:7` ("No search, no drag, no slide-in animation yet — those are OMN-44 scope") acknowledges the gap.
- Impact: Users cannot filter the widget catalog. As the catalog grows, the palette becomes a long scrolling list with no way to narrow to a specific widget by name or description. The `.lib-search` CSS rules in `library.css:26-40` are orphaned (no DOM element consumes them).

### Content

- No issues found — content-level checks (placeholder string exactness, case-insensitive substring match across `name` and `desc`) are moot because the element does not exist in v2. They will need to be re-verified once the CRITICAL Structure gap is fixed.

## Resolution

Fixed in commit `4145b96` — feat(ui): port EmptyState + WidgetLibrary missing structure [OMN-48].
