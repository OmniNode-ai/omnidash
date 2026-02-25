> **Navigation**: [Home](../INDEX.md) > [Decisions](README.md) > ADR-001

# ADR-001: Block Direct Upstream Database Access in CI

**Status**: Accepted
**Date**: 2026-02-13
**Deciders**: Omnidash Engineering Team
**Related**: `.github/workflows/test.yml` (`arch-guard` job), `CLAUDE.md` ("Architectural invariant")

---

## Context

Omnidash is an observability dashboard for the OmniNode platform. Its architecture separates concerns cleanly: upstream services (OmniNode, OmniClaude, etc.) own their data and publish events to Kafka. Omnidash's only legitimate path to that data is through Kafka, projected into its own `omnidash_analytics` read-model database.

Early in the project, a small number of server routes were written that queried the upstream `omninode_bridge` PostgreSQL database directly. This worked in practice but created two categories of risk:

1. **Schema coupling.** Any upstream schema change (column rename, table drop, index change) would silently break omnidash routes that depended on it — with no warning at development time.
2. **Architecture bypass.** The event-driven boundary was advisory rather than enforced. A developer adding a new route could accidentally introduce a direct DB dependency without realizing it violated the architecture.

The `omninode_bridge` instance is accessible on the internal network at port 5436. Nothing technically prevented a `DATABASE_URL` or raw `pg.connect()` call from targeting it. The violation would only be caught in code review — a process that does not scale reliably.

---

## Decision

We add a CI job called `arch-guard` that runs on every push and pull request. The job performs three static grep scans of all TypeScript and TSX source files (excluding `node_modules`, `dist`, and the guard test file itself):

1. **No `omninode_bridge` references** — any string matching `omninode_bridge` in a `.ts`, `.tsx`, or `.json` file is an architectural violation. This catches connection strings, database names in query strings, and import paths.
2. **No direct upstream PostgreSQL port (`:5436`)** — port 5436 is the external port of the upstream PostgreSQL instance. A hardcoded `:5436` in any TypeScript file means omnidash is trying to open a direct connection to upstream infrastructure.
3. **No deprecated `omniarchon` references** — `omniarchon` is a superseded internal service; any reference indicates a stale integration that should be removed.

The `arch-guard` job runs with no Node.js dependencies (pure `grep`), completing in approximately 10 seconds. It is listed as a required check in the `tests-gate` aggregator job, which branch protection rules depend on. A PR cannot be merged if `arch-guard` fails.

The guard test file `no-omninode-bridge-refs.test.ts` is explicitly excluded from the scan so that the test suite itself can verify the guard's logic without triggering a false positive.

---

## Consequences

### Positive

- **Structural enforcement.** The architectural invariant "omnidash does not query upstream databases directly" is now machine-enforced, not human-enforced. A developer cannot accidentally introduce a direct upstream DB call and have it survive CI.
- **Fast feedback.** The job adds roughly 10 seconds of real wall-clock time to a CI run because it has no install or build phase. Developers get feedback before unit tests complete.
- **Self-documenting.** The CI job serves as living documentation of the boundary. Any engineer reading `test.yml` immediately understands which external resources omnidash must not touch.
- **Port-level defense.** Checking for `:5436` catches cases where a developer connects without using the database name (e.g., a raw connection string to the host:port directly).

### Neutral

- **One legitimate exclusion.** The guard test file must be excluded from the scan. This is a known and acceptable carve-out; the exclusion is explicit in the `grep` flags and visible in `test.yml`.
- **grep-level analysis.** The check is textual, not semantic. It does not understand TypeScript ASTs. A developer could theoretically obfuscate a reference, but this is not a realistic attack surface for an internal engineering team.

### Negative

- **Limited to known identifiers.** If the upstream database is renamed or a new restricted resource is introduced, the guard must be manually updated to include the new pattern. This is a low-frequency maintenance burden.

---

## Alternatives Considered

### Alternative 1: Code Review Only

**Pattern**: Enforce the boundary through PR review checklists and team convention.

**Rejected because**:
- Does not scale. Code review thoroughness varies, especially for small PRs.
- Provides no signal until review time, which may be hours or days after a branch diverges.
- Leaves no machine-readable record of the invariant.

### Alternative 2: ESLint Custom Rule

**Pattern**: Write a custom ESLint rule that flags imports or string literals containing `omninode_bridge` or `:5436`.

**Rejected because**:
- Requires maintaining a custom ESLint plugin with its own test surface.
- Would only catch references in positions ESLint's AST traversal visits (imports, string literals in code) — not in `.json` config files.
- A `grep`-based scan is simpler, covers more file types, and runs faster.

### Alternative 3: Runtime Detection

**Pattern**: Instrument the database connection layer to detect and reject connections to upstream hosts at runtime.

**Rejected because**:
- Fails silently in development where the upstream host may not be reachable anyway.
- Provides no signal until a deployment is running.
- Adds runtime complexity to production code to enforce a development-time invariant.

---

## References

### Related Files

- `.github/workflows/test.yml` — `arch-guard` job definition (lines 10–83)
- `client/src/lib/data-sources/__tests__/no-omninode-bridge-refs.test.ts` — test that verifies the guard logic
- `CLAUDE.md` — "Architectural invariant: Omnidash never queries the upstream `omninode_bridge` database directly."
- `docs/architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md` — explains why all data must flow through Kafka projections

### Commit

- `c78545e` — `ci: arch-guard -- block direct upstream DB access in CI`

---

## Approval

**Implemented By**: Omnidash Engineering Team
**Date**: 2026-02-13
**Version**: 1.0

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-13 | Initial ADR | Omnidash Team |

---

**Next Review**: 2026-08-13
