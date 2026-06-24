# Changelog

All notable changes to `omnidash` are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
