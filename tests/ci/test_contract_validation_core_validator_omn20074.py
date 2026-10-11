# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20074: ``contract-validation`` validates with omnibase_core, not onex_change_control.

The workflow used to check out onex_change_control, then run that repository's
composite ``validate-contract`` action, which validates the branch ticket's
contract with onex_change_control's ``validate-yaml``. It now validates the
branch ticket's repo-local ``contracts/<ticket>.yaml`` with ``omnibase_core``'s
``ModelTicketContract``, installed at an exact version, under unchanged
workflow, job and context names.

omnibase_core 0.47.39 is the first release whose model also refuses a
``binds_ac`` entry that is not a criterion label and a ``binds_ac`` item whose
check type is ``command_exit_0`` (omnibase_core#1935).

These tests run the step's own ``run`` block, extracted from the workflow file,
against planted contracts and this repository's contracts; ``uv`` is a shim that
runs the step's Python with the interpreter running the tests. That interpreter
must have ``omnibase_core`` installed, which the bare-environment pytest jobs do
not, so the workflow runs this file in its own job, in the environment the step
uses (``uv run --with omnibase-core==<pin>``).
"""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "contract-validation.yml"
REQUIRED_CHECKS = REPO_ROOT / ".github" / "required-checks.yaml"
THIS_TEST = "tests/ci/test_contract_validation_core_validator_omn20074.py"

_BASH = shutil.which("bash") or "/bin/bash"

WORKFLOW_NAME = "Contract Validation"
JOB_KEY = "contract-validation"
STEP_NAME = "Run contract validation"
TEST_STEP_NAME = "Test the contract validation step"
VERSION_VAR = "OMNIBASE_CORE_VERSION"
# First omnibase_core release that refuses the two binds_ac shapes (core#1935).
MIN_CORE_VERSION = (0, 47, 39)
EXACT_VERSION = re.compile(r"^\d+\.\d+\.\d+$")

_CONTRACT = """\
schema_version: "1.0.0"
ticket_id: "OMN-1"
title: "planted"
dod_evidence:
  - id: "dod-omn1-ac1"
    description: "planted"
    source: "manual"
    checks:
      - check_type: "{check_type}"
        check_value: "python -m pytest tests -q"
    binds_ac: ["{label}"]
"""
_CLEAN = _CONTRACT.format(check_type="test_passes", label="AC1")
_NON_LABEL = _CONTRACT.format(check_type="test_passes", label="AC1 trailing text")
_COMMAND_EXIT_0 = _CONTRACT.format(check_type="command_exit_0", label="AC1")
_MALFORMED = 'schema_version: "1.0.0"\nticket_id: "OMN-1"\n'
_UNPARSEABLE = "ticket_id: [unterminated\n"

# `uv` for the step: `run <flags...> python3 <args>` runs the test interpreter on
# the args after the first `python`/`python3` word.
_UV_SHIM = """\
#!/bin/sh
[ "$1" = run ] || { echo "uv shim: unsupported: $*" >&2; exit 2; }
shift
while [ $# -gt 0 ]; do
  case "$1" in
    python|python3) shift; exec "$VALIDATION_TEST_PYTHON" "$@" ;;
  esac
  shift
done
echo "uv shim: no python word in run" >&2
exit 2
"""


def _workflow() -> dict[str, Any]:
    data = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def _job() -> dict[str, Any]:
    jobs = _workflow()["jobs"]
    assert isinstance(jobs, dict)
    job = jobs[JOB_KEY]
    assert isinstance(job, dict)
    return job


def _step(name: str) -> dict[str, Any]:
    steps = _job()["steps"]
    assert isinstance(steps, list)
    (step,) = [step for step in steps if step.get("name") == name]
    return step


def _run_block() -> str:
    run = _step(STEP_NAME)["run"]
    assert isinstance(run, str)
    return run


def _python_body() -> str:
    head, _, rest = _run_block().partition("<<'PY'\n")
    assert "python" in head, head
    body, _, _ = rest.partition("\nPY")
    assert body.strip(), rest
    return body


def _core_version() -> str:
    version = _job()["env"][VERSION_VAR]
    assert isinstance(version, str)
    return version


def _repo(tmp_path: Path, files: dict[str, str]) -> Path:
    """A repository root holding ``contracts/`` with ``files``."""
    root = tmp_path / "repo"
    contracts = root / "contracts"
    contracts.mkdir(parents=True)
    for name, text in files.items():
        (contracts / name).write_text(text, encoding="utf-8")
    return root


def _step_run(
    cwd: Path, branch: str
) -> tuple[subprocess.CompletedProcess[str], dict[str, str]]:
    """Run the step's literal ``run`` block for ``branch`` in ``cwd``."""
    scratch = Path(tempfile.mkdtemp(prefix="contract-validation-step-"))
    bin_dir = scratch / "bin"
    bin_dir.mkdir()
    shim = bin_dir / "uv"
    shim.write_text(_UV_SHIM, encoding="utf-8")
    shim.chmod(shim.stat().st_mode | stat.S_IXUSR)
    outputs = scratch / "github_output"
    outputs.write_text("", encoding="utf-8")
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env.update(
        BRANCH=branch,
        GITHUB_OUTPUT=str(outputs),
        PATH=f"{bin_dir}{os.pathsep}{env['PATH']}",
        VALIDATION_TEST_PYTHON=sys.executable,
        **{VERSION_VAR: _core_version()},
    )
    result = subprocess.run(
        [_BASH, "-c", _run_block()],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    written = dict(
        line.split("=", 1)
        for line in outputs.read_text(encoding="utf-8").splitlines()
        if "=" in line
    )
    return result, written


def _body_over_all(cwd: Path) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    return subprocess.run(
        [sys.executable, "-c", _python_body()],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


# --- the workflow shape: no change-control read, names unchanged ---------------


def test_workflow_names_no_onex_change_control() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "onex_change_control" not in text
    assert "validate-yaml" not in text
    assert "ModelTicketContract" in _run_block()


def test_workflow_and_job_names_are_unchanged() -> None:
    assert _workflow()["name"] == WORKFLOW_NAME
    assert _job()["name"] == JOB_KEY
    jobs = _workflow()["jobs"]
    assert isinstance(jobs, dict)
    assert set(jobs) == {JOB_KEY}


def test_required_check_row_for_the_context_is_unchanged() -> None:
    manifest = yaml.safe_load(REQUIRED_CHECKS.read_text(encoding="utf-8"))
    (row,) = [g for g in manifest["gates"] if g["name"] == JOB_KEY]
    assert row["workflow"] == "contract-validation.yml"
    assert row["job_path"] == [JOB_KEY]
    assert row["mode"] == "REQUIRED"


def test_omnibase_core_is_installed_at_one_exact_version() -> None:
    version = _core_version()
    assert EXACT_VERSION.fullmatch(version), version
    assert tuple(int(p) for p in version.split(".")) >= MIN_CORE_VERSION
    text = WORKFLOW.read_text(encoding="utf-8")
    pins = re.findall(r"omnibase[-_]core\s*([=<>~!]=?|@)\s*\S+", text)
    assert pins and set(pins) == {"=="}, pins
    # Every install of the model goes through the one version variable.
    for name in (STEP_NAME, TEST_STEP_NAME):
        run = str(_step(name)["run"])
        assert f"omnibase-core==${{{VERSION_VAR}}}" in run, name


def test_workflow_runs_this_test_in_the_core_environment() -> None:
    run = str(_step(TEST_STEP_NAME)["run"])
    assert THIS_TEST in run
    assert "pytest" in run
    assert "--with pyyaml" in run


# --- this repository's contracts ------------------------------------------------


def test_every_repo_contract_passes_the_core_model() -> None:
    result = _body_over_all(REPO_ROOT)
    assert result.returncode == 0, result.stdout + result.stderr
    count = len(list((REPO_ROOT / "contracts").glob("OMN-*.yaml")))
    assert count > 0
    assert f"{count} ticket contract(s)" in result.stdout


def test_branch_ticket_contract_of_this_repo_passes() -> None:
    result, outputs = _step_run(REPO_ROOT, "omn-20074-dash-contract-validation-core")
    assert result.returncode == 0, result.stdout + result.stderr
    assert outputs["ticket-id"] == "OMN-20074"
    assert outputs["validation-status"] == "passed"


# --- the step over planted contracts --------------------------------------------


def test_clean_planted_contract_passes(tmp_path: Path) -> None:
    root = _repo(tmp_path, {"OMN-1.yaml": _CLEAN})
    result, outputs = _step_run(root, "feature/OMN-1-thing")
    assert result.returncode == 0, result.stdout + result.stderr
    assert outputs["validation-status"] == "passed"


@pytest.mark.parametrize(
    ("text", "rule"),
    [
        (_NON_LABEL, "DOD_EVIDENCE_BINDS_AC_LABEL"),
        (_COMMAND_EXIT_0, "DOD_EVIDENCE_BINDS_AC_CHECK_TYPE"),
        (_MALFORMED, "title Field required"),
        (_UNPARSEABLE, "Failed to parse YAML"),
    ],
    ids=[
        "non-label-binds-ac",
        "command-exit-0-binds-ac",
        "missing-required-field",
        "unparseable-yaml",
    ],
)
def test_refused_contract_fails_naming_file_and_reason(
    tmp_path: Path, text: str, rule: str
) -> None:
    root = _repo(tmp_path, {"OMN-2.yaml": text})
    result, outputs = _step_run(root, "OMN-2-planted")
    assert result.returncode == 1, result.stdout + result.stderr
    assert outputs["validation-status"] == "failed"
    assert "contracts/OMN-2.yaml" in result.stdout
    assert rule in result.stdout


def test_step_validates_only_the_branch_ticket_contract(tmp_path: Path) -> None:
    root = _repo(tmp_path, {"OMN-1.yaml": _CLEAN, "OMN-2.yaml": _NON_LABEL})
    result, outputs = _step_run(root, "OMN-1-only")
    assert result.returncode == 0, result.stdout + result.stderr
    assert outputs["validation-status"] == "passed"


def test_branch_without_ticket_or_contract_is_skipped(tmp_path: Path) -> None:
    root = _repo(tmp_path, {"OMN-1.yaml": _CLEAN})
    no_ticket, no_ticket_out = _step_run(root, "dependabot/bump-something")
    assert no_ticket.returncode == 0, no_ticket.stdout + no_ticket.stderr
    assert no_ticket_out["validation-status"] == "skipped"
    no_contract, no_contract_out = _step_run(root, "OMN-999-no-contract")
    assert no_contract.returncode == 0, no_contract.stdout + no_contract.stderr
    assert no_contract_out["validation-status"] == "skipped"


def test_contracts_dir_with_no_ticket_contract_fails_the_all_contracts_run(
    tmp_path: Path,
) -> None:
    root = _repo(tmp_path, {"README.md": "no contracts\n"})
    result = _body_over_all(root)
    assert result.returncode == 1, result.stdout + result.stderr
