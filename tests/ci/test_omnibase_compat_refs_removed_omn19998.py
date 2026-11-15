# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-19998: the workflow and test that named the retired compat package are clean.

RULING 2026-11-15T17:59:49Z removed the compat repository. Only the standard
library and pytest are used, so the workflow-script-refs.yml bare environment
runs it with --noconftest.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
_RETIRED = re.compile(r"omnibase[_-]compat", re.IGNORECASE)

_CLEARED_FILES = (
    ".github/workflows/workflow-script-refs.yml",
    "tests/ci/test_workflow_script_refs_exist.py",
)


@pytest.mark.parametrize("rel", _CLEARED_FILES)
def test_cleared_file_does_not_name_the_retired_package(rel: str) -> None:
    hits = [
        f"{number}: {line.strip()}"
        for number, line in enumerate(
            (REPO_ROOT / rel).read_text(encoding="utf-8").splitlines(), start=1
        )
        if _RETIRED.search(line)
    ]
    assert not hits, f"{rel} still names the retired package: {hits}"


def test_pattern_matches_the_retired_names() -> None:
    """Positive control: both spellings of the retired package match."""
    assert _RETIRED.search("omnibase_compat")
    assert _RETIRED.search("omnibase-compat==0.5.1")
