# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""Pin every OMN-19612 CI test into its required bare-environment runner."""

from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "workflow-script-refs.yml"
REQUIRED_CHECKS_PATH = REPO_ROOT / ".github" / "required-checks.yaml"
JOB_ID = "workflow-script-refs"
JOB_NAME = "Workflow Script Reference Gate"


def _load_yaml(path: Path) -> dict:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict), f"{path.name} did not parse to a mapping"
    return loaded


def _workflow() -> dict:
    return _load_yaml(WORKFLOW_PATH)


def _job() -> dict:
    job = _workflow()["jobs"][JOB_ID]
    # The required status context is the job NAME; a rename silently
    # detaches this job from branch protection.
    assert job.get("name") == JOB_NAME, f"`{JOB_ID}` is no longer named `{JOB_NAME}`"
    return job


def _pin_paths() -> set[str]:
    paths = {
        path.relative_to(REPO_ROOT).as_posix()
        for path in (REPO_ROOT / "tests" / "ci").glob("test_*omn19612*.py")
    }
    assert len(paths) >= 3, "expected at least three OMN-19612 CI pin tests"
    return paths


def _pytest_steps() -> list[dict]:
    return [
        step
        for step in _job()["steps"]
        if "python -m pytest" in str(step.get("run", ""))
    ]


def test_every_omn19612_pin_runs_in_the_required_workflow() -> None:
    pytest_steps = _pytest_steps()
    missing = {
        path
        for path in _pin_paths()
        if not any(path in str(step.get("run", "")) for step in pytest_steps)
    }
    assert not missing, f"OMN-19612 pin tests missing from CI: {sorted(missing)}"


def test_job_and_pin_steps_are_unconditional_and_not_advisory() -> None:
    job = _job()
    assert "if" not in job
    assert "needs" not in job
    assert job.get("continue-on-error") is not True

    pin_paths = _pin_paths()
    pin_steps = [
        step
        for step in _pytest_steps()
        if any(path in str(step.get("run", "")) for path in pin_paths)
    ]
    assert pin_steps, "no pytest step runs an OMN-19612 pin test"
    for step in pin_steps:
        assert "if" not in step, f"pin step acquired an if: condition: {step.get('name')}"
        assert step.get("continue-on-error") is not True


def test_pull_request_trigger_is_unfiltered_and_covers_normal_updates() -> None:
    workflow = _workflow()
    triggers = workflow[True] if True in workflow else workflow["on"]
    assert "pull_request" in triggers
    pull_request = triggers["pull_request"] or {}
    for key in ("paths", "paths-ignore", "branches", "branches-ignore"):
        assert key not in pull_request, f"pull_request acquired a {key}: filter"

    if "types" in pull_request:
        types = set(pull_request["types"])
        assert {"opened", "synchronize", "reopened"} <= types


def test_workflow_gate_is_declared_required_exactly_once() -> None:
    required = _load_yaml(REQUIRED_CHECKS_PATH)
    matches = [gate for gate in required["gates"] if gate.get("name") == JOB_NAME]
    assert len(matches) == 1, f"expected exactly one `{JOB_NAME}` gate"

    gate = matches[0]
    assert gate.get("workflow") == WORKFLOW_PATH.name
    assert gate.get("job_path") == [JOB_ID]
    assert gate.get("mode") == "REQUIRED"
    assert "branch" not in gate or gate["branch"] == "dev"
