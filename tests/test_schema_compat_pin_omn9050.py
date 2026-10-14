# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-9050: the schema reader retains the dispatched immutable core pin."""

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
CORE_PIN = "d677b4e78219113139b5d20ac81efcdcef78e3e0"


def test_schema_reader_uses_the_dispatched_sibling_core_pin() -> None:
    """A stale schema checkout fails even when its ref is a valid full SHA."""
    for filename in (
        "check-handshake.yml",
        "type-sync-check.yml",
        "onex-schema-compat.yml",
    ):
        workflow = yaml.safe_load(
            (REPO_ROOT / ".github" / "workflows" / filename).read_text(encoding="utf-8")
        )
        core_refs = [
            step["with"]["ref"]
            for job in workflow["jobs"].values()
            for step in job["steps"]
            if (step.get("with") or {}).get("repository") == "OmniNode-ai/omnibase_core"
        ]
        assert core_refs, f"{filename}: no omnibase_core checkout"
        assert all(ref == CORE_PIN for ref in core_refs), (filename, core_refs)
