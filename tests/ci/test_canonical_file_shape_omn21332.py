# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-21332 AC3: exercise omnidash's deployed ratchet and its pinned validator.

The tests read the workflow from this checkout. They fail on the merge base,
where the workflow and baseline do not exist. Planted files live only in a
disposable clone, so neither the checkout's index nor its baseline is changed.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github/workflows/canonical-file-shape.yml"
BASELINE = ".onex_ratchets/canonical_file_shape_baseline.txt"


def _job() -> dict[str, Any]:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    return workflow["jobs"]["canonical-file-shape"]


def _run(
    tree: Path, *args: str, env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=tree,
        env={**os.environ, **(env or {}), "PYTHONDONTWRITEBYTECODE": "1"},
        capture_output=True,
        text=True,
        timeout=240,
        check=False,
    )


def _clone(tmp_path: Path) -> Path:
    tree = tmp_path / "omnidash"
    result = _run(tmp_path, "git", "clone", "--shared", "--quiet", str(REPO_ROOT), str(tree))
    assert result.returncode == 0, result.stderr
    return tree


def _ratchet(tree: Path) -> subprocess.CompletedProcess[str]:
    dependency = _job()["env"]["CANONICAL_FILE_SHAPE_CORE"]
    assert re.fullmatch(
        r"omnibase-core @ git\+https://github.com/OmniNode-ai/omnibase_core@[0-9a-f]{40}",
        dependency,
    ), dependency
    return _run(
        tree,
        "uv", "run", "--no-project", "--with", dependency,
        "python", "-m", "omnibase_core.validators.canonical_file_shape", "--base", "HEAD",
    )


def test_ac3_runs_on_pull_requests_merge_queue_and_dev_without_filters() -> None:
    workflow = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    triggers = workflow.get("on", workflow.get(True))
    for event in ("pull_request", "merge_group"):
        assert event in triggers
        assert triggers[event] in (None, {}), f"{event} must run without filters"
    assert triggers["push"] == {"branches": ["dev"]}
    assert "if" not in _job()
    assert not _job().get("continue-on-error", False)
    assert all("if" not in step for step in _job()["steps"])


def test_ac3_positive_control_executes_the_workflows_planted_samples(tmp_path: Path) -> None:
    job = _job()
    step = next(step for step in job["steps"] if step["name"].startswith("Positive control"))
    tree = _clone(tmp_path)
    result = _run(tree, "bash", "-e", "-c", step["run"], env=job["env"])
    output = result.stdout + result.stderr
    assert result.returncode == 0, output
    assert "positive control: planted samples refused" in output
    assert "positive control: canonical sample admitted" in output
    assert "src/lib/zz_canary_planted.ts: [noncanonical-file]" in output
    assert "tests/zz_canary_planted.sh: [noncanonical-file]" in output
    status = _run(tree, "git", "status", "--porcelain")
    assert status.returncode == 0, status.stderr
    assert not status.stdout, status.stdout


@pytest.mark.parametrize("base_variable", ["PR_BASE", "MQ_BASE", "PUSH_BEFORE", None])
def test_ac3_enforcement_uses_the_event_merge_base(
    tmp_path: Path, base_variable: str | None,
) -> None:
    job = _job()
    step = next(step for step in job["steps"] if step["name"].startswith("Refuse new"))
    assert step["env"] == {
        "PR_BASE": "${{ github.event.pull_request.base.sha }}",
        "MQ_BASE": "${{ github.event.merge_group.base_sha }}",
        "PUSH_BEFORE": "${{ github.event.before }}",
    }
    tree = _clone(tmp_path)
    revision = _run(tree, "git", "rev-parse", "HEAD")
    assert revision.returncode == 0, revision.stderr
    event_env = {"PR_BASE": "", "MQ_BASE": "", "PUSH_BEFORE": ""}
    if base_variable:
        event_env[base_variable] = revision.stdout.strip()
    result = _run(tree, "bash", "-ex", "-c", step["run"], env={**job["env"], **event_env})
    assert result.returncode == 0, result.stdout + result.stderr
    invocations = [line for line in result.stderr.splitlines() if line.startswith("+ uv run ")]
    assert len(invocations) == 1, result.stderr
    command = invocations[0]
    assert "python -m omnibase_core.validators.canonical_file_shape " in command
    assert command.endswith(" --head HEAD"), command
    if base_variable:
        assert f" --base {revision.stdout.strip()} --head HEAD" in command
    else:
        assert " --base " not in command


@pytest.mark.parametrize(
    ("path", "contents", "accepted"),
    [
        ("src/lib/zz_ac3_planted.ts", "export const planted = 1;\n", False),
        ("tests/zz_ac3_planted.sh", "#!/bin/sh\necho planted\n", False),
        ("src/components/ZzAc3Clean.tsx", "export function ZzAc3Clean() { return null; }\n", True),
    ],
)
def test_ac3_validator_distinguishes_new_files(
    tmp_path: Path, path: str, contents: str, accepted: bool,
) -> None:
    tree = _clone(tmp_path)
    sample = tree / path
    sample.parent.mkdir(parents=True, exist_ok=True)
    sample.write_text(contents, encoding="utf-8")
    staged = _run(tree, "git", "add", path)
    assert staged.returncode == 0, staged.stderr
    result = _ratchet(tree)
    output = result.stdout + result.stderr
    assert result.returncode == (0 if accepted else 1), output
    if not accepted:
        assert f"{path}: [noncanonical-file]" in output


def test_ac3_baseline_cannot_hide_a_new_shell_script(tmp_path: Path) -> None:
    tree = _clone(tmp_path)
    path = "tests/zz_ac3_growth.sh"
    (tree / path).write_text("#!/bin/sh\necho planted\n", encoding="utf-8")
    with (tree / BASELINE).open("a", encoding="utf-8") as baseline:
        baseline.write(path + "\n")
    staged = _run(tree, "git", "add", path, BASELINE)
    assert staged.returncode == 0, staged.stderr
    result = _ratchet(tree)
    output = result.stdout + result.stderr
    assert result.returncode == 1, output
    assert "[baseline-growth]" in output
    assert path in output


def test_ac3_removed_files_require_baseline_shrinkage(tmp_path: Path) -> None:
    tree = _clone(tmp_path)
    path = "server/index.ts"
    assert path in (tree / BASELINE).read_text(encoding="utf-8").splitlines()
    removed = _run(tree, "git", "rm", "--quiet", path)
    assert removed.returncode == 0, removed.stderr
    result = _ratchet(tree)
    output = result.stdout + result.stderr
    assert result.returncode == 1, output
    assert "[baseline-stale]" in output
    assert path in output
    baseline = tree / BASELINE
    baseline.write_text(
        "\n".join(line for line in baseline.read_text(encoding="utf-8").splitlines() if line != path) + "\n",
        encoding="utf-8",
    )
    staged = _run(tree, "git", "add", BASELINE)
    assert staged.returncode == 0, staged.stderr
    shrunk = _ratchet(tree)
    assert shrunk.returncode == 0, shrunk.stdout + shrunk.stderr
