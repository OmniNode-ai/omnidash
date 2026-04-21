---
id: widget-card-03
component: WidgetCard
prototype_jsx:
  file: src/app.jsx
  lines: "601-605"
prototype_css:
  file: OmniDash.html
  lines: "365-382"
v2_targets:
  - src/components/dashboard/ComponentWrapper.tsx
  - src/styles/dashboard.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-card-03 — `.widget-title` and `.widget-live` badge (with pulsing pseudo-element)

Covers the widget title block: the `<div className="widget-title">` containing the widget's `title` text, and the conditional `<span className="widget-live">Live</span>` badge that appears only when `w.type` is one of `"requests"`, `"logs"`, or `"regions"`. The live badge carries a pulsing dot rendered via `::before`.

## Prototype JSX (verbatim)

```jsx
          <div className="widget-title">
            {w.title}
            {["requests","logs","regions"].includes(w.type) && <span className="widget-live">Live</span>}
          </div>
        </div>
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .widget-title {
    font-size: 13px; font-weight: 600;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    color: var(--ink-2);
    display: flex; align-items: center; gap: 8px;
  }
  .widget-live {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 500;
    color: var(--status-ok);
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .widget-live::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; box-shadow: 0 0 0 2px oklch(70% 0.15 145 / 0.2);
    animation: pulse 2s ease-in-out infinite;
  }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — every CSS property in the prototype block above has a matching rule in `src/styles/dashboard.css` with identical values: title typography (13px / 600 / uppercase / 0.01em letter-spacing / `--ink-2`), live badge typography (10px / 500 / uppercase / 0.08em letter-spacing / `--status-ok`), and the `::before` dot (6×6, 50% radius, `currentColor` fill, `oklch(70% 0.15 145 / 0.2)` 2px halo, `pulse 2s ease-in-out infinite` animation). The `@keyframes pulse` definition must exist elsewhere in the stylesheet.
- ☐ **Structure** — v2 `ComponentWrapper.tsx` has a `<div className="widget-title">` child of `.widget-head-left` containing the title text followed by a conditionally rendered `<span className="widget-live">` sibling. The closing `</div>` of `.widget-head-left` appears after `.widget-title`.
- ☐ **Content** — the "Live" badge renders the literal text `Live` (capitalized, not "LIVE" or "live"; uppercase is applied via CSS `text-transform`). The live-badge predicate matches exactly the type set `["requests","logs","regions"]` — no additions, no omissions, no renames.

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
