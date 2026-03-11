# Health Source Onboarding Guide

<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 OmniNode Team -->

This guide documents the required steps for adding a new data source to the omnidash
`/api/health/data-sources` endpoint. Every component listed below is **mandatory**. Skipping
any component will cause the data source to appear as `offline` or `mock` in the dashboard
and will trigger the CI health gate failure.

**Ticket:** OMN-4584 | **Part of:** OMN-4383 cloud env prevention plan

---

## 1. Why This Guide Exists

In March 2026, the OMN-4383 incident revealed three classes of failure that caused 13 of 14
omnidash data sources to appear as `offline / upstream_never_emitted`:

| Root Cause | Effect |
|---|---|
| CronJobs in kustomization but never triggered after initial deployment | `baselines-batch-compute` and `cross-repo-validation` sources permanently offline |
| `KAFKA_BROKERS` env var absent from omnidash Deployment manifest | All Kafka-backed sources offline (consumer never started) |
| Feature flag `ENABLE_ENV_SYNC_PROBE` not set | `envSync` source never probed |

This guide exists so that no future data source repeats this failure pattern.

---

## 2. Required Components (All Mandatory)

### 2.1 Kafka Producer

The upstream service that emits events must:

- Emit to a topic following the canonical naming convention:
  `onex.evt.<service>.<event-type>.v<N>` (e.g., `onex.evt.omniintelligence.pattern-discovered.v1`)
- Be deployed as a K8s resource (Deployment or CronJob — see §2.4)
- Have its topic registered in `omnidash/src/server/topics.ts` (or equivalent topic registry)

**Never** emit to a flat topic name (e.g., `agent-actions`). Use the canonical realm-scoped format.

### 2.2 Omnidash Projection

The omnidash server must consume and project the new source:

- **File location:** `omnidash/src/server/projections/<source-name>.ts`
- **Bootstrap registration:** import and register in `omnidash/src/server/projections/index.ts`
- **Consumer:** subscribe to the topic in the Kafka consumer setup
- **Unit tests:** `omnidash/src/server/projections/__tests__/<source-name>.test.ts`
  - Cover: happy-path event, malformed event, empty topic (should not throw)

### 2.3 Probe Function

The health poller must include a probe for the new source:

- **Naming convention:** `probe<SourceName>` (e.g., `probePatternLearning`)
- **File location:** `omnidash/src/server/health/probes/<source-name>.ts`
- **Return type:** `{ status: 'live' | 'mock' | 'offline' | 'error', reason?: string }`
- **Unit tests:** cover each return value including the offline/error paths
- **Registration:** add to `omnidash/src/server/health/index.ts` probe map

### 2.4 K8s Resource

Every data source requires a corresponding K8s resource that drives its producer:

| Producer Type | K8s Resource | Location |
|---|---|---|
| Always-on service | `Deployment` | `k8s/onex-dev/<namespace>/deployment-<name>.yaml` |
| Scheduled batch job | `CronJob` | `k8s/onex-dev/<namespace>/cronjob-<name>.yaml` |

**Critical:** After adding the resource to the kustomization, **manually trigger it** to verify
end-to-end flow before closing the ticket:

```bash
# For CronJobs: trigger a manual run
kubectl create job --from=cronjob/<cronjob-name> <name>-manual-$(date +%s) -n onex-dev

# For Deployments: verify rollout
kubectl rollout status deployment/<name> -n onex-dev --timeout=60s
```

Add the new resource to `k8s/onex-dev/<namespace>/kustomization.yaml`.

### 2.5 CI Health Gate Entry

Update `scripts/check-omnidash-health.sh` if the new source is expected to be non-live in
the cloud cluster:

```bash
# In check-omnidash-health.sh — ALLOWED_NON_LIVE array
# Only add here if the source is intentionally non-live in cloud (document the reason):
ALLOWED_NON_LIVE=("envSync" "<new-source-if-applicable>")
```

**Document the reason** with an inline comment. Undocumented allowlist entries will be flagged
in code review.

### 2.6 CLAUDE.md Data Source Dependencies Table

Add a row to the Data Source Dependencies table in `omninode_infra/CLAUDE.md`:

```markdown
| `<sourceKey>` | <upstream producer description> | `<k8s-resource-type>/<resource-name>` |
```

This table is the authoritative reference for which K8s resources back each data source.

---

## 3. Validation Checklist (Pre-Merge)

Before opening a PR for a new data source, verify all of the following:

- [ ] Kafka producer emits to canonical topic (`onex.evt.<service>.<type>.v<N>`)
- [ ] Topic registered in `omnidash/src/server/topics.ts`
- [ ] Projection file created at `src/server/projections/<source-name>.ts`
- [ ] Projection registered in `src/server/projections/index.ts`
- [ ] Unit tests written for projection (happy-path, malformed, empty)
- [ ] Probe function created at `src/server/health/probes/<source-name>.ts`
- [ ] Probe registered in `src/server/health/index.ts`
- [ ] K8s resource YAML created and added to kustomization.yaml
- [ ] K8s resource manually triggered in onex-dev and verified (events flowing or job succeeded)
- [ ] `check-omnidash-health.sh` updated if source is allowlisted non-live (with documented reason)
- [ ] `omninode_infra/CLAUDE.md` Data Source Dependencies table updated with new row
- [ ] `/api/health/data-sources` returns `live` for the new source after manual trigger

---

## 4. Common Failure Modes and Fixes

| Failure Mode | Root Cause | Fix |
|---|---|---|
| Source shows `offline / upstream_never_emitted` | CronJob or Deployment never triggered after deploy | Manually trigger: `kubectl create job --from=cronjob/<name> ...` or check Deployment rollout |
| Source shows `offline / kafka_consumer_not_started` | `KAFKA_BROKERS` env var absent from omnidash Deployment | Add `KAFKA_BROKERS` to `k8s/onex-dev/omnidash/deployment-omnidash.yaml` env section |
| Source shows `mock` in production | Probe falls back to mock data when upstream unavailable | Fix probe logic; ensure upstream K8s resource is running and emitting |
| Source shows `error` | Probe threw an exception | Check omnidash pod logs: `kubectl logs -n onex-dev deployment/omnidash --tail=100` |
| CI health gate fails after deploy | New source added without allowlist entry, or source not live after deploy | Add to `ALLOWED_NON_LIVE` with documented reason OR fix the upstream producer |
| `/api/health/data-sources` requires auth in CI | Keycloak auth protects the endpoint | Use `check-omnidash-health.sh` which calls `/api/health-probe` (public endpoint) as proxy |
