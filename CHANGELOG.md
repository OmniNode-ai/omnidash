# Changelog

All notable changes to `omnidash` are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.0.0 (2026-05-21)

First GitHub Release artifact for omnidash. The composable widget dashboard has been on `package.json` v1.0.0 for the active feature wave; this release tags the current main state as the canonical v1.0.0 reference point.

Coordinated as part of the 2026-05-21 full org-wide release wave 2.

### Features
- feat: live work event viewer + delegation run token metrics + token savings display (#95, #98, #99)
- feat: dashboard MCP tools widget (#93)
- feat: dependency health dashboard widget (#89)
- feat: Playwright proof — dashboard updates after fresh delegation (#91)
- feat: flip contract.yaml default from sqlite to postgres (#88)
- feat: implement postgres projection reader for Express bridge (#86, #87)
- feat: wire delegation refs scanner as CI gate + pre-commit hook (#84)
- feat: contract-backed delegation data adapter (#82)
- feat: wire delegation dashboard projection data (#80)
- feat: wire reviewdog caller workflow (#81)
- feat: migrate runner selector to vars.OMNI_TRUSTED_CI_RUNS_ON_JSON (#79)
- feat: add sqlite-projection-reader cases for 8 empty widget topics (#78)

### Fixes
- fix: keep omnidash demo from crashing + omit zero-token savings rows (#96, #97)
- fix: supply cost-by-model fieldMappings via widget-specific adapters (#92)
- fix: compact dashboard chart canvases (#90)
- fix: wire skip-token rejection CI gate (#85)

### Notes
- No PyPI publish; this is a JS/Vite frontend release.
- First GitHub Release artifact published for this repo.
