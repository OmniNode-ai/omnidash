# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-21166 AC43 and AC212: omnibase_core's AC43 test, run in omnidash's declared checkout.

The receipt gate's evidence run checks omnibase_core out beside omnidash at
$OMNI_HOME/omnibase_core, at the commit omnidash declares in
.github/sibling-pins.yaml. This module proves that checkout is the declared
commit and that omnibase_core's own AC43 test (the receipt gate's
check-timeout-seconds input) passes in it. The merge-base control reuses the
head's sibling checkouts, but omnidash's merge base declares no commit, so the
module fails there.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import yaml

REPO_ROOT: Path = Path(__file__).resolve().parents[2]
PINS: Path = REPO_ROOT / ".github" / "sibling-pins.yaml"
CORE_TEST: str = "tests/ci/test_receipt_gate_check_timeout_omn21166.py"


def _omni_home() -> Path:
    """Return the OMNI_HOME path, asserting it is set."""
    value: str = os.environ.get("OMNI_HOME", "")
    if not value:
        raise AssertionError(
            "OMNI_HOME is not set: run this inside the receipt gate's evidence run, which exports it"
        )
    return Path(value)


def _declared() -> str:
    """Return the declared omnibase_core commit from sibling-pins.yaml."""
    assert PINS.is_file(), (
        "omnidash declares no omnibase_core commit (.github/sibling-pins.yaml is missing)"
    )
    with PINS.open() as f:
        data: dict = yaml.safe_load(f)
    value: str = data["pins"]["omnibase_core"]
    assert isinstance(value, str) and len(value) == 40 and all(
        c in "0123456789abcdef" for c in value
    ), f"omnibase_core pin is not a 40-char lowercase hex commit: {value!r}"
    return value


def _core() -> Path:
    """Return the path to the omnibase_core checkout beside omnidash."""
    path: Path = _omni_home() / "omnibase_core"
    assert path.is_dir(), f"no omnibase_core checkout beside omnidash at {path}"
    return path


def _core_head() -> str:
    """Return the current HEAD commit of the omnibase_core checkout."""
    result: subprocess.CompletedProcess[str] = subprocess.run(
        ["git", "-C", str(_core()), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return result.stdout.strip()


def test_core_checkout_is_the_declared_commit() -> None:
    """Assert the omnibase_core checkout is at the commit declared in sibling-pins.yaml."""
    head: str = _core_head()
    declared: str = _declared()
    assert head == declared, (
        f"omnibase_core checkout is at {head}, but sibling-pins.yaml declares {declared}"
    )


def test_core_check_timeout_test_passes_in_the_declared_checkout() -> None:
    """Assert the omnibase_core AC43 check-timeout test passes in the declared checkout."""
    head: str = _core_head()
    declared: str = _declared()
    assert head == declared, (
        f"omnibase_core checkout is at {head}, but sibling-pins.yaml declares {declared}"
    )
    core: Path = _core()
    test_path: Path = core / CORE_TEST
    assert test_path.is_file(), f"expected test file not found: {test_path}"
    result: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            CORE_TEST,
            "-q",
            "--noconftest",
            "-p",
            "no:cacheprovider",
            "-c",
            os.devnull,
        ],
        cwd=core,
        capture_output=True,
        text=True,
        timeout=240,
    )
    combined: str = result.stdout + result.stderr
    assert result.returncode == 0, (
        f"omnibase_core check-timeout test failed (exit {result.returncode}):\n"
        f"{combined[-2000:]}"
    )
