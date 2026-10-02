# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20332: omnidash CI reads every sibling repo at a pinned commit.

A workflow that reads a sibling repo at its live ``dev`` or ``main`` (or with no
ref at all, which is the default branch) goes red the moment that sibling
merges, and no omnidash PR can fix it. On 2026-10-01 an omniclaude merge turned
omnimarket dev red exactly that way. The ruling (2026-10-01T21:43:10Z): each
repo reads its siblings at a pinned version, and moves a pin only in a PR that
tests the new version.

Each test names the read it exists to catch:

* a reusable workflow or composite action of a sibling addressed by a branch;
* an ``actions/checkout`` of a sibling with ``ref: dev``, ``ref: main``, any
  other non-sha ref, or no ref;
* a ``git clone`` of a sibling that is never moved to a recorded commit;
* a ``cross_repo_ref`` in ``.github/required-checks.yaml`` naming a branch;
* a scanner that matches nothing, which would pass every assertion while
  checking nothing.

Only the standard library, pytest and pyyaml are used, so the
``workflow-script-refs.yml`` bare environment can run it with ``--noconftest``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
REQUIRED_CHECKS = REPO_ROOT / ".github" / "required-checks.yaml"

SHA = re.compile(r"^[0-9a-f]{40}$")
# Any OmniNode-ai repo other than this one is a sibling.
SIBLING = r"OmniNode-ai/(?!omnidash\b)([A-Za-z0-9_-]+)"
USES = re.compile(rf"^\s*(?:-\s+)?uses:\s*{SIBLING}/(\S+?)@(\S+)")
REPOSITORY = re.compile(rf"^(\s*)repository:\s*['\"]?{SIBLING}['\"]?\s*$")
REF = re.compile(r"^\s*ref:\s*['\"]?([^'\"\s#]+)")
CLONE = re.compile(rf"git clone\b.*{SIBLING}")
MOVED_TO_SHA = re.compile(r"git\s+(?:-C\s+\S+\s+)?(?:checkout|fetch\b.*)\s.*\b[0-9a-f]{40}\b")
STEP_START = re.compile(r"^\s*-\s+(?:name|uses|run):")


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def live_uses(text: str) -> list[str]:
    """``uses:`` of a sibling workflow or action whose ref is not a full sha."""
    found = []
    for lineno, line in enumerate(text.splitlines(), 1):
        m = USES.match(line)
        if m and not SHA.fullmatch(m.group(3)):
            found.append(f"{lineno}: {m.group(1)}/{m.group(2)}@{m.group(3)}")
    return found


def live_checkouts(text: str) -> list[str]:
    """``repository:`` of a sibling whose ``with:`` block has no full-sha ``ref:``."""
    lines = text.splitlines()
    found = []
    for i, line in enumerate(lines):
        m = REPOSITORY.match(line)
        if not m:
            continue
        indent = len(m.group(1))
        start = i
        while start > 0 and _indent(lines[start - 1]) >= indent and lines[start - 1].strip():
            start -= 1
        end = i + 1
        while end < len(lines) and (not lines[end].strip() or _indent(lines[end]) >= indent):
            end += 1
        refs = [r.group(1) for ln in lines[start:end] if (r := REF.match(ln))]
        ref = refs[0] if refs else None
        if ref is None or not SHA.fullmatch(ref):
            found.append(f"{i + 1}: {m.group(2)} ref={ref}")
    return found


def live_clones(text: str) -> list[str]:
    """``git clone`` of a sibling with no checkout or fetch of a sha in the same step."""
    lines = text.splitlines()
    found = []
    for i, line in enumerate(lines):
        m = CLONE.search(line)
        if not m:
            continue
        end = i + 1
        while end < len(lines) and not STEP_START.match(lines[end]):
            end += 1
        if not any(MOVED_TO_SHA.search(ln) for ln in lines[i:end]):
            found.append(f"{i + 1}: git clone {m.group(1)}")
    return found


def _workflow_files() -> list[Path]:
    return sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])


def _sibling_reads_in_tree() -> int:
    count = 0
    for path in _workflow_files():
        text = path.read_text()
        count += len(re.findall(rf"(?:uses:|repository:|git clone)[^\n]*{SIBLING}", text))
    return count


# --- the scanner can fail: each extractor flags a known-bad line -------------

BAD_WORKFLOW = """\
jobs:
  a:
    uses: OmniNode-ai/omnibase_core/.github/workflows/receipt-gate.yml@main
  b:
    uses: OmniNode-ai/omniclaude/.github/workflows/x.yml@dev
  c:
    steps:
      - uses: OmniNode-ai/onex_change_control/.github/actions/validate-contract@v1
      - name: no ref
        uses: actions/checkout@v4
        with:
          repository: OmniNode-ai/omnimarket
          path: src
      - name: branch ref
        uses: actions/checkout@v4
        with:
          repository: OmniNode-ai/omnibase_core
          ref: dev
      - name: clone, never pinned
        run: git clone --depth=1 https://github.com/OmniNode-ai/omnibase_core.git ../core
      - name: next step
        run: echo done
"""

GOOD_WORKFLOW = """\
jobs:
  a:
    uses: OmniNode-ai/omnibase_core/.github/workflows/receipt-gate.yml@1e69bec909f245be511803191554e5b340def0b7
  c:
    steps:
      - uses: OmniNode-ai/omnidash/.github/actions/local@main
      - name: pinned checkout
        uses: actions/checkout@v4
        with:
          ref: 1e69bec909f245be511803191554e5b340def0b7
          repository: OmniNode-ai/omnibase_core
      - name: clone, then pinned
        run: |
          git clone https://github.com/OmniNode-ai/omnibase_core.git ../core
          git -C ../core checkout 1e69bec909f245be511803191554e5b340def0b7
"""


def test_extractors_flag_every_live_read() -> None:
    assert live_uses(BAD_WORKFLOW) == [
        "3: omnibase_core/.github/workflows/receipt-gate.yml@main",
        "5: omniclaude/.github/workflows/x.yml@dev",
        "8: onex_change_control/.github/actions/validate-contract@v1",
    ]
    assert live_checkouts(BAD_WORKFLOW) == [
        "12: omnimarket ref=None",
        "17: omnibase_core ref=dev",
    ]
    assert live_clones(BAD_WORKFLOW) == ["20: git clone omnibase_core"]


def test_extractors_pass_pinned_reads_and_this_repo() -> None:
    assert live_uses(GOOD_WORKFLOW) == []
    assert live_checkouts(GOOD_WORKFLOW) == []
    assert live_clones(GOOD_WORKFLOW) == []


def test_the_scanner_sees_the_trees_sibling_reads() -> None:
    assert _sibling_reads_in_tree() > 0, "no sibling read found: the pattern is broken"


# --- the tree -----------------------------------------------------------------


@pytest.mark.parametrize("path", _workflow_files(), ids=lambda p: p.name)
def test_no_sibling_read_at_a_live_branch(path: Path) -> None:
    text = path.read_text()
    bad = [
        *(f"uses {x}" for x in live_uses(text)),
        *(f"checkout {x}" for x in live_checkouts(text)),
        *(f"clone {x}" for x in live_clones(text)),
    ]
    assert not bad, f"{path.name} reads a sibling at a live branch: {bad}"


def test_required_checks_cross_repo_refs_are_pinned() -> None:
    manifest = yaml.safe_load(REQUIRED_CHECKS.read_text())
    rows = [
        row
        for value in manifest.values()
        if isinstance(value, list)
        for row in value
        if isinstance(row, dict) and row.get("cross_repo_ref")
    ]
    assert rows, "no cross_repo_ref rows found: the manifest shape changed"
    bad = [
        row["cross_repo_ref"]
        for row in rows
        if not SHA.fullmatch(str(row["cross_repo_ref"]).rsplit("@", 1)[-1])
    ]
    assert not bad, f"cross_repo_ref at a live branch: {bad}"
