# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT

from __future__ import annotations

import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _run(script: str, path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", script, str(path)],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_env_contamination_checks_only_supplied_files(tmp_path: Path) -> None:
    clean = tmp_path / "clean.ts"
    dirty = tmp_path / "dirty.ts"
    clean.write_text("export const value = 'ok'\n", encoding="utf-8")
    forbidden_path = "/" + "Users/example"
    dirty.write_text(f"export const value = '{forbidden_path}'\n", encoding="utf-8")

    assert _run("scripts/check-no-env-contamination.sh", clean).returncode == 0
    assert _run("scripts/check-no-env-contamination.sh", dirty).returncode == 1


def test_delegation_refs_checks_only_supplied_files(tmp_path: Path) -> None:
    clean = tmp_path / "clean.ts"
    dirty = tmp_path / "dirty.ts"
    clean.write_text("export const value = '/api/delegation'\n", encoding="utf-8")
    dirty.write_text("export const value = 'localhost:8085'\n", encoding="utf-8")

    assert _run("scripts/check-hardcoded-delegation-refs.sh", clean).returncode == 0
    assert _run("scripts/check-hardcoded-delegation-refs.sh", dirty).returncode == 1
