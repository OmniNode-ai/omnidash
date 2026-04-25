# Widget Configuration Audit

Per-widget audit of the **Configure Widget** modal: what fields the
manifest declares, whether the widget actually reads them, and a
recommendation for each.

Methodology: read every widget's `config: Record<string, unknown>`
destructure (the only place a manifest field is consumed at runtime),
then cross-reference against the `configSchema` block in
`scripts/generate-registry.ts`.

Definitions:
- **Wired** — the widget reads the field and changes behavior accordingly.
- **Stub** — the field is declared in the schema and renders a form
  control, but the widget ignores it (silent no-op).
- **Missing** — a field a user would reasonably expect, not in the schema.

---

## Cost Trend (cost-trend-panel)

| Field | Schema | Status | Notes |
|---|---|---|---|
| `granularity` | `enum: ['hour', 'day']`, default `'hour'` | **Wired** | Switches bucket aggregation. |
| `chartType` | `enum: ['area', 'bar']`, default `'area'` | **Wired** | Toggles stacked area vs stacked bar. |
| `showBudgetLine` | `boolean`, default `true` | **Stub** | The widget renders no budget line and there's no budget projection feeding it. The toggle does nothing. |

**Recommendation**

- **Drop `showBudgetLine`** unless we plan to add a budget feed. Right
  now it's a checkbox that does nothing — confusing.
- **Consider adding** `topNModels` (`number`, default 6, range 2–12) to
  cap the legend at the top-N spenders and roll the rest into "Other".
  This widget can get crowded once 8+ models register, and the user
  can already see the unfiltered list elsewhere.
- **Consider adding** a `chartHeight` enum (`'compact' | 'normal' |
  'tall'`) so users can squeeze the chart into a narrow row without
  fighting the grid resize.

---

## Cost Trend (3D) (cost-trend-3d)

| Field | Schema | Status | Notes |
|---|---|---|---|
| _(none)_ | `properties: {}` | — | Modal opens with no fields. |

**Recommendation**

- **Leave it empty.** The 3D widget is an exploratory visualization
  whose interactions are camera controls (drag pitch, scroll
  timeline). There's no static-config decision a user would tweak
  per-instance.
- _Maybe_ a `cameraPreset` enum (`'overview' | 'side' | 'top-down'`)
  for users who want the same starting angle every time, but that's
  a nice-to-have, not a gap.

---

## Cost by Model Pie (cost-by-model)

| Field | Schema | Status | Notes |
|---|---|---|---|
| _(none)_ | `properties: {}` | — | Modal opens with no fields. |

**Recommendation**

- **Add `topNModels`** (`number`, default 6, range 2–10). The pie
  becomes unreadable past ~8 slices; collapsing the long tail into a
  single "Other" wedge is a standard pattern users will expect.
- **Add `showPercentages`** (`boolean`, default `true`). Some users
  want absolute dollar labels instead of percentages — currently
  there's no way to switch.

---

## Delegation Metrics (delegation-metrics)

| Field | Schema | Status | Notes |
|---|---|---|---|
| `showSavings` | `boolean`, default `true` | **Stub** | The "Cost Savings" stat always renders; the toggle is ignored. |
| `showQualityGates` | `boolean`, default `true` | **Stub** | The "Quality Gate Pass Rate" stat always renders; the toggle is ignored. |

**Recommendation**

- **Wire both existing toggles.** They're well-chosen options; the
  widget just has no `if (config.showSavings)` guard around the stat
  blocks. Each is a 1-line conditional render.
- **Add `qualityGateThreshold`** (`number`, default `0.8`, range 0–1).
  The 80% threshold that drives the green-vs-warn color is hardcoded
  in `DelegationMetrics.tsx`. The same field already exists in
  Quality Score Panel as `passThreshold` — duplicate the convention
  here so users can tune the bar.
- **Consider** a `headlineLayout` enum (`'stacked' | 'inline'`)
  controlling whether the three stats stack vertically (current) or
  flow horizontally for narrow widget placements.

---

## Routing Decisions (routing-decision-table)

| Field | Schema | Status | Notes |
|---|---|---|---|
| `pageSize` | `number`, default `20` | **Stub** | The widget hardcodes `const PAGE_SIZE = 25`. The schema default doesn't even match. |

**Recommendation**

- **Wire `pageSize`** — the widget should read `config.pageSize ??
  25`. Reconcile the default with the hardcoded value (pick one).
  Bonus: convert the field to an `enum: [10, 25, 50, 100]` so users
  pick from sensible page sizes instead of typing arbitrary numbers.
- **Add `defaultSort`** (`enum: ['created_at_desc', 'cost_desc',
  'agreement_asc']`). Users who care about cost overruns want the
  table sorted by Cost desc on load; users debugging routing want
  it by timestamp. The current insertion-order default rarely fits.
- **Consider `visibleColumns`** (multi-select of column keys) for
  narrow placements where Cost / LLM Conf. / Fuzzy Agent could be
  hidden. Useful only once multiple widgets get crammed onto a
  single dashboard.

---

## Baselines ROI Card (baselines-roi-card)

| Field | Schema | Status | Notes |
|---|---|---|---|
| _(none)_ | `properties: {}` | — | Modal opens with no fields. |

**Recommendation**

- **Leave it empty.** The card surfaces a fixed set of summary numbers
  (token delta, time delta, retry counts, promotion recommendations).
  No knob the user could turn would change the view meaningfully —
  the data shape is the data shape.

---

## Quality Score Panel (quality-score-panel)

| Field | Schema | Status | Notes |
|---|---|---|---|
| `passThreshold` | `number` 0–1, default `0.8` | **Wired** | Drives the headline pass-rate number and the translucent "wall" behind the bars. |

**Recommendation**

- **Already in good shape** — one field, well-described, actually
  used.
- _Optional_ `binCount` (`number`, default 10) to control the
  histogram resolution. Users on narrow placements might want
  fewer, taller bars; users with a lot of data might want finer
  bins. Low priority.

---

## Readiness Gate (readiness-gate)

| Field | Schema | Status | Notes |
|---|---|---|---|
| _(none)_ | `properties: {}` | — | Modal opens with no fields. |

**Recommendation**

- **Add `compactMode`** (`boolean`, default `false`). When true, render
  only the overall status pill + last-checked timestamp; hide the
  per-dimension table. The full table is great for drill-down but
  takes a lot of vertical space when a user just wants the headline.
- **Add `dimensionOrder`** (multi-select / drag-order of the 7
  dimensions). Different teams care about different dimensions
  first; today the order is fixed. Lower priority but real.

---

## Event Stream (event-stream)

| Field | Schema | Status | Notes |
|---|---|---|---|
| `maxEvents` | `number`, default `200` | **Wired** | Caps in-memory buffer. |
| `autoScroll` | `boolean`, default `true` | **Wired** | Scroll-to-newest unless user has manually scrolled up. |

**Recommendation**

- **Already in solid shape.**
- **Consider `sourceFilter`** (`array of string`) and `eventTypeFilter`
  (`array of string`). The widget already has a search box, but a
  per-widget pinned filter ("only show errors from omnimarket") is a
  recurring dashboard pattern.
- _Optional_ `compactRows` (`boolean`, default `false`) to drop the
  source pill at narrow widths.

---

## Cross-cutting observations

1. **Three stubs to clean up before shipping**: `showBudgetLine`,
   `showSavings`, `showQualityGates`. Each is a checkbox that lies
   to the user. Either wire them (the latter two are 1-line fixes)
   or remove them.

2. **One mismatched default**: `routing-decision-table.pageSize`
   schema default is `20`, code hardcodes `25`. Fix the wiring and
   pick one.

3. **Pattern duplication opportunity**: Quality Score has
   `passThreshold` (0–1) and Delegation Metrics has the same concept
   hardcoded. If both surface the option, reuse the field name and
   description so the modal feels consistent across widgets.

4. **Three widgets have empty schemas** (Cost Trend 3D, Cost by
   Model, Baselines ROI, Readiness Gate). Two of them (Cost by
   Model, Readiness Gate) have obvious additions a user would
   appreciate. The other two are fine empty.

5. **No widget surfaces a `title` override**. Users sometimes want
   "Cost — Last 7d" instead of "Cost Trend". Adding a single
   `title?: string` field (with the manifest displayName as
   fallback) would be a low-cost universal improvement and could
   live on the manifest base rather than per-widget.
