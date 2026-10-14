# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20885: schema validation uses the same core revision as its consumers.

A core pin bump must reach schema validation as well as the architecture
handshake and type sync. Otherwise those jobs validate different model versions.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

WORKFLOWS = Path(__file__).resolve().parents[1] / ".github" / "workflows"


def _core_ref(workflow: str) -> str:
    data = yaml.safe_load((WORKFLOWS / workflow).read_text(encoding="utf-8"))
    checkouts = [
        step["with"]
        for job in data["jobs"].values()
        for step in job.get("steps", [])
        if (step.get("with") or {}).get("repository") == "OmniNode-ai/omnibase_core"
    ]
    assert len(checkouts) == 1, (workflow, checkouts)
    ref = str(checkouts[0].get("ref", ""))
    assert re.fullmatch(r"[0-9a-f]{40}", ref), (workflow, ref)
    return ref


@pytest.mark.parametrize("consumer", ["check-handshake.yml", "type-sync-check.yml"])
def test_schema_validation_uses_the_consumers_core_revision(consumer: str) -> None:
    schema_ref = _core_ref("onex-schema-compat.yml")
    consumer_ref = _core_ref(consumer)
    assert schema_ref == consumer_ref, (
        f"schema validation reads {schema_ref}, but {consumer} reads {consumer_ref}"
    )
