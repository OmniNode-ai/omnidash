# Dashboard One-Backend Sweep — OMN-12833 (A2.5)

**Ticket:** OMN-12833 · **Track:** A2.5 (close-the-loop plan) · **Date:** 2026-06-08
**Gate tier:** Tier-1 HARD demo gate
**Single backend:** `http://<onex-host>:13002` (stability-test Postgres-backed projection API)
**Backend access model:** browser issues **same-origin** `/projection/{topic}` requests; the
Vite serving layer proxies them 1:1 to the single backend (`vite.proxy-config.ts`,
`VITE_PROJECTION_API_URL`). This is one backend — not a merge proxy fronting two — and it
avoids cross-origin CORS failures (the projection API serves no `access-control-allow-origin`).

## Accepted configuration (the only source config)

```text
VITE_DATA_SOURCE=http
VITE_PROJECTION_API_URL=http://<onex-host>:13002
VITE_HTTP_DATA_SOURCE_URL=http://<onex-host>:13002
```

## Component matrix summary (32 registry components)

| Class | Count |
|-------|-------|
| visible / projection-backed | 8 |
| visible / degraded-labeled | 2 |
| hidden / hidden | 22 |

- **Visible / projection-backed (8):** delegation-metrics, routing-decision-table,
  delegation-savings, delegation-cost-comparison, delegation-model-routing,
  delegation-quality-gate, delegation-token-usage, delegation-control-plane
  (the delegation chain + the SEA-style control plane incl. the artifact panel).
- **Visible / degraded-labeled (2):** context-effectiveness-heatmap (the 100-run experiment
  keep-set; `context.experiment-scores.v1`=404, renders OMN-11241 research fixture state
  labeled degraded), evidence-pipeline-flow (`evidence_pipeline.*`=200/0 rows, truthful empty).
- **Hidden / hidden (22):** everything whose single-backend topic returns 404 (no
  producer / no `projection_api: expose`) or 503 (table missing) — plus **event-stream**,
  which returns 200/100 rows on `registration.v1` BUT the row shape
  (`service_name/service_type/health_status/...`) does not match the widget's required
  `StreamEvent` shape (`event_type/source/correlation_id/timestamp`), so feeding it the
  mismatched shape crashes the render. Per the A2.5 failure policy it is hidden, not
  back-fed from a non-authoritative source.

Full per-component probe data (HTTP status, row count, freshness, decision) is in
`component-matrix.json`.

## Playwright network proof

`playwright-network-projection.txt` — captured against a fresh dashboard populated with
the visible keep-set widgets, running with ONLY the single backend configured.

- Every `/projection/{topic}` request hits the **same single origin** (`localhost:5174`
  → proxied to `<onex-host>:13002`).
- All visible projection-backed topics returned **HTTP 200**.
- `context.experiment-scores.v1` returned **404** (the degraded-labeled widget; truthful state).
- **ZERO** requests to `:8765`, `:3010`, `:3002` (the dead dev bridge), committed
  fixtures (`/_fixtures`), or any bespoke API route — verified with a static-inclusive
  filter that returned no matches.
- **Zero** widgets in the `This widget failed to load` error state on the populated dashboard.

## Render proof

- `desktop-fullpage.png` — full-page desktop (1440×900): delegation control plane (Live + Stale
  authority labels, 38 runs, 42% quality pass, $0.72 savings, recent-runs table), routing
  decisions (truthful "No routing decisions" empty state), delegation savings ($1.82 vs Opus).
- `mobile-fullpage.png` — full-page mobile (390×844).
- `palette-authority-labels.png` — widget library showing per-card authority labels
  (`· projection-backed` / `· degraded` / `· hidden`) and hidden cards greyed out.
- `visible-text-desktop.txt` — full rendered body text.

## Authority-label capture

Accepted dashboard proof packets must record, for every demo-visible panel:

- the manifest `authorityLabel` (`projection-backed`, `runtime-observed`, `degraded`, or `hidden`);
- the screenshot that shows the panel label;
- the browser network trace proving `/projection/{topic}` requests use the single intended backend;
- the projection/API rows used for accepted evidence, including the shared correlation id when a run is being proven.

`degraded` and `hidden` labels are exclusionary for projection proof. A nonblank UI is not proof; fresh projection-backed, correlation-linked data is proof.

## Backend manifest

`backend-manifest.json` — `/health` (`{status:ok, postgres:ok}`), the full `/projections`
topic manifest, and the explicit rejected-origin list.

## Failure policy applied

No visible component is fed from a non-authoritative source. Any component that could not
be truthfully backed by the single projection API today (404, 503, or 200-with-wrong-shape)
was **hidden** — the backend was never swapped or augmented to keep a widget visible.
