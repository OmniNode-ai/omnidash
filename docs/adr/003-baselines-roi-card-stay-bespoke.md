# ADR-003: BaselinesROICard — STAY-BESPOKE decision

- **Status:** Accepted
- **Date:** 2026-04-29
- **Ticket:** OMN-10296
- **Epic:** OMN-10282 — Generic widget primitives (iteration 1)

## Context

The OMN-10282 epic is introducing generic widget primitives (`<KPITileCluster>`, `<TrendChart>`,
`<BarChart>`, `<DataTable>`) to replace hand-rolled dashboard layouts. As part of the audit phase,
every existing bespoke component is evaluated for migration eligibility.

`BaselinesROICard` (`src/components/dashboard/baselines/BaselinesROICard.tsx`) renders two
distinct layout sections in a single card:

1. A 3-column KPI grid of numeric deltas (`tokenDelta`, `timeDeltaMs`, `retryDelta`) with
   conditional colour coding (improved vs regressed).
2. A horizontal recommendation list (`promote`, `shadow`, `suppress`, `fork` counts) separated
   by a rule, with its own heading.

## Decision

**STAY-BESPOKE.** `BaselinesROICard` is not migrated to `<KPITileCluster>` in iteration 1.

## Rationale

`IKPITileClusterAdapter` models a flat array of uniformly structured KPI tiles. It does not have
a slot for a secondary heterogeneous section (the recommendation list). Mapping this component
to `<KPITileCluster>` would require either:

- (a) Stuffing the recommendation list into KPI tiles — semantically wrong and visually
  inconsistent with the rest of the cluster usage.
- (b) Adding a `secondarySlot` or `listSection` prop to `IKPITileClusterAdapter` — a premature
  abstraction driven by a single edge case before the primitive has any other adopters.

Neither option is acceptable at this stage. The bespoke layout is correct and tested.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Migrate delta grid to `<KPITileCluster>` + keep list bespoke | Splits one cohesive card across two rendering strategies; harder to reason about than a single bespoke component. |
| Add `listSection` slot to `IKPITileClusterAdapter` | Premature abstraction — no other widget needs this pattern today. |
| Full migration with flat tiles including recommendation counts | Semantically incorrect — recommendations are not the same kind of metric as delta measurements. |

## Re-evaluate criteria

Revisit this decision **after iteration 1 ships** and `<KPITileCluster>` has at least two
production adopters. At that point:

- If a recurring pattern of "KPI cluster + secondary list section" emerges in another widget,
  add the `listSection` slot to the adapter and migrate both.
- If no such pattern emerges, keep `BaselinesROICard` bespoke indefinitely.

The `MVP_COMPONENTS` registry entry for `baselines-roi-card` is left unchanged.
