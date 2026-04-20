# omnidash-v2/scripts/generate_fixtures.py
"""Generate fixture snapshot files for local dev.

Emits two layers:
  1. Summary/projection DTOs — the shapes each widget actually reads.
  2. Raw per-entity records — preserved under onex.event.raw.* for future
     projection-consumer tests.
"""

from __future__ import annotations

import asyncio
import os
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from omnibase_infra.projectors.file_snapshot_sink import FileSnapshotSink

FIXTURES_DIR = Path(os.environ.get("VITE_FIXTURES_DIR", "./fixtures"))

# ---------------------------------------------------------------------------
# Summary / widget-facing DTOs
# ---------------------------------------------------------------------------


class _LlmCostPoint(BaseModel):
    """CostTrendPanel — one bucket per record."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    bucket_time: str
    model_name: str
    total_cost_usd: str  # string — matches widget interface
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    request_count: int


class _DelegationSummary(BaseModel):
    """DelegationMetrics — single summary record."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    totalDelegations: int
    qualityGatePassRate: float
    totalSavingsUsd: float
    byTaskType: list[dict[str, object]]


class _RoutingDecision(BaseModel):
    """RoutingDecisionTable — one record per decision."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    id: str
    created_at: str
    llm_agent: str
    fuzzy_agent: str
    agreement: bool
    llm_confidence: float
    fuzzy_confidence: float
    cost_usd: float


class _ReadinessSummary(BaseModel):
    """ReadinessGate — single summary with 7 dimensions."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    dimensions: list[dict[str, object]]
    overallStatus: str
    lastCheckedAt: str


class _QualitySummary(BaseModel):
    """QualityScorePanel — single summary record."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    meanScore: float
    distribution: list[dict[str, object]]
    totalMeasurements: int


class _BaselinesSummary(BaseModel):
    """BaselinesROICard — single summary record."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    snapshotId: str
    capturedAt: str
    tokenDelta: int
    timeDeltaMs: int
    retryDelta: int
    recommendations: dict[str, int]
    confidence: float


class _StreamEvent(BaseModel):
    """EventStream — one record per event."""

    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    id: str
    event_type: str
    source: str
    correlation_id: str
    timestamp: str


# ---------------------------------------------------------------------------
# Raw per-entity records (upstream source material)
# ---------------------------------------------------------------------------


class _RawRegistration(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    node_name: str
    current_state: str
    last_heartbeat_at: str


class _RawLlmCost(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    model_name: str
    total_tokens: int
    estimated_cost_usd: float
    observed_at: str


class _RawOvernight(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    session_id: str
    phase: str
    started_at: str
    duration_ms: int


class _RawDelegation(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    task_id: str
    routed_to: str
    latency_ms: int
    success: bool
    decided_at: str


class _RawBaselines(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    metric_name: str
    quality_score: float
    roi_ratio: float
    observed_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_AGENTS = ["claude-opus-4-7", "claude-sonnet-4-6", "qwen3-coder-30b", "deepseek-r1-32b"]
_TASK_TYPES = ["code_review", "test_generation", "refactor", "documentation", "bug_fix"]
_READINESS_DIMS = [
    "schema_migrations",
    "kafka_connectivity",
    "redis_heartbeat",
    "agent_registry",
    "projection_freshness",
    "ci_green_streak",
    "overnight_verification",
]
_STATUS_WEIGHTS = ["PASS", "PASS", "PASS", "WARN", "FAIL"]
_EVENT_TYPES = [
    "delegation.request",
    "projection.update",
    "readiness.check",
    "agent.heartbeat",
    "baseline.capture",
]
_QUALITY_BUCKETS = ["0.0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"]


def _now_iso(offset_minutes: int = 0) -> str:
    return (datetime.now(UTC) - timedelta(minutes=offset_minutes)).isoformat()


# ---------------------------------------------------------------------------
# Projection / summary factories
# ---------------------------------------------------------------------------


def _llm_cost_points(n: int = 10) -> list[tuple[str, _LlmCostPoint]]:
    records = []
    for i in range(n):
        model = random.choice(_AGENTS)
        prompt = random.randint(500, 50_000)
        completion = random.randint(100, 10_000)
        total = prompt + completion
        cost = round((total / 1_000) * random.uniform(0.001, 0.015), 6)
        eid = str(uuid4())
        records.append(
            (
                eid,
                _LlmCostPoint(
                    entity_id=eid,
                    bucket_time=_now_iso(i * 15),
                    model_name=model,
                    total_cost_usd=f"{cost:.6f}",
                    total_tokens=total,
                    prompt_tokens=prompt,
                    completion_tokens=completion,
                    request_count=random.randint(1, 20),
                ),
            )
        )
    return records


def _delegation_summary() -> _DelegationSummary:
    total = random.randint(80, 500)
    by_task = [
        {"taskType": t, "count": random.randint(5, max(5, total // len(_TASK_TYPES)))}
        for t in _TASK_TYPES
    ]
    return _DelegationSummary(
        entity_id="summary",
        totalDelegations=total,
        qualityGatePassRate=round(random.uniform(0.72, 0.99), 3),
        totalSavingsUsd=round(random.uniform(5.0, 120.0), 2),
        byTaskType=by_task,
    )


def _routing_decisions(n: int = 15) -> list[tuple[str, _RoutingDecision]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RoutingDecision(
                    entity_id=eid,
                    id=eid,
                    created_at=_now_iso(i * 5),
                    llm_agent=random.choice(_AGENTS),
                    fuzzy_agent=random.choice(_AGENTS),
                    agreement=random.random() > 0.25,
                    llm_confidence=round(random.uniform(0.55, 0.99), 3),
                    fuzzy_confidence=round(random.uniform(0.50, 0.99), 3),
                    cost_usd=round(random.uniform(0.0001, 0.05), 6),
                ),
            )
        )
    return records


def _readiness_summary() -> _ReadinessSummary:
    dims = [
        {
            "name": dim,
            "status": random.choice(_STATUS_WEIGHTS),
            "detail": f"{dim} check completed",
        }
        for dim in _READINESS_DIMS
    ]
    statuses = [str(d["status"]) for d in dims]
    if "FAIL" in statuses:
        overall = "FAIL"
    elif "WARN" in statuses:
        overall = "WARN"
    else:
        overall = "PASS"
    return _ReadinessSummary(
        entity_id="summary",
        dimensions=dims,
        overallStatus=overall,
        lastCheckedAt=_now_iso(0),
    )


def _quality_summary() -> _QualitySummary:
    counts = [random.randint(2, 40) for _ in _QUALITY_BUCKETS]
    total = sum(counts)
    distribution = [
        {"bucket": b, "count": c}
        for b, c in zip(_QUALITY_BUCKETS, counts, strict=False)
    ]
    midpoints = [0.1, 0.3, 0.5, 0.7, 0.9]
    mean = round(sum(m * c for m, c in zip(midpoints, counts, strict=False)) / total, 3)
    return _QualitySummary(
        entity_id="summary",
        meanScore=mean,
        distribution=distribution,
        totalMeasurements=total,
    )


def _baselines_summary() -> _BaselinesSummary:
    return _BaselinesSummary(
        entity_id="summary",
        snapshotId=str(uuid4()),
        capturedAt=_now_iso(60),
        tokenDelta=random.randint(-5000, 5000),
        timeDeltaMs=random.randint(-2000, 2000),
        retryDelta=random.randint(-3, 3),
        recommendations={
            "promote": random.randint(0, 5),
            "shadow": random.randint(0, 3),
            "suppress": random.randint(0, 2),
            "fork": random.randint(0, 2),
        },
        confidence=round(random.uniform(0.6, 0.98), 3),
    )


def _stream_events(n: int = 15) -> list[tuple[str, _StreamEvent]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _StreamEvent(
                    entity_id=eid,
                    id=eid,
                    event_type=random.choice(_EVENT_TYPES),
                    source=random.choice(_AGENTS),
                    correlation_id=str(uuid4()),
                    timestamp=_now_iso(i * 3),
                ),
            )
        )
    return records


# ---------------------------------------------------------------------------
# Raw per-entity record factories
# ---------------------------------------------------------------------------


def _raw_registrations(n: int = 10) -> list[tuple[str, _RawRegistration]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RawRegistration(
                    entity_id=eid,
                    node_name=f"node_{i}",
                    current_state=random.choice(["READY", "HEARTBEATING", "STALE"]),
                    last_heartbeat_at=_now_iso(random.randint(0, 10)),
                ),
            )
        )
    return records


def _raw_llm_costs(n: int = 10) -> list[tuple[str, _RawLlmCost]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RawLlmCost(
                    entity_id=eid,
                    model_name=random.choice(_AGENTS),
                    total_tokens=random.randint(100, 250_000),
                    estimated_cost_usd=round(random.uniform(0.001, 12.5), 4),
                    observed_at=_now_iso(i * 15),
                ),
            )
        )
    return records


def _raw_overnights(n: int = 10) -> list[tuple[str, _RawOvernight]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RawOvernight(
                    entity_id=eid,
                    session_id=f"session-{i:03d}",
                    phase=random.choice(
                        ["preflight", "build", "merge_sweep", "verification"]
                    ),
                    started_at=_now_iso(i * 60),
                    duration_ms=random.randint(1_000, 900_000),
                ),
            )
        )
    return records


def _raw_delegations(n: int = 10) -> list[tuple[str, _RawDelegation]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RawDelegation(
                    entity_id=eid,
                    task_id=f"task-{i:04d}",
                    routed_to=random.choice(_AGENTS),
                    latency_ms=random.randint(80, 12_000),
                    success=random.random() > 0.08,
                    decided_at=_now_iso(i * 5),
                ),
            )
        )
    return records


def _raw_baselines(n: int = 10) -> list[tuple[str, _RawBaselines]]:
    records = []
    for i in range(n):
        eid = str(uuid4())
        records.append(
            (
                eid,
                _RawBaselines(
                    entity_id=eid,
                    metric_name=random.choice(
                        [
                            "test_pass_rate",
                            "ci_green_streak",
                            "review_turnaround",
                            "deploy_frequency",
                        ]
                    ),
                    quality_score=round(random.uniform(0.55, 0.99), 3),
                    roi_ratio=round(random.uniform(0.9, 3.5), 3),
                    observed_at=_now_iso(i * 120),
                ),
            )
        )
    return records


# ---------------------------------------------------------------------------
# Topic registry: (topic, [(key, record)])
# ---------------------------------------------------------------------------


def build_projections() -> list[tuple[str, list[tuple[str, object]]]]:
    return [
        # --- Projection / summary topics (widget-facing) ---
        (
            "onex.snapshot.projection.llm_cost.v1",
            _llm_cost_points(10),
        ),
        (
            "onex.snapshot.projection.delegation.summary.v1",
            [("summary", _delegation_summary())],
        ),
        (
            "onex.snapshot.projection.delegation.decisions.v1",
            _routing_decisions(15),
        ),
        (
            "onex.snapshot.projection.overnight.v1",
            [("summary", _readiness_summary())],
        ),
        (
            "onex.snapshot.projection.baselines.quality.v1",
            [("summary", _quality_summary())],
        ),
        (
            "onex.snapshot.projection.baselines.roi.v1",
            [("summary", _baselines_summary())],
        ),
        (
            "onex.snapshot.projection.registration.v1",
            _stream_events(15),
        ),
        # --- Raw per-entity topics (upstream source material) ---
        (
            "onex.event.raw.registration.v1",
            _raw_registrations(10),
        ),
        (
            "onex.event.raw.llm_cost.v1",
            _raw_llm_costs(10),
        ),
        (
            "onex.event.raw.overnight.v1",
            _raw_overnights(10),
        ),
        (
            "onex.event.raw.delegation.v1",
            _raw_delegations(10),
        ),
        (
            "onex.event.raw.baselines.v1",
            _raw_baselines(10),
        ),
    ]


async def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    sink = FileSnapshotSink(root=FIXTURES_DIR)
    projections = build_projections()
    for topic, pairs in projections:
        print(f"generating {topic} ({len(pairs)} records)")  # noqa: T201
        for key, record in pairs:
            await sink.publish(topic=topic, key=key, value=record)
    print(f"done — wrote to {FIXTURES_DIR}")  # noqa: T201


if __name__ == "__main__":
    asyncio.run(main())
