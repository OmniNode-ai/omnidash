# Changelog

All notable changes to `omnidash` are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.1.7 (2026-10-08)

### Fixed

- Runs, Recent runs and Last run show a run's status and cost on `onex dashboard`. The local store serves a gate verdict as 1/0, which now reads as passed/failed, and a run's cost falls back to the decision row's own `cost_usd` when no savings session is served. A cost never measured stays Not recorded. Every per-run cost prints in dollars with at least two decimals, unrounded (OMN-20753).

## v1.1.6 (2026-10-08)

### Features
- The Overview shows Baseline spend: the served `counterfactual_usd` of metering-summary.v1's all-time
  row, the figure `onex metering --json` reports, beside the baseline model and pricing manifest it is
  priced at. With no baseline resolved it shows Baseline unresolved, never $0 (OMN-20752)

## v1.1.5 (2026-10-08)

### Fixes
- The local dashboard reads tenant-scoped exposures as the tenant its server declares in
  `GET /projections`, so the released bundle served by `onex dashboard` no longer shows every scoped
  panel as Tenant not configured. A build-time tenant still wins where one is set, and with neither
  the read is still refused before it is sent (OMN-20728)

## v1.1.4 (2026-10-06)

Cuts a release so the static bundle has a versioned artifact to be published against. The
local-mode pages (Overview, Workflow, Runs, Usage, Credentials, API Keys) have only ever existed on
`dev`: v1.1.3 predates `src/pages/local` entirely, so no existing release could carry them and
`onex dashboard` had nothing it could pull.

### Features
- Publish the static build as a release asset with its sha256, so `onex dashboard` can download and
  verify it on a machine with no Node and no checkout (#366)

### Notes
- v1.1.1 through v1.1.3 were tagged without changelog entries and are not backfilled here.

## v1.0.0 (2026-05-21)

First GitHub Release artifact for omnidash. The composable widget dashboard has been on `package.json` v1.0.0 for the active feature wave; this release tags the current main state as the canonical v1.0.0 reference point.

Coordinated as part of the 2026-05-21 full org-wide release wave 2.

### Features
- Live work event viewer + delegation run token metrics + token savings display (#95, #98, #99)
- Dashboard MCP tools widget (#93)
- Dependency health dashboard widget (#89)
- Playwright proof — dashboard updates after fresh delegation (#91)
- Flip contract.yaml default from sqlite to postgres (#88)
- Implement postgres projection reader for Express bridge (#86, #87)
- Wire delegation refs scanner as CI gate + pre-commit hook (#84)
- Contract-backed delegation data adapter (#82)
- Wire delegation dashboard projection data (#80)
- Wire reviewdog caller workflow (#81)
- Migrate runner selector to vars.OMNI_TRUSTED_CI_RUNS_ON_JSON (#79)
- Add sqlite-projection-reader cases for 8 empty widget topics (#78)

### Fixes
- Keep omnidash demo from crashing and omit zero-token savings rows (#96, #97)
- Supply cost-by-model fieldMappings via widget-specific adapters (#92)
- Compact dashboard chart canvases (#90)
- Wire skip-token rejection CI gate (#85)

### Notes
- No PyPI publish; this is a JS/Vite frontend release.
- First GitHub Release artifact published for this repo.
