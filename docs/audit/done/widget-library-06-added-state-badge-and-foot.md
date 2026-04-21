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
status: done
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

- No issues found. `.lib-card.added` (library.css:62), `.lib-card-added-badge` (library.css:74-78), `.lib-foot` (library.css:79-84), and `.lib-foot .hint` (library.css:85) are all present in `src/styles/library.css` and match the prototype values verbatim (opacity 0.5 / cursor default / dashed border; 10px uppercase 0.06em letter-spacing `--ink-3` 600 weight 4px margin-top; 12px/18px padding, 1px `--line` top border, flex space-between, 12px `--ink-3`; IBM Plex Mono for `.hint`).

**Issue [MINOR]**: `.lib-card.added` applied for wrong semantic state
- Prototype: `.lib-card.added` modifier marks widgets that are already placed on the dashboard; the opacity/dashed styling communicates "already added" (prototype JSX line 25; CSS line 54).
- v2: `className={\`lib-card${disabled ? ' added' : ''}\`}` applies the `added` modifier when `c.status !== 'available'` (ComponentPalette.tsx:58, 51). The styling is visually identical, but it's being used to convey "not implemented" rather than "already on dashboard".
- Impact: User sees the dashed/faded treatment for stub widgets instead of for widgets they've already placed, inverting the intended semantic. Not a visual fidelity issue per-se, but the class is being re-purposed (and the source comment on lines 11-12 acknowledges this deviation).

### Structure

**Issue [CRITICAL]**: Footer `<div className="lib-foot">` missing entirely
- Prototype: After the `.lib-body` closes, renders `<div className="lib-foot">` containing a `<span>` with the catalog count and a `<span className="hint">drag or click</span>` (prototype JSX lines 39-42).
- v2: No footer is rendered. `ComponentPalette.tsx` closes `.lib-body` on line 79 and returns immediately after the `</aside>` on line 80 — there is no `.lib-foot` element anywhere.
- Impact: User never sees the total-widgets count or the drag/click hint; the entire footer region of the rail is absent.

**Issue [CRITICAL]**: Empty-state `<div>` (no results) missing
- Prototype: When `filtered.length === 0`, renders `<div style={{padding:"40px 10px", textAlign:"center", color:"var(--ink-3)", fontSize:13}}>No widgets match "{q}"</div>` inside `.lib-body` (prototype JSX lines 33-37).
- v2: `ComponentPalette.tsx` iterates `COMPONENT_CATEGORIES` and `return null` for empty groups (line 46), but has no check for an overall empty filtered set and no empty-state element. (The component also has no search input / `q` state yet, per the file header comment on line 7, so the condition cannot fire even if the div existed.)
- Impact: If a future search filters everything out (or all categories are empty), the rail simply shows an empty body with no explanatory text.

**Issue [MAJOR]**: `.lib-card-added-badge` gated on wrong condition
- Prototype: Badge renders inside `.lib-card-info` when `addedTypes.has(c.id)` — i.e., when the widget type already appears in `active.widgets` (prototype JSX line 25; `addedTypes` computed at line 48 of the quoted block / proto src line 620).
- v2: Badge renders when `disabled` (`c.status !== 'available'`) — see `ComponentPalette.tsx:71` and line 51. There is no `addedTypes` set, no reference to active dashboard widgets, and no prop carrying that info.
- Impact: Badge never appears for widgets actually on the dashboard; appears instead on "not implemented" stubs. The "already on dashboard" signal the prototype provides is absent.

**Issue [MAJOR]**: `.lib-card` className lacks `added` modifier for "already on dashboard" state
- Prototype: Per audit checklist, v2 should apply the `added` modifier class when `addedTypes.has(c.id)` is true (chunk audit checklist, Structure bullet, paragraph on ternary).
- v2: Template literal on `ComponentPalette.tsx:58` only toggles `added` on `disabled`; never on an "already placed" check. The component receives no signal about which widgets are currently on the canvas.
- Impact: Widgets already on the dashboard aren't visually dimmed/dashed in the rail, so the user cannot tell at a glance which widgets they've already added.

### Content

**Issue [MAJOR]**: Badge text differs from prototype
- Prototype: Badge text is exactly `· Already on dashboard` (middle dot U+00B7, space, then `Already on dashboard`) — prototype JSX line 26.
- v2: Badge text is `· not implemented` (ComponentPalette.tsx:71). The middle dot is present but the trailing copy is different and lowercase.
- Impact: When the badge does show, it communicates a different status than the prototype intends; also breaks the uppercase treatment's intended tone because the source text isn't capitalized like `Already on dashboard`.

**Issue [CRITICAL]**: Empty-state text `No widgets match "{q}"` missing
- Prototype: Renders literal `No widgets match "{query}"` with surrounding double quotes around the interpolated search term (prototype JSX lines 34-36).
- v2: No empty-state element exists at all in `ComponentPalette.tsx` (file ends at line 82 with no empty-state branch).
- Impact: No feedback to the user when a search yields no results.

**Issue [CRITICAL]**: Footer count text `{N} widgets available` missing
- Prototype: Left `<span>` in `.lib-foot` renders `{WIDGET_CATALOG.length} widgets available` (prototype JSX line 40).
- v2: Footer does not exist (see Structure finding above), so the count text is absent.
- Impact: User never sees how many widgets the catalog contains.

**Issue [CRITICAL]**: Footer hint text `drag or click` missing
- Prototype: Right `<span className="hint">` renders exactly `drag or click` (prototype JSX line 41).
- v2: Footer does not exist, so the hint is absent.
- Impact: User gets no affordance guidance about how to use the library rail.

## Resolution

Fixed in commit `4145b96` — feat(ui): port EmptyState + WidgetLibrary missing structure [OMN-48].
