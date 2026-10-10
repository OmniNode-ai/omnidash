# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20885: ``ONEX Schema Compatibility Check`` reads the schema owner.

The job used to check out onex_change_control as the validator and run its
``validate-yaml`` over every YAML file in ``contracts/`` (except the root
service contract). The ticket-contract model that validator applied is
``omnibase_core``'s ``ModelTicketContract`` (the change-control repository
re-exports it); day-close files are ``omnibase_core``'s ``ModelDayClose``.

The job now installs ``omnibase_core`` from the commit this repository already
pins for its architecture handshake and runs the same validation with the
owner's models, plus the schema-version rule the other repositories use: the
``schema_version`` a ticket contract declares must have the same major as
``ModelTicketContract``'s, through ``omnibase_spi``'s ``is_compatible``.

These tests run the step's own Python body, extracted from the workflow file,
against the repo contracts and against planted ones. The body needs
``omnibase_core`` and ``omnibase_spi``, so the workflow runs this file in its
own job, in the environment the step uses, after the step itself.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "onex-schema-compat.yml"
HANDSHAKE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "check-handshake.yml"
JOB_NAME = "ONEX Schema Compatibility Check"
STEP_NAME = "Validate ONEX contract files against omnibase_core"
SHA = re.compile(r"^[0-9a-f]{40}$")

_GOOD = 'schema_version: "1.0.0"\nticket_id: "OMN-1"\ntitle: "planted"\n'
_DAY_CLOSE = """\
schema_version: "1.0.0"
date: "2026-10-10"
invariants_checked:
  reducers_pure: pass
  orchestrators_no_io: pass
  effects_do_io_only: pass
  real_infra_proof_progressing: pass
"""


def _jobs() -> dict[str, dict[str, Any]]:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))["jobs"]


def _job() -> dict[str, Any]:
    (job,) = [job for job in _jobs().values() if job.get("name") == JOB_NAME]
    return job


def _steps() -> list[dict[str, Any]]:
    steps = _job()["steps"]
    assert isinstance(steps, list)
    return steps


def _step_python() -> str:
    (step,) = [step for step in _steps() if step.get("name") == STEP_NAME]
    run = step["run"]
    head, _, rest = run.partition("<<'PY'\n")
    assert "python" in head, run
    body, _, _ = rest.partition("\nPY")
    assert body.strip(), run
    return body


def _run_step(cwd: Path) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    return subprocess.run(
        [sys.executable, "-c", _step_python()],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _contracts(tmp_path: Path, files: dict[str, str]) -> Path:
    contracts = tmp_path / "contracts"
    for name, text in files.items():
        target = contracts / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    return tmp_path


def test_job_reads_no_onex_change_control() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "onex_change_control" not in text
    assert "validate-yaml" not in text
    for step in _steps():
        assert "onex_change_control" not in str(step.get("with", {}))


def test_core_is_read_at_the_commit_the_handshake_pins() -> None:
    (core,) = [
        step
        for step in _steps()
        if (step.get("with") or {}).get("repository") == "OmniNode-ai/omnibase_core"
    ]
    ref = str(core["with"]["ref"])
    assert SHA.fullmatch(ref), ref
    handshake = yaml.safe_load(HANDSHAKE_WORKFLOW.read_text(encoding="utf-8"))
    handshake_refs = {
        str((step.get("with") or {}).get("ref"))
        for job in handshake["jobs"].values()
        for step in job["steps"]
        if (step.get("with") or {}).get("repository") == "OmniNode-ai/omnibase_core"
    }
    assert ref in handshake_refs, (ref, handshake_refs)


def test_spi_is_exactly_pinned_in_the_step() -> None:
    run = next(s for s in _steps() if s.get("name") == STEP_NAME)["run"]
    assert re.search(r"--with\s+omnibase-spi==\d+\.\d+\.\d+\b", run), run


def test_repo_contracts_are_valid_and_compatible_with_the_core_model() -> None:
    result = _run_step(REPO_ROOT)
    assert result.returncode == 0, result.stdout + result.stderr
    root_service_contract = REPO_ROOT / "contracts" / "contract.yaml"
    count = len(
        [
            p
            for p in (REPO_ROOT / "contracts").rglob("*")
            if p.suffix in {".yaml", ".yml"} and p != root_service_contract
        ]
    )
    assert count > 0
    assert f"{count} ONEX contract file(s)" in result.stdout


def test_planted_major_mismatch_fails(tmp_path: Path) -> None:
    root = _contracts(
        tmp_path,
        {"OMN-1.yaml": _GOOD, "OMN-2.yaml": _GOOD.replace("1.0.0", "2.0.0")},
    )
    result = _run_step(root)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "contracts/OMN-2.yaml" in result.stdout
    assert "contracts/OMN-1.yaml" not in result.stdout


def test_minor_difference_passes(tmp_path: Path) -> None:
    root = _contracts(tmp_path, {"OMN-1.yaml": _GOOD.replace("1.0.0", "1.4.0")})
    result = _run_step(root)
    assert result.returncode == 0, result.stdout + result.stderr


def test_unparseable_version_fails(tmp_path: Path) -> None:
    root = _contracts(tmp_path, {"OMN-1.yaml": _GOOD.replace('"1.0.0"', '"one"')})
    result = _run_step(root)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "contracts/OMN-1.yaml" in result.stdout


def test_contract_that_fails_the_model_fails(tmp_path: Path) -> None:
    """The old validator checked every field, not only the version."""
    root = _contracts(tmp_path, {"OMN-1.yaml": 'schema_version: "1.0.0"\ntitle: "no id"\n'})
    result = _run_step(root)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "contracts/OMN-1.yaml" in result.stdout
    assert "ticket_id" in result.stdout


def test_nested_contract_is_validated(tmp_path: Path) -> None:
    root = _contracts(
        tmp_path,
        {"OMN-1.yaml": _GOOD, "subdir/other.yml": 'schema_version: "1.0.0"\n'},
    )
    result = _run_step(root)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "contracts/subdir/other.yml" in result.stdout


def test_root_service_contract_is_not_a_ticket_contract(tmp_path: Path) -> None:
    root = _contracts(
        tmp_path, {"OMN-1.yaml": _GOOD, "contract.yaml": "name: service\nnode_type: x\n"}
    )
    result = _run_step(root)
    assert result.returncode == 0, result.stdout + result.stderr


def test_day_close_file_is_validated_as_a_day_close(tmp_path: Path) -> None:
    ok = _run_step(_contracts(tmp_path / "ok", {"day_close_2026-10-10.yaml": _DAY_CLOSE}))
    assert ok.returncode == 0, ok.stdout + ok.stderr
    bad = _run_step(_contracts(tmp_path / "bad", {"day_close_2026-10-10.yaml": _GOOD}))
    assert bad.returncode == 1, bad.stdout + bad.stderr
    assert "contracts/day_close_2026-10-10.yaml" in bad.stdout


def test_empty_contracts_dir_fails(tmp_path: Path) -> None:
    root = _contracts(tmp_path, {"README.md": "no contracts\n"})
    result = _run_step(root)
    assert result.returncode == 1, result.stdout + result.stderr


def test_no_contracts_dir_passes(tmp_path: Path) -> None:
    result = _run_step(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr


def test_workflow_runs_this_file_where_core_is_installed() -> None:
    runs = [str(step.get("run", "")) for step in _steps()]
    assert any(
        "test_schema_compat_core_owner_omn20885.py" in run and "./omnibase_core" in run
        for run in runs
    ), runs


def test_workflow_triggers_when_the_test_changes() -> None:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    triggers = workflow[True] if True in workflow else workflow["on"]
    for event in ("push", "pull_request"):
        assert "tests/ci/test_schema_compat_core_owner_omn20885.py" in triggers[event]["paths"]
