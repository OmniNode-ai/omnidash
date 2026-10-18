# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-17427: keep repository prose in the public knowledge base.

Restoring the removed documents or the old README fails these tests. Required
machine-read files and the existing compliance tests' links must remain.
"""

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_BASE = "https://github.com/OmniNode-ai/knowledge_base"


@pytest.mark.parametrize(
    "path", ["CHANGELOG.md", "SECURITY.md", ".github/CONTRIBUTING.md"]
)
def test_unconsumed_documentation_is_removed(path: str) -> None:
    assert not (REPO_ROOT / path).exists(), f"Unconsumed documentation remains: {path}"


@pytest.mark.parametrize(
    "path", ["README.md", "CLAUDE.md", ".claude/architecture-handshake.md", "LICENSE"]
)
def test_required_repository_files_remain(path: str) -> None:
    assert (REPO_ROOT / path).is_file(), f"Required repository file is missing: {path}"


def test_readme_is_a_short_knowledge_base_entry_point() -> None:
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert 3 <= len(readme.splitlines()) <= 5, "README must contain 3-5 lines"
    assert f"]({KNOWLEDGE_BASE})" in readme, "Public knowledge base link is missing"


@pytest.mark.parametrize(
    "page",
    [
        "architecture/omnidash-component-truth-boundary.md",
        "reference/omnidash-typography-primitives.md",
    ],
)
def test_readme_retains_compliance_links(page: str) -> None:
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert f"]({KNOWLEDGE_BASE}/blob/main/{page})" in readme
