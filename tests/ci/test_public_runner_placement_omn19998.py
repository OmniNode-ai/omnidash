# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-19998: omnidash is public, so its CI jobs run on GitHub-hosted runners.

RULING 2026-10-16T07:07:09Z: "Ci runners should be for private repos only."

* No workflow job routes to the self-hosted fleet: every ``runs-on`` is a
  literal GitHub-hosted label. A computed ``runs-on`` that reads ``vars.`` is
  refused too, because omnibase_core's check cannot prove it hosted and
  omnidash has no baseline entry.
* No non-comment workflow line names the fleet label (``omnibase-ci``) or the
  routing variables that fall back to it; ``self-hosted`` is caught by the
  runs-on check above, which reads the parsed value.
* omnibase_core's check-public-runner-placement runs as a ci.yml job that CI
  Summary requires, and as a pre-commit hook, both at release v0.47.46.

Only the standard library, pytest and pyyaml are used, so the
workflow-script-refs.yml bare environment runs it with --noconftest.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
CI_WORKFLOW = WORKFLOWS / "ci.yml"
PRECOMMIT = REPO_ROOT / ".pre-commit-config.yaml"

HOSTED_LABEL = re.compile(r"^(ubuntu|windows|macos)-[\w.\-]+$")
FLEET_NAMES = re.compile(
    r"omnibase-ci|OMNI_(?:TRUSTED_CI|PUBLIC_PR|LAB_BUS|HOSTILE_REVIEW)_RUNS_ON_JSON",
    re.IGNORECASE,
)
JOB_ID = "public-runner-placement"
JOB_NAME = "Public Runner Placement (OMN-19998)"
HOOK_ID = "check-public-runner-placement"
CORE_RELEASE = "0.47.46"
# The ci.yml job's positive control writes a planted self-hosted workflow with
# one printf; that line must name the fleet to prove the check refuses it.
CANARY_WRITER = "printf 'on: push"


def _load(path: Path) -> dict[Any, Any]:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict), f"{path.name} did not parse to a mapping"
    return loaded


def fleet_lines(text: str) -> list[str]:
    """Non-comment lines that name the self-hosted fleet or its routing variables."""
    return [
        line.strip()
        for line in text.splitlines()
        if not line.lstrip().startswith("#")
        and CANARY_WRITER not in line
        and FLEET_NAMES.search(line)
    ]


def unhosted_jobs(text: str) -> dict[str, object]:
    """Job id to runs-on for each job whose runs-on is not a literal hosted label."""
    jobs = yaml.safe_load(text).get("jobs") or {}
    return {
        str(job_id): job["runs-on"]
        for job_id, job in jobs.items()
        if isinstance(job, dict)
        and "runs-on" in job
        and not (
            isinstance(job["runs-on"], str)
            and HOSTED_LABEL.match(job["runs-on"].strip())
        )
    }


def test_detectors_flag_planted_fleet_routing_and_pass_hosted() -> None:
    fallback = (
        "    runs-on: ${{ fromJSON(vars.OMNI_TRUSTED_CI_RUNS_ON_JSON || "
        """'["self-hosted","omnibase-ci"]') }}\n"""
    )
    literal = "on: push\njobs:\n  a:\n    runs-on: [self-hosted, omnibase-ci]\n"
    computed = (
        "on: push\njobs:\n  a:\n    runs-on: ${{ fromJSON(vars.X || "
        """'["ubuntu-latest"]') }}\n"""
    )
    hosted = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n"
    comment = "    # no longer self-hosted omnibase-ci\n"
    assert fleet_lines(fallback) == [fallback.strip()]
    assert fleet_lines(literal) != []  # names omnibase-ci
    assert fleet_lines(comment) == []
    assert fleet_lines("          " + CANARY_WRITER + "\\njobs: self-hosted'") == []
    assert fleet_lines(hosted) == []
    assert unhosted_jobs(literal) == {"a": ["self-hosted", "omnibase-ci"]}
    assert list(unhosted_jobs(computed)) == ["a"]
    assert unhosted_jobs(hosted) == {}


def test_every_workflow_job_runs_on_a_literal_hosted_label() -> None:
    offenders = {
        path.name: found
        for path in sorted(WORKFLOWS.glob("*.y*ml"))
        if (found := unhosted_jobs(path.read_text(encoding="utf-8")))
    }
    assert offenders == {}, (
        "A public repository's jobs run on GitHub-hosted labels "
        "(RULING 2026-10-16T07:07:09Z): " + repr(offenders)
    )


def test_no_workflow_line_names_the_self_hosted_fleet() -> None:
    offenders = {
        path.name: found
        for path in sorted(WORKFLOWS.glob("*.y*ml"))
        if (found := fleet_lines(path.read_text(encoding="utf-8")))
    }
    assert offenders == {}, (
        "No workflow line may fall back to the self-hosted fleet "
        "(RULING 2026-10-16T07:07:09Z): " + repr(offenders)
    )


def _job() -> dict[str, Any]:
    jobs = _load(CI_WORKFLOW)["jobs"]
    assert JOB_ID in jobs, f"ci.yml has no {JOB_ID} job"
    return jobs[JOB_ID]


def _hooks() -> list[tuple[str, dict[str, Any]]]:
    return [
        (str(repo["rev"]), hook)
        for repo in _load(PRECOMMIT)["repos"]
        if isinstance(repo, dict)
        for hook in repo.get("hooks", [])
        if isinstance(hook, dict) and hook.get("id") == HOOK_ID
    ]


def test_ci_job_runs_the_core_check_unconditionally_on_a_hosted_runner() -> None:
    job = _job()
    assert job["name"] == JOB_NAME
    assert job["runs-on"] == "ubuntu-latest"
    assert "needs" not in job
    assert "if" not in job
    assert job.get("continue-on-error") is not True
    runs = "\n".join(str(step.get("run", "")) for step in job["steps"])
    assert "omnibase_core.handlers.handler_public_runner_placement_cli" in runs
    assert "POSITIVE CONTROL FAILED" in runs
    assert "--base-ref" in runs
    assert "--repo omnidash --visibility public" in runs


def test_ci_job_and_hook_run_the_same_core_release() -> None:
    assert _job()["env"]["RUNNER_PLACEMENT_CORE"] == f"omnibase-core=={CORE_RELEASE}"
    hooks = _hooks()
    assert len(hooks) == 1, f"expected one {HOOK_ID} hook, found {len(hooks)}"
    assert hooks[0][0] == f"v{CORE_RELEASE}"
    assert hooks[0][1]["args"] == ["--repo", "omnidash", "--visibility", "public"]


def test_ci_summary_requires_the_job_to_succeed() -> None:
    summary = _load(CI_WORKFLOW)["jobs"]["ci-summary"]
    assert JOB_ID in summary["needs"]
    script = "\n".join(str(step.get("run", "")) for step in summary["steps"])
    assert f'needs.{JOB_ID}.result }}}}" != "success"' in script
