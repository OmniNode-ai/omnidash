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
status: audited
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

- No issues found.

(All six prototype properties for `.widget-title` match `src/styles/dashboard.css:79-85` exactly: `font-size: 13px`, `font-weight: 600`, `letter-spacing: 0.01em`, `text-transform: uppercase`, `color: var(--ink-2)`, and the `display: flex; align-items: center; gap: 8px` triplet. All five properties for `.widget-live` match `src/styles/dashboard.css:86-91`: inline-flex layout, `gap: 5px`, `font-size: 10px`, `font-weight: 500`, `color: var(--status-ok)`, `text-transform: uppercase`, `letter-spacing: 0.08em`. The `.widget-live::before` block at `src/styles/dashboard.css:92-96` reproduces the dot verbatim: 6×6, `border-radius: 50%`, `background: currentColor`, `box-shadow: 0 0 0 2px oklch(70% 0.15 145 / 0.2)`, `animation: pulse 2s ease-in-out infinite`. The `@keyframes pulse` definition lives at `src/styles/sidebar.css:127` — reachable at runtime since both stylesheets are loaded globally, so the animation resolves.)

### Structure

**Issue [CRITICAL]**: `.widget-live` rendered as sibling of `.widget-title` instead of as a child
- Prototype: `src/app.jsx:601-605` — `<div className="widget-title">{w.title}{… && <span className="widget-live">Live</span>}</div>`; the live badge is a **child** of the title div, and the title element is a `<div>`.
- v2: `src/components/dashboard/ComponentWrapper.tsx:36-40` — `<div className="widget-head-left"><span className="widget-title">{title}</span></div><span className="widget-live">Live</span>`; the title is a `<span>` (not a `<div>`), and the live badge is placed **outside** `.widget-head-left` entirely, as a direct child of `.widget-head`.
- Impact: Because `.widget-head` has `justify-content: space-between`, the live badge floats to the far right of the header (where the kebab menu belongs in the prototype) instead of sitting immediately to the right of the title text with an 8px gap. This reads as a different component — the "Live" indicator no longer visually labels the widget; it becomes a standalone header-right element. Additionally, since `.widget-title` provides its own `display: flex; gap: 8px`, the intended 8px title↔badge spacing is lost and replaced by whatever flex distribution `.widget-head` chooses.

### Content

**Issue [CRITICAL]**: Live badge rendered unconditionally; prototype restricts it to `["requests","logs","regions"]`
- Prototype: `src/app.jsx:603` — `{["requests","logs","regions"].includes(w.type) && <span className="widget-live">Live</span>}`.
- v2: `src/components/dashboard/ComponentWrapper.tsx:39` — `<span className="widget-live">Live</span>` rendered with no predicate. The file's own header comment at line 8 acknowledges this: "Widget `Live` badge rendered unconditionally (prototype ties it to real-time state)."
- Impact: Every widget in the dashboard — including static/non-streaming widgets that have no live data source — displays a pulsing green "LIVE" indicator. This is a direct factual misrepresentation of widget state to the user and dilutes the signal value of the badge for the widgets where it actually belongs (requests, logs, regions). `ComponentWrapper` also has no access to `w.type`, so fixing this requires threading the widget type (or a boolean `isLive` prop) through the wrapper's props interface.

**Issue [MINOR]**: Title element is `<span>` in v2 vs `<div>` in prototype
- Prototype: `src/app.jsx:601` — `<div className="widget-title">`.
- v2: `src/components/dashboard/ComponentWrapper.tsx:37` — `<span className="widget-title">`.
- Impact: No visible effect for a single-line uppercase title since `.widget-title` sets `display: flex` regardless of element. Flagged for verbatim-fidelity tracking only; not a user-visible bug on its own, but it is the reason the nested-badge structure from the prototype could not be reproduced (the badge is currently outside the span instead of inside it).

## Resolution

(filled by orchestrator after fixes are applied; one-line pointer to the fix commit)
