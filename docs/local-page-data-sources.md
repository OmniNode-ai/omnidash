# Local dashboard pages and data sources

The browser has six canonical page URLs: `/overview`, `/runs`, `/workflow`, `/usage`,
`/credentials`, and `/api-keys`. `/` redirects to `/overview`. Sidebar links support
normal browser navigation and opening another tab. Runs filters (`status`, `cause`,
`model`, `window`) and its one-based `page` are saved in the query string; defaults
are omitted. Reload and Back/Forward restore that view.

Page URLs are frontend routes. Data continues to use the runtime's existing
Projection API, as specified in [OMN-19981](https://linear.app/omninode/issue/OMN-19981)
and Jonah's savings handoff. The dashboard does not query the underlying database.

## Read path

1. `GET /projections` lists the served topics and their tenant requirements.
2. `GET /projection/<topic>` reads a declared exposure. Supply `?tenant=<tenant UUID>`
   only when the catalogue declares it tenant scoped.
3. `src/pages/local/*.contracts.yaml` declares each component's bindings;
   `src/layout/local-page-loader.ts` loads them through the configured HTTP source.

The local Vite proxy forwards these requests to the configured Projection API.
Production serving must return the frontend entry point for page URLs, while
preserving the existing `/projection/` data path.

## Page bindings

All topic suffixes below have the prefix `onex.snapshot.projection.`.

| Page | Declared exposures | Data still owned upstream |
| --- | --- | --- |
| Overview | `cost.savings-overview.v1`, `delegation.decisions.v1`, `delegation.savings.v1` | Metering summary (OMN-19977), daily spend (OMN-20007), efficiency (OMN-20009) |
| Runs | `delegation.decisions.v1`, `delegation.savings.v1` | Backend fields (OMN-20162), typed causes (OMN-19448), run detail (OMN-19920) |
| Workflow | `delegation.decisions.v1` | Full ordered run trace (OMN-19987) |
| Usage | `usage-by-model-day.v1` | Populated, tenant-scoped usage (OMN-19978 / OMN-20006) |
| Credentials | `tenant-credentials.v1` | Credential reference events (OMN-19985) |
| API Keys | `delegation.savings.v1` for the served tenant identity | Minted local identity (OMN-19986); cloud keys remain `CLOUD_NOT_LINKED` |

Runs joins the decisions' `correlation_id` to the savings sessions' `session_id`.
The savings envelope contains `sessions[]`; it is not one envelope per run.
Unknown or unpriced values retain their typed states instead of becoming zero.
Credential displays use references and never secret values.

## Availability readback

At `2026-10-03T02:57:14.526646+00:00`, the lab Projection API served all five unique
page topics with HTTP 200: 66 decisions, 66 savings sessions, one overview row,
zero credential rows and zero usage rows. The catalogue contained no topic
matching `run-trace`, `metering-summary`, or `local-identity`. This is a dated
readback, not a promise about later availability. Usage was not declared tenant
scoped, so its request omitted the tenant query parameter.

The safe, field-name/count-only readback is retained in the workspace at
`local-workflow/records/readbacks/OMN-19981-live-data-20261003.json`.
