# OmniDash Documentation Index

**Owner:** `omnidash`
**Last verified:** 2026-04-29
**Verification:** `npm run check && npm run test:run`

This is the canonical documentation map for OmniDash. Start here to find architecture, reference, development, and historical context.

---

## Start Here

- [Root README](../README.md) — what this repo is, who uses it, quickstart, command reference, and ownership boundaries.
- [docs/development.md](development.md) — complete development guide: commands, data source modes, registry generation, Storybook.
- [docs/implementation-status.md](implementation-status.md) — Parts 1–4 status and what is implemented.

---

## Current Architecture

- [docs/architecture/composable-frame.md](architecture/composable-frame.md) — three-layer architecture (frame, registry, widgets), data flow, component contract truth boundary, and cross-component communication policy.

---

## Reference

- [docs/reference/dashboard-definition.md](reference/dashboard-definition.md) — `DashboardDefinition` and `DashboardLayoutItem` schema reference. Source of truth: `shared/types/dashboard.ts`.
- [docs/reference/component-manifest.md](reference/component-manifest.md) — `ComponentManifest` schema reference. Source of truth: `shared/types/component-manifest.ts`.

---

## Runbooks

Not yet extracted. The development guide in [`docs/development.md`](development.md) covers the primary operational workflows.

---

## Migrations

No active migrations. OmniDash was created as a clean rewrite; it does not share code with `omnidash-archived`.

---

## Decisions

- [docs/adr/001-typography-system.md](adr/001-typography-system.md) — why all widget text uses `<Text>` and `<Heading>` tokens rather than inline styles.
- [docs/adr/002-storybook-widget-coverage.md](adr/002-storybook-widget-coverage.md) — why every widget must expose `Empty` and `Populated` stories.

---

## Testing and Validation

Run these before every PR:

```bash
npm run check       # TypeScript — must exit 0
npm run test:run    # Vitest — must exit 0
npm run lint        # ESLint — zero warnings allowed
```

The Storybook coverage compliance test runs as part of `npm run test:run` and enforces that every registered widget has at least `Empty` and `Populated` story exports.

---

## Historical Context

The dated plan files below are the original design and implementation context. They are not current source of truth — use the stable docs above as the primary reference.

| Plan | Content |
|------|---------|
| `omni_home/docs/plans/2026-04-10-omnidash-v2-composable-dashboard-design.md` | Composable frame architecture design |
| `omni_home/docs/plans/2026-04-10-omnidash-v2-implementation-plan.md` | Full implementation plan |
| `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-1.md` | Part 1: frame, theme, store, query provider |
| `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-2.md` | Part 2: registry, builder, CRUD |
| `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-3.md` | Part 3: MVP components, templates, proof of life |
| `omni_home/docs/plans/2026-04-10-omnidash-v2-plan-part-4.md` | Part 4: conversational dashboard builder |
| `docs/plans/` | Repo-local implementation tracking plans |
| `docs/audit/` | UI audit evidence |

### Repo Documentation Standard

This repo follows the OmniNode repo documentation standard. The canonical standard document lives at:

```
omni_home/docs/standards/REPO_DOCUMENTATION_STANDARD.md
```

Do not duplicate the standard here; link to it.
