# omnidash-v2/scripts/generate_fixtures.py
"""Generate fixture snapshot files for local dev."""

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


class _Registration(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    node_name: str
    current_state: str
    last_heartbeat_at: str


class _LlmCost(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    model_name: str
    total_tokens: int
    estimated_cost_usd: float
    observed_at: str


class _Overnight(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    session_id: str
    phase: str
    started_at: str
    duration_ms: int


class _Delegation(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    task_id: str
    routed_to: str
    latency_ms: int
    success: bool
    decided_at: str


class _Baselines(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    entity_id: str
    metric_name: str
    quality_score: float
    roi_ratio: float
    observed_at: str


# Covers ALL topics referenced by the 7 widgets in Task 6's mapping table.
PROJECTIONS = [
    (
        "onex.snapshot.projection.registration.v1",
        lambda i: _Registration(
            entity_id=str(uuid4()),
            node_name=f"node_{i}",
            current_state=random.choice(["READY", "HEARTBEATING", "STALE"]),
            last_heartbeat_at=(
                datetime.now(UTC) - timedelta(seconds=random.randint(0, 600))
            ).isoformat(),
        ),
    ),
    (
        "onex.snapshot.projection.llm_cost.v1",
        lambda i: _LlmCost(
            entity_id=str(uuid4()),
            model_name=random.choice(
                ["claude-opus-4-7", "claude-sonnet-4-6", "qwen3-coder-30b"]
            ),
            total_tokens=random.randint(100, 250_000),
            estimated_cost_usd=round(random.uniform(0.001, 12.5), 4),
            observed_at=(datetime.now(UTC) - timedelta(minutes=i * 15)).isoformat(),
        ),
    ),
    (
        "onex.snapshot.projection.overnight.v1",
        lambda i: _Overnight(
            entity_id=str(uuid4()),
            session_id=f"session-{i:03d}",
            phase=random.choice(["preflight", "build", "merge_sweep", "verification"]),
            started_at=(datetime.now(UTC) - timedelta(hours=i)).isoformat(),
            duration_ms=random.randint(1_000, 900_000),
        ),
    ),
    (
        "onex.snapshot.projection.delegation.v1",
        lambda i: _Delegation(
            entity_id=str(uuid4()),
            task_id=f"task-{i:04d}",
            routed_to=random.choice(
                [
                    "claude-opus-4-7",
                    "claude-sonnet-4-6",
                    "qwen3-coder-30b",
                    "deepseek-r1-32b",
                ]
            ),
            latency_ms=random.randint(80, 12_000),
            success=random.random() > 0.08,
            decided_at=(datetime.now(UTC) - timedelta(minutes=i * 5)).isoformat(),
        ),
    ),
    (
        "onex.snapshot.projection.baselines.v1",
        lambda i: _Baselines(
            entity_id=str(uuid4()),
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
            observed_at=(datetime.now(UTC) - timedelta(hours=i * 2)).isoformat(),
        ),
    ),
]


async def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    sink = FileSnapshotSink(root=FIXTURES_DIR)
    for topic, factory in PROJECTIONS:
        print(f"generating {topic}")  # noqa: T201
        for i in range(10):
            snap = factory(i)
            await sink.publish(topic=topic, key=snap.entity_id, value=snap)
    print(f"done — wrote to {FIXTURES_DIR}")  # noqa: T201


if __name__ == "__main__":
    asyncio.run(main())
