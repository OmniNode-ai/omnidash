# Changelog

All notable changes to `omnidash` are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.0.0 (2026-05-21)

First GitHub Release artifact for omnidash. The composable widget dashboard has been on `package.json` v1.0.0 for the active feature wave; this release tags the current main state as the canonical v1.0.0 reference point.

Coordinated as part of the 2026-05-21 full org-wide release wave 2.

### Features
- feat(OMN-11299): live work event viewer + delegation run token metrics + token savings display (#95, #98, #99)
- feat(OMN-11258): dashboard MCP tools widget (#93)
- feat(OMN-11043): dependency health dashboard widget (#89)
- feat(OMN-10947): Playwright proof — dashboard updates after fresh delegation (#91)
- feat(OMN-10976): flip contract.yaml default from sqlite to postgres (#88)
- feat(OMN-10975): implement postgres projection reader for Express bridge (#86, #87)
- feat(OMN-10950): wire delegation refs scanner as CI gate + pre-commit hook (#84)
- feat(OMN-10945): contract-backed delegation data adapter (#82)
- feat(OMN-10944): wire delegation dashboard projection data (#80)
- feat(OMN-10937): wire reviewdog caller workflow (#81)
- feat(OMN-10603): migrate runner selector to vars.OMNI_TRUSTED_CI_RUNS_ON_JSON (#79)
- feat(OMN-10801): add sqlite-projection-reader cases for 8 empty widget topics (#78)

### Fixes
- fix(OMN-11299): keep omnidash demo from crashing + omit zero-token savings rows (#96, #97)
- fix(OMN-10291): supply cost-by-model fieldMappings via widget-specific adapters (#92)
- fix(OMN-10830): compact dashboard chart canvases (#90)
- fix(OMN-10970): wire skip-token rejection CI gate (#85)

### Notes
- No PyPI publish; this is a JS/Vite frontend release.
- First GitHub Release artifact published for this repo.
