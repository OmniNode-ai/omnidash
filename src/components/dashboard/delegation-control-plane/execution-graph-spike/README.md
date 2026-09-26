# Execution graph renderer spike

## First-slice renderer decision

On 2026-09-26, the SVG adapter was selected for the first slice after comparing it with `@gitgraph/js` on the same five-hop Core fold output. SVG shows the recorded parent links as directed edges, includes each node's source offset and replay status, and exposes every node as a keyboard-operable button that updates the evidence inspector. GitGraph's vertical lanes are compact and show status/topic labels, but the branch paths have no directed arrows and source positions are not visible per node; the relationship and provenance are less explicit.

The comparison is reproducible with:

```sh
npx playwright test --config playwright.execution-graph.config.ts tests/execution-graph-e2e/renderer-comparison.spec.ts
```

Visual proof: [`execution-graph-renderer-comparison-real-five-hop.png`](../../../../../tests/screenshots/execution-graph-renderer-comparison-real-five-hop.png).

## Fixture and scope

`__fixtures__/realFiveHopGraph.json` is a byte-for-byte copy of the serialized Core fold fixture. It contains five `hop` nodes, four recorded edges, zero unresolved references, and topology SHA-256 `0505ab0b163492380739a15646c0442a3ecfb54efb0acb53bc23d232640fbfd3`. Both renderers consume the same `ModelExecutionGraph` instance. The separate reroute-collision input is refusal evidence and is not drawn in this first slice.

`ExecutionGraphView` uses only the SVG adapter. GitGraph remains in the comparison harness as evidence only; its dependency is pinned as a dev dependency. Cursor controls are explicitly provisional because the current Core request is Kafka-offset-bounded and does not claim append-invariant history.
