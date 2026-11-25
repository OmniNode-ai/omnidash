# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-24282 Amendments 2 and 3 (Lakshman, approved 2026-11-22; VF-23): pins the standing alarm for the Overview's Activity breakdown tab labels, so a change that removes the job, stops it running on pull requests to dev, changes what it runs, or stops CI Summary failing when it fails, fails here."""

from pathlib import Path

import yaml


def _load_workflow():
    root = Path(__file__).resolve().parents[2]
    with (root / ".github" / "workflows" / "ci.yml").open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data


def _jobs(data):
    return data.get("jobs", {})


def _triggers(data):
    return data.get("on", data.get(True, {}))


JOB = "activity-breakdown-labels"
COMMAND = (
    "npx playwright test tests/e2e/activity-breakdown-window-label.omn24282.spec.ts "
    "--project=chromium --workers=1 --retries=0"
)
INSTALL = "npx playwright install --with-deps chromium"
RUNNER = "ubuntu-24.04"


def test_alarm_job_runs_on_every_pull_request_to_dev():
    """Catches a trigger that drops dev or adds a paths/paths-ignore/types filter."""
    data = _load_workflow()
    triggers = _triggers(data)
    pr = triggers.get("pull_request")
    assert pr is not None, "pull_request trigger missing"
    branches = pr.get("branches", []) if isinstance(pr, dict) else []
    assert "dev" in branches, f"dev not in pull_request branches: {branches!r}"
    if isinstance(pr, dict):
        assert "paths" not in pr, "pull_request must not filter by paths"
        assert "paths-ignore" not in pr, "pull_request must not filter by paths-ignore"
        assert "types" not in pr, "pull_request must not filter by types"


def test_alarm_job_is_unconditional_on_a_pinned_hosted_runner():
    """Catches a job that is renamed, moved to a different runner, or gated by if/needs."""
    data = _load_workflow()
    jobs = _jobs(data)
    assert JOB in jobs, f"job {JOB!r} missing"
    job = jobs[JOB]
    assert job.get("name") == "Activity breakdown labels (OMN-24282)", (
        f"job name is {job.get('name')!r}, expected 'Activity breakdown labels (OMN-24282)'"
    )
    assert job.get("runs-on") == RUNNER, (
        f"runs-on is {job.get('runs-on')!r}, expected {RUNNER!r}"
    )
    assert "if" not in job, "alarm job must not have an 'if' gate"
    assert "needs" not in job, "alarm job must not have a 'needs' dependency"


def test_alarm_job_installs_chromium_and_runs_the_three_label_tests():
    """Catches a step that skips the chromium install, changes the command, drops CI=true, or adds continue-on-error."""
    data = _load_workflow()
    job = _jobs(data)[JOB]
    steps = job.get("steps", [])
    assert steps, "alarm job has no steps"
    install_steps = [s for s in steps if isinstance(s, dict) and s.get("run", "").strip() == INSTALL]
    assert len(install_steps) == 1, (
        f"expected exactly one step with run == {INSTALL!r}, found {len(install_steps)}"
    )
    command_steps = []
    for s in steps:
        if not isinstance(s, dict):
            continue
        run = s.get("run", "")
        lines = [ln.strip() for ln in run.splitlines()]
        if COMMAND in lines:
            command_steps.append(s)
    assert len(command_steps) == 1, (
        f"expected exactly one step whose run contains {COMMAND!r} as a whole line, found {len(command_steps)}"
    )
    cmd_step = command_steps[0]
    env = cmd_step.get("env", {})
    assert env.get("CI") in (True, "true"), (
        f"command step env CI is {env.get('CI')!r}, expected true or 'true'"
    )
    for s in steps:
        if isinstance(s, dict):
            assert s.get("continue-on-error") is not True, (
                "no step in the alarm job may set continue-on-error: true"
            )
    assert "continue-on-error" not in job, "the alarm job must not set continue-on-error"
    # A step-level if could skip the install or the tests while the job stays green.
    assert "if" not in install_steps[0], "the Chromium install step must not have an 'if'"
    assert "if" not in cmd_step, "the test step must not have an 'if'"


def test_ci_summary_fails_unless_the_alarm_job_succeeds():
    """Catches a CI Summary that no longer depends on the alarm job, drops always(), or stops exiting 1 on failure."""
    data = _load_workflow()
    jobs = _jobs(data)
    ci_summary = jobs.get("ci-summary")
    assert ci_summary is not None, "ci-summary job missing"
    needs = ci_summary.get("needs", [])
    if isinstance(needs, str):
        needs = [needs]
    assert JOB in needs, f"ci-summary needs {needs!r} must include {JOB!r}"
    assert ci_summary.get("if") == "always()", (
        f"ci-summary if is {ci_summary.get('if')!r}, expected 'always()'"
    )
    steps = ci_summary.get("steps", [])
    scripts = []
    for s in steps:
        if isinstance(s, dict) and isinstance(s.get("run"), str):
            scripts.append(s["run"])
    joined = "\n".join(scripts)
    marker = 'if [ "${{ needs.activity-breakdown-labels.result }}" != "success" ]; then'
    assert marker in joined, "ci-summary steps must contain the alarm-failure guard line"
    # Only the guard's own body counts: an exit 1 in a later guard must not satisfy this one.
    after = joined[joined.index(marker) + len(marker):].splitlines()
    closing = next((i for i, line in enumerate(after) if line.strip() == "fi"), None)
    assert closing is not None, "the alarm-failure guard has no closing fi"
    assert "exit 1" in [line.strip() for line in after[:closing]], (
        "the alarm-failure guard must exit 1 inside its own if ... fi"
    )
