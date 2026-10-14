# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20995: retire the security caller's old owner without changing its context.

The baseline below is the parsed security-scan.yml at merge base
c1eadc47a2552a0bde29c267ee8e42820f099334, with only jobs.codeql.uses removed.
Keep the snapshot in this repo so shallow CI checkouts need no sibling clone
or historical git object. Replacing the workflow with that base is the AC1/AC3
positive control; AC2 must continue to pass there.
"""

from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "security-scan.yml"
CORE_PIN = "3fbb43eaff028a30edccb1b9b794e0a3f3d9523c"
MERGE_BASE_CALLER = {
    "name": "Security Scan",
    # PyYAML's YAML 1.1 parser reads bare `on` as True.
    True: {
        "push": {"branches": ["main", "dev", "hotfix/**"]},
        "pull_request": {"branches": ["main", "dev", "hotfix/**"]},
        "schedule": [{"cron": "0 6 * * 1"}],
    },
    "concurrency": {
        "group": "${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}",
        "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    },
    "jobs": {
        "codeql": {
            "name": "CodeQL",
            "with": {
                "language": "javascript-typescript",
                "query_suite": "security-and-quality",
            },
            "permissions": {
                "actions": "read",
                "contents": "read",
                "security-events": "write",
            },
        },
    },
}


def _workflow() -> dict[Any, Any]:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def _caller_without_uses(doc: dict[Any, Any]) -> dict[Any, Any]:
    caller = copy.deepcopy(doc)
    caller["jobs"]["codeql"].pop("uses")
    return caller


def test_ac1_core_reusable_full_sha() -> None:
    uses = _workflow()["jobs"]["codeql"]["uses"]
    assert re.fullmatch(
        r"OmniNode-ai/omnibase_core/\.github/workflows/codeql-reusable\.yml@[0-9a-f]{40}",
        uses,
    ), uses
    assert uses.endswith(f"@{CORE_PIN}")


def test_ac2_preserves_merge_base_caller() -> None:
    # Includes job id/name, inputs, permissions, triggers and concurrency.
    # Also rejects added keys such as an invalid continue-on-error on the call.
    assert _caller_without_uses(_workflow()) == MERGE_BASE_CALLER


def test_ac3_no_previous_owner_in_any_line() -> None:
    offending = [
        (number, line)
        for number, line in enumerate(
            WORKFLOW.read_text(encoding="utf-8").splitlines(), start=1
        )
        if "onex_change_control" in line
    ]
    assert not offending, offending
