# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20998: preserve the required title context and the reusable's verdicts.

The CLI fixture installs the workflow's pinned release the same way as the job:
omnimarket without its dependency tree, followed by pydantic. No sibling clone
or local omnimarket source is consulted.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/pr-title-check.yml"
MANIFEST = ROOT / ".github/required-checks.yaml"
CONTEXT = "pr-title / check-title"
NODE = "omnimarket.nodes.node_pr_title_check_compute"
PIN = "0.4.310"
RUNS_ON = "ubuntu-latest"

# Verdict branches from pr-title-check-reusable.yml at
# a89a6f30fabf74189195f57b57fcc5d4751f4c48. Keep Bash's suffix match,
# case conversion, prefix regexes and case-sensitive ticket pattern.
OLD_BASH = r"""
if [[ -z "$PR_TITLE" ]]; then exit 1; fi
TITLE_LOWER=$(echo "$PR_TITLE" | tr '[:upper:]' '[:lower:]')
if [[ "$PR_AUTHOR" == *"[bot]" ]]; then exit 0; fi
if [[ "$TITLE_LOWER" =~ ^(chore\(deps|build\(deps|bump ) ]]; then exit 0; fi
if [[ "$TITLE_LOWER" =~ ^(chore:\ release|chore\(release\)|release:) ]]; then exit 0; fi
if echo "$PR_TITLE" | grep -qE 'OMN-[0-9]+'; then exit 0; fi
exit 1
"""


def _workflow() -> dict[Any, Any]:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def _job() -> dict[str, Any]:
    return _workflow()["jobs"]["pr-title"]


def _environment() -> dict[str, str]:
    return {
        k: v
        for step in _job().get("steps", [])
        for k, v in (step.get("env") or {}).items()
    }


def test_workflow_runs_pinned_node_without_change_control() -> None:
    assert "onex_change_control" not in WORKFLOW.read_text(encoding="utf-8")
    job = _job()
    assert "uses" not in job
    script = "\n".join(step.get("run", "") for step in job["steps"])
    assert f"-I -m {NODE}" in script
    env = _environment()
    assert re.fullmatch(r"\d+\.\d+\.\d+", env["OMNIMARKET_VERSION"])
    assert env["OMNIMARKET_VERSION"] == PIN
    assert '"omnimarket==${OMNIMARKET_VERSION}"' in script
    assert "--no-deps" in script
    assert '"pydantic>=2.11"' in script
    assert env["PR_TITLE"] == "${{ github.event.pull_request.title }}"
    assert env["PR_AUTHOR"] == "${{ github.event.pull_request.user.login }}"
    assert "json.dumps" in script
    assert all("actions/checkout" not in step.get("uses", "") for step in job["steps"])
    (setup,) = [step["uses"] for step in job["steps"] if "uses" in step]
    assert setup == "astral-sh/setup-uv@37802adc94f370d6bfd71619e3f0bf239e1f3b78"


def test_workflow_preserves_context_triggers_and_runner() -> None:
    workflow = _workflow()
    assert workflow["name"] == "PR Title Check"
    assert set(workflow["jobs"]) == {"pr-title"}
    assert workflow[True] == {"pull_request": {"types": ["opened", "edited"]}}
    job = _job()
    assert job["name"] == CONTEXT
    assert job["runs-on"] == RUNS_ON
    assert job["timeout-minutes"] == 10
    assert job["permissions"] == {"contents": "read"}
    assert "if" not in job
    assert "needs" not in job
    assert "continue-on-error" not in job


def test_manifest_names_the_local_producer() -> None:
    gates = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))["gates"]
    (row,) = [gate for gate in gates if gate["name"] == CONTEXT]
    assert row["mode"] == "REQUIRED"
    assert row["producer_kind"] == "local"
    assert row["workflow"] == "pr-title-check.yml"
    assert row["job_path"] == ["pr-title"]
    assert row["skip_semantics"] == "never"
    assert "cross_repo_ref" not in row
    assert "caller_job" not in row
    assert "onex_change_control" not in row["rationale"]


@pytest.fixture(scope="session")
def node_python(tmp_path_factory: pytest.TempPathFactory) -> Path:
    venv = tmp_path_factory.mktemp("pr-title-node") / "venv"
    python = venv / "bin/python"
    commands = [
        ["uv", "venv", "--quiet", "--python", "3.12", str(venv)],
        [
            "uv",
            "pip",
            "install",
            "--quiet",
            "--python",
            str(python),
            "--no-deps",
            f"omnimarket=={PIN}",
        ],
        ["uv", "pip", "install", "--quiet", "--python", str(python), "pydantic>=2.11"],
    ]
    for command in commands:
        result = subprocess.run(
            command, check=False, capture_output=True, text=True, timeout=45
        )
        assert result.returncode == 0, result.stdout + result.stderr
    return python


CASES = [
    ("bare title", "reviewer[bot]", 0),
    ("bare title", "reviewer[bot]-human", 1),
    ("bare title", "reviewer[BOT]", 1),
    ("chore(deps): update", "human", 0),
    ("CHORE(DEPS-DEV): update", "human", 0),
    ("build(deps): update", "human", 0),
    ("BUILD(DEPS): update", "human", 0),
    ("bump package", "human", 0),
    ("BuMp package", "human", 0),
    ("chore: release 1.0", "human", 0),
    ("CHORE: RELEASE 1.0", "human", 0),
    ("chore(release): 1.0", "human", 0),
    ("ChOrE(ReLeAsE): 1.0", "human", 0),
    ("release: 1.0", "human", 0),
    ("RELEASE: 1.0", "human", 0),
    ("ci: title check [OMN-20998]", "human", 0),
    ("OMN-0", "human", 0),
    ("fix: OMN-12 and OMN-34", "human", 0),
    ("bare title", "human", 1),
    ("fix: omn-123", "human", 1),
    ("fix: OMN-no-number", "human", 1),
    ("fix: chore(deps): update", "human", 1),
    ("", "human", 1),
    ("", "reviewer[bot]", 1),
    ('chore(deps): quoted "value"; echo ignored', "human", 0),
]


@pytest.mark.parametrize(("title", "author", "expected"), CASES)
def test_parity_with_old_bash(
    node_python: Path, title: str, author: str, expected: int
) -> None:
    env = dict(os.environ, PR_TITLE=title, PR_AUTHOR=author)
    old = subprocess.run(
        ["bash", "-c", OLD_BASH],
        check=False,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    node = subprocess.run(
        [str(node_python), "-I", "-m", NODE],
        check=False,
        input=json.dumps({"title": title, "author": author}),
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert old.returncode == expected, old.stdout + old.stderr
    assert node.returncode == old.returncode, node.stdout + node.stderr


@pytest.mark.parametrize("payload", ["{", "{}", '{"title": 1, "author": "human"}'])
def test_malformed_request_is_not_a_verdict(node_python: Path, payload: str) -> None:
    result = subprocess.run(
        [str(node_python), "-I", "-m", NODE],
        check=False,
        input=payload,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 2, result.stdout + result.stderr
    assert "PR_TITLE_CHECK_BAD_REQUEST" in result.stderr
