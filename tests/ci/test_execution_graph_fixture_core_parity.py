"""Validate the graph fixture against pinned Core DTO serialization."""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError
import pytest


CORE_SHA = "c7e7914e5da4990316c0bda23d355e2102f6c7e8"
CORE_PATH = os.environ.get("OMNIBASE_CORE_PATH")
if not CORE_PATH:
    raise RuntimeError("OMNIBASE_CORE_PATH is required for graph fixture parity")

core_root = Path(CORE_PATH).resolve()
if not core_root.is_dir():
    raise RuntimeError(
        "OMNIBASE_CORE_PATH does not point to an available Core checkout"
    )


def run_core_git(*args: str) -> str:
    git_env = os.environ.copy()
    for variable in (
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_PREFIX",
    ):
        git_env.pop(variable, None)
    return subprocess.run(
        ["git", "-C", str(core_root), *args],
        check=True,
        capture_output=True,
        text=True,
        env=git_env,
    ).stdout.strip()


try:
    actual_core_sha = run_core_git("rev-parse", "HEAD")
except subprocess.CalledProcessError as exc:
    raise RuntimeError("OMNIBASE_CORE_PATH is not a readable Git checkout") from exc
if actual_core_sha != CORE_SHA:
    raise RuntimeError(
        f"Core parity pin mismatch: expected {CORE_SHA}, got {actual_core_sha}"
    )
core_model_paths = [
    "src/omnibase_core/models/execution_graph_replay",
    "src/omnibase_core/models/primitives/model_semver.py",
]
core_model_changes = run_core_git("status", "--porcelain", "--", *core_model_paths)
if core_model_changes:
    raise RuntimeError(
        "Pinned Core DTO source has local changes; use a clean pinned checkout"
    )


def load_core_graph_model() -> Any:
    sys.path.insert(0, str(core_root / "src"))
    from omnibase_core.models.execution_graph_replay import ModelExecutionGraph

    return ModelExecutionGraph


ModelExecutionGraph = load_core_graph_model()


REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    REPO_ROOT
    / "src/components/dashboard/delegation-control-plane/execution-graph-spike"
    / "__fixtures__/realFiveHopGraph.json"
)


HISTORICAL_FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def synthetic_watermark_projection() -> dict[str, Any]:
    """Adapt historical topology for a one-row-per-partition fixture ledger.

    Historical Kafka offsets remain source evidence. They are not watermark
    values, and this derived projection does not claim captured-run provenance.
    """
    graph: dict[str, Any] = copy.deepcopy(HISTORICAL_FIXTURE)
    graph["replay"]["source_cursors"] = [
        {
            "topic": cursor["topic"],
            "partition": cursor["partition"],
            "max_ingest_watermark": 1,
        }
        for cursor in graph["replay"]["source_cursors"]
    ]
    return graph


FIXTURE = synthetic_watermark_projection()


def assert_rejected(mutated: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        ModelExecutionGraph.model_validate(mutated)


def test_historical_topology_with_synthetic_watermarks_round_trips_losslessly() -> None:
    graph = ModelExecutionGraph.model_validate(FIXTURE)
    assert graph.model_dump(mode="json") == FIXTURE
    assert len(graph.replay.nodes) == 5
    assert len(graph.replay.edges) == 4
    assert len(graph.replay.source_cursors) == 5
    assert len(graph.labels) == 5
    assert len(graph.annotations.stored_chain) == 0
    assert len(graph.annotations.stored_verdicts) == 0


def test_historical_offset_cursor_is_not_accepted_as_watermark_cursor() -> None:
    assert_rejected(HISTORICAL_FIXTURE)
    assert [
        cursor["max_kafka_offset"]
        for cursor in HISTORICAL_FIXTURE["replay"]["source_cursors"]
    ] == [
        2174,
        4248,
        2553,
        4201,
        1831,
    ]
    assert all(
        cursor.max_ingest_watermark == 1
        for cursor in ModelExecutionGraph.model_validate(FIXTURE).replay.source_cursors
    )


def test_missing_required_top_level_and_nested_fields_are_rejected() -> None:
    top_level = copy.deepcopy(FIXTURE)
    del top_level["labels"]
    assert_rejected(top_level)

    nested = copy.deepcopy(FIXTURE)
    del nested["replay"]["source_cursors"][0]["max_ingest_watermark"]
    assert_rejected(nested)


def test_extra_fields_at_top_level_and_nested_level_are_rejected() -> None:
    top_level = copy.deepcopy(FIXTURE)
    top_level["unmodeled"] = True
    assert_rejected(top_level)

    nested = copy.deepcopy(FIXTURE)
    nested["replay"]["nodes"][0]["unmodeled"] = True
    assert_rejected(nested)


def test_invalid_enum_and_null_required_field_are_rejected() -> None:
    invalid_enum = copy.deepcopy(FIXTURE)
    invalid_enum["replay"]["nodes"][0]["kind"] = "unknown_kind"
    assert_rejected(invalid_enum)

    null_required = copy.deepcopy(FIXTURE)
    null_required["replay"]["source_cursors"][0]["topic"] = None
    assert_rejected(null_required)


def test_invalid_uuid_is_rejected_while_nullable_timestamps_round_trip() -> None:
    invalid_uuid = copy.deepcopy(FIXTURE)
    invalid_uuid["replay"]["nodes"][0]["id"] = "not-a-uuid"
    assert_rejected(invalid_uuid)

    graph = ModelExecutionGraph.model_validate(FIXTURE)
    assert all(label.event_timestamp is None for label in graph.labels)
    assert all(label.ledger_written_at is None for label in graph.labels)
