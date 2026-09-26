# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""Pin whole-tree CI counterparts for OMN-19612's staged-file hooks.

commit c63708c ("perf(pre-commit): scope validators to staged files") moved
env-contamination-grep and delegation-refs-check from
pass_filenames: false to pass_filenames: true, for commit speed. Whole-tree
enforcement still has to happen somewhere or a violation sitting outside the
staged diff (or on a PR excluded by some other job's own filter) is never
caught again.

env-contamination-grep already had one, in the required "Typecheck &
Tests" job (ci.yml, `test`). delegation-refs-check's only whole-tree run was
a path-filtered (paths: src/**|shared/**|server/**), non-required workflow
(hardcoded-delegation-refs.yml) -- a violation in shared/ or server/-adjacent
files outside that filter, or on a PR that workflow's own trigger excluded,
was never caught. This module pins that both hooks now have a required,
unconditional, unfiltered whole-tree run inside the `test` job, and derives
the staged-scoped hook set generically so a newly staged-scoped hook with no
whole-tree counterpart also fails this test, not just these two names.

Deliberately run with plain pytest + pyyaml (no repo Python project exists
here), matching tests/ci/test_workflow_script_refs_exist.py's own bare-env
convention -- see workflow-script-refs.yml's rationale comment.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PRECOMMIT_CONFIG = REPO_ROOT / ".pre-commit-config.yaml"
CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"

JOB_ID = "test"
JOB_NAME = "Typecheck & Tests"

# hook_id -> command fragment that must appear in the `test` job's steps,
# proving its whole-tree run is still wired to the SAME underlying script.
# Both ids are exactly the two hooks commit c63708c moved to staged scope.
BACKSTOPS = {
    "env-contamination-grep": "scripts/check-no-env-contamination.sh",
    "delegation-refs-check": "scripts/check-hardcoded-delegation-refs.sh",
}


def _load_yaml(path: Path) -> dict:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict), f"{path.name} did not parse to a mapping"
    return loaded


def _staged_scoped_hook_ids() -> set[str]:
    config = _load_yaml(PRECOMMIT_CONFIG)
    default_stages = config.get("default_stages", ["pre-commit"])
    ids: set[str] = set()
    for repo in config["repos"]:
        for hook in repo.get("hooks", []):
            stages = hook.get("stages", default_stages)
            if "pre-commit" not in stages:
                continue
            if hook.get("pass_filenames") is True:
                ids.add(str(hook["id"]))
    return ids


def _workflow() -> dict:
    return _load_yaml(CI_WORKFLOW)


def _job() -> dict:
    job = _workflow()["jobs"][JOB_ID]
    assert job["name"] == JOB_NAME
    return job


def _commands() -> str:
    return "\n".join(str(step.get("run", "")) for step in _job()["steps"])


def test_every_staged_scoped_hook_has_a_declared_backstop() -> None:
    staged = _staged_scoped_hook_ids()
    assert staged, "expected at least one staged-file-scoped hook"
    missing = staged - set(BACKSTOPS)
    assert not missing, (
        f"these staged-scoped hooks have no declared whole-tree backstop: {sorted(missing)}"
    )
    assert set(BACKSTOPS) <= staged, "a BACKSTOPS entry no longer names a staged-scoped hook"


@pytest.mark.parametrize(("hook_id", "fragment"), BACKSTOPS.items())
def test_whole_tree_counterpart_is_present(hook_id: str, fragment: str) -> None:
    commands = _commands()
    assert fragment in commands, f"{hook_id} lost its whole-tree counterpart ({fragment})"


def test_job_is_unconditional_and_not_advisory() -> None:
    job = _job()
    assert "if" not in job, f"`{JOB_ID}` acquired an if: condition"
    assert "needs" not in job, f"`{JOB_ID}` acquired a needs: edge"
    assert job.get("continue-on-error") is not True
    for step in job["steps"]:
        command = str(step.get("run", ""))
        if any(fragment in command for fragment in BACKSTOPS.values()):
            assert "if" not in step, (
                f"a backstop step of `{JOB_ID}` acquired an if: condition: "
                f"{step.get('name')}"
            )
        assert step.get("continue-on-error") is not True, (
            f"a step of `{JOB_ID}` is continue-on-error: {step.get('name')}"
        )


def test_workflow_has_an_unfiltered_pull_request_trigger() -> None:
    workflow = _workflow()
    triggers = workflow[True] if True in workflow else workflow["on"]
    assert "pull_request" in triggers
    pull_request = triggers["pull_request"] or {}
    assert "paths" not in pull_request
    assert "paths-ignore" not in pull_request
    assert "branches-ignore" not in pull_request
    if "branches" in pull_request:
        branches = set(pull_request["branches"])
        assert {"dev", "main"} <= branches


def test_job_is_a_required_check() -> None:
    required = _load_yaml(REPO_ROOT / ".github" / "required-checks.yaml")
    matches = [
        gate
        for gate in required["gates"]
        if gate.get("name") == JOB_NAME and gate.get("job_path") == [JOB_ID]
    ]
    assert len(matches) == 1, f"`{JOB_NAME}` is not a required check in required-checks.yaml"
    assert matches[0]["mode"] == "REQUIRED"
