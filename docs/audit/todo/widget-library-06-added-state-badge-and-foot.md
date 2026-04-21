---
id: widget-library-06
component: WidgetLibrary
prototype_jsx:
  file: src/app.jsx
  lines: "658-675"
prototype_css:
  file: OmniDash.html
  lines: "498, 510-521"
v2_targets:
  - src/components/dashboard/ComponentPalette.tsx
  - src/styles/library.css
status: todo
dependencies: []
blocked_reason: null
---

# widget-library-06 — `.lib-card.added` state, `.lib-card-added-badge`, empty state, and `.lib-foot`

Covers the "already added" card modifier (`.lib-card.added`), the inline `.lib-card-added-badge` label, the no-results empty state, and the footer `.lib-foot` with the catalog count + drag/click hint.

## Prototype JSX (verbatim)

```jsx
                  {addedTypes.has(c.id) && (
                    <div className="lib-card-added-badge">· Already on dashboard</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{padding:"40px 10px", textAlign:"center", color:"var(--ink-3)", fontSize:13}}>
            No widgets match "{q}"
          </div>
        )}
      </div>
      <div className="lib-foot">
        <span>{WIDGET_CATALOG.length} widgets available</span>
        <span className="hint">drag or click</span>
      </div>
```

Also relevant from the component's `addedTypes` computation (line 620) — used by the proto's `className` template literal even though both ternary branches are currently empty strings:

```jsx
  const addedTypes = new Set(active.widgets.map(w => w.type));
```

## Prototype CSS (verbatim, scoped to elements above)

```css
  .lib-card.added { opacity: 0.5; cursor: default; border-style: dashed; }
  .lib-card-added-badge {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--ink-3); font-weight: 600;
    margin-top: 4px;
  }
  .lib-foot {
    padding: 12px 18px;
    border-top: 1px solid var(--line);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; color: var(--ink-3);
  }
  .lib-foot .hint { font-family: "IBM Plex Mono", monospace; }
```

## Audit checklist

Walk each axis completely. Each ☐ must become either ✅ "no issues" or a populated **Issue:** block below.

- ☐ **Design** — `.lib-card.added` reduces opacity to 0.5, sets cursor to `default`, and switches `border-style` to `dashed`. `.lib-card-added-badge` is 10px uppercase with 0.06em letter-spacing, `var(--ink-3)` color, 600 weight, 4px top margin. `.lib-foot` has 12px/18px padding, 1px top border using `var(--line)`, flex with space-between, 12px font, `var(--ink-3)` color; `.lib-foot .hint` uses `"IBM Plex Mono", monospace`.
- ☐ **Structure** — v2 conditionally renders `<div className="lib-card-added-badge">` inside `.lib-card-info` only when the widget type is already on the dashboard (`addedTypes.has(c.id)`). Empty state renders a single `<div>` with centered 13px `var(--ink-3)` text when `filtered.length === 0`. Footer is `<div className="lib-foot">` containing two `<span>`s: the count and a `.hint` span. Also verify the `.lib-card` className template literal correctly applies the `added` modifier class when `addedTypes.has(c.id)` is true — the prototype source has both ternary branches as empty strings (a proto bug), so v2 should apply `added` when true, empty string otherwise.
- ☐ **Content** — badge text is exactly `· Already on dashboard` (leading middle dot `·`, U+00B7, then a single space, then `Already on dashboard`). Empty-state text is exactly `No widgets match "{q}"` with literal double quotes wrapping the query. Footer left text is `{WIDGET_CATALOG.length} widgets available`; footer right `.hint` text is exactly `drag or click`.

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
