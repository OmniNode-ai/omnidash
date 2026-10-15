# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20074: omnidash CI is off onex_change_control.

The S6 cut-over (test_no_occ_callers_omn20074.py) removed the OCC caller
workflows. This file pins what that left behind:

* ban-hardcoded-runner-ip.yml pinned omniclaude's scan at a sha whose reusable
  nested omnibase_core's occ-preflight.yml@main, a file omnibase_core no longer
  carries. The new pin's scan runs no preflight and needs no pull-request read.
* main-target-guard admitted a PR from dev to main by a promotion-receipt line
  naming an OCC receipt id. main is release-synced (release.yml fast-forwards it
  to the released tag over the REST API and opens no PR), so the guard now
  refuses every PR that targets main and still lets every other base through.
* No parsed workflow, pre-commit or required-checks value names
  onex_change_control, occ-preflight or an OCC receipt id. Comments are not
  values, so the history they record does not count.

Only the standard library, pytest and pyyaml are used, so the
workflow-script-refs.yml bare environment runs it with --noconftest.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
RUNNER_IP_PATH = WORKFLOWS / "ban-hardcoded-runner-ip.yml"
GUARD_PATH = WORKFLOWS / "main-target-guard.yml"
SCANNED_CONFIG = (
    REPO_ROOT / ".pre-commit-config.yaml",
    REPO_ROOT / ".github" / "required-checks.yaml",
)

# omniclaude#2656 squash on dev: the runner-IP reusable without the preflight.
RUNNER_IP_PIN = "a45ba68f053e9979c6edef21103c0e674e5f7630"
RUNNER_IP_USES = (
    "OmniNode-ai/omniclaude/.github/workflows/"
    f"ban-hardcoded-runner-ip.yml@{RUNNER_IP_PIN}"
)

OCC_VALUE = re.compile(
    r"onex_change_control|onex-change-control|occ-preflight|occ_preflight|OCC-(?:[0-9]|<|\[)"
)


def _load(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _strings(node: Any, where: str) -> list[tuple[str, str]]:
    """Every scalar key and value under ``node``, with a path naming it."""
    found: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for key, value in node.items():
            found.append((where, str(key)))
            found.extend(_strings(value, f"{where}.{key}"))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.extend(_strings(value, f"{where}[{index}]"))
    elif node is not None:
        found.append((where, str(node)))
    return found


def _occ_offenders(node: Any, where: str) -> list[str]:
    return [f"{path}: {text[:120]}" for path, text in _strings(node, where) if OCC_VALUE.search(text)]


def _guard_script() -> str:
    steps = _load(GUARD_PATH)["jobs"]["main-target-guard"]["steps"]
    scripts = [step["run"] for step in steps if "run" in step]
    assert len(scripts) == 1, "main-target-guard is expected to carry one run step"
    return scripts[0]


def _run_guard(base: str, head: str, body: str) -> subprocess.CompletedProcess[str]:
    bash = shutil.which("bash")
    assert bash, "bash is required to run the guard's own run block"
    env = {"PATH": os.environ.get("PATH", ""), "BASE_REF": base, "HEAD_REF": head, "PR_BODY": body}
    return subprocess.run(
        [bash, "-c", _guard_script()],
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )


def test_runner_ip_scan_pins_the_reusable_without_the_preflight() -> None:
    job = _load(RUNNER_IP_PATH)["jobs"]["ban-hardcoded-runner-ip"]
    assert job["uses"] == RUNNER_IP_USES
    # The new reusable reads only the caller's checkout.
    assert job.get("permissions") == {"contents": "read"}


@pytest.mark.parametrize(
    ("head", "body"),
    [
        ("dev", "promotion-receipt: OCC-1234"),
        ("dev", ""),
        ("omn-20074-feature", "promotion-receipt: OCC-1234"),
        ("release/v1.2.3", ""),
    ],
)
def test_main_target_guard_refuses_every_pr_to_main(head: str, body: str) -> None:
    result = _run_guard("main", head, body)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "::error::" in result.stdout


@pytest.mark.parametrize("base", ["dev", "hotfix/x", "release/v1"])
def test_main_target_guard_admits_other_bases(base: str) -> None:
    result = _run_guard(base, "omn-20074-feature", "")
    assert result.returncode == 0, result.stdout + result.stderr


def test_main_target_guard_reads_no_pr_body() -> None:
    steps = _load(GUARD_PATH)["jobs"]["main-target-guard"]["steps"]
    for step in steps:
        assert "PR_BODY" not in (step.get("env") or {})
    assert "promotion-receipt" not in _guard_script()


def test_no_workflow_or_hook_config_value_names_occ() -> None:
    paths = sorted(WORKFLOWS.glob("*.y*ml"))
    assert len(paths) > 10, f"only {len(paths)} workflows found in {WORKFLOWS}"
    offenders: list[str] = []
    for path in [*paths, *SCANNED_CONFIG]:
        offenders.extend(_occ_offenders(_load(path), path.relative_to(REPO_ROOT).as_posix()))
    assert not offenders, offenders


def test_occ_value_scan_flags_a_planted_value() -> None:
    planted = {
        "jobs": {
            "a": {"uses": "OmniNode-ai/onex_change_control/.github/workflows/x.yml@" + "0" * 40},
            "b": {"needs": ["occ-preflight"]},
            "c": {"steps": [{"run": "grep -qE 'promotion-receipt: OCC-[0-9]+'"}]},
            "d": {"with": {"compare-with-occ": "false"}},
        }
    }
    offenders = _occ_offenders(planted, "planted")
    assert len(offenders) == 3, offenders
    assert not [o for o in offenders if o.startswith("planted.jobs.d")]
