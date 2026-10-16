# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-9050: check-handshake.yml is the only omnibase_core pin of this repository.

The omnibase_core pin-bump bot rewrites ``check-handshake.yml``. A second
workflow that carried its own literal ref fell behind on every bump, and the
repository's checks went red (``ONEX Schema Compatibility Check`` on 2026-10-14
and again on 2026-10-15). The type-sync and schema-compatibility workflows now
read the handshake's pin through a resolver step, and this test fails when any
workflow other than the handshake checks out omnibase_core at a ref of its own.

Only the standard library, pytest and pyyaml are used, so the
``workflow-script-refs.yml`` bare environment can run it with ``--noconftest``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
CORE = "OmniNode-ai/omnibase_core"
DECLARED_SOURCE = "check-handshake.yml"
SHA = re.compile(r"^[0-9a-f]{40}$")
RESOLVED = re.compile(r"^\$\{\{\s*steps\.[A-Za-z_][A-Za-z0-9_-]*\.outputs\.ref\s*\}\}$")
# Workflows that must read the pin, not carry one: they are what the bot used to
# bump (type-sync) or forgot (schema compatibility).
CONSUMERS = ("type-sync-check.yml", "onex-schema-compat.yml")


def core_checkout_refs(text: str) -> list[str | None]:
    """The ``ref`` of every ``omnibase_core`` checkout step (None when absent)."""
    workflow = yaml.safe_load(text) or {}
    return [
        (step.get("with") or {}).get("ref")
        for job in (workflow.get("jobs") or {}).values()
        for step in job.get("steps") or []
        if (step.get("with") or {}).get("repository") == CORE
    ]


def own_refs(text: str) -> list[str]:
    """Core checkouts that do not consume a resolver's ``outputs.ref``."""
    return [
        str(ref) for ref in core_checkout_refs(text) if not RESOLVED.fullmatch(str(ref))
    ]


def _workflow_files() -> list[Path]:
    return sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])


def test_the_declared_source_pins_one_full_sha() -> None:
    refs = core_checkout_refs((WORKFLOWS / DECLARED_SOURCE).read_text(encoding="utf-8"))
    assert len(refs) == 1 and SHA.fullmatch(str(refs[0])), refs


@pytest.mark.parametrize("name", CONSUMERS)
def test_consumers_check_out_core_and_carry_no_ref_of_their_own(name: str) -> None:
    text = (WORKFLOWS / name).read_text(encoding="utf-8")
    assert core_checkout_refs(text), f"{name}: no omnibase_core checkout"
    assert own_refs(text) == [], f"{name} carries its own omnibase_core ref"


@pytest.mark.parametrize(
    "path", [p for p in _workflow_files() if p.name != DECLARED_SOURCE], ids=lambda p: p.name
)
def test_no_workflow_but_the_handshake_carries_a_core_ref(path: Path) -> None:
    found = own_refs(path.read_text(encoding="utf-8"))
    assert found == [], (
        f"{path.name} checks out omnibase_core at {found}; read the pin "
        f"{DECLARED_SOURCE} declares through a resolver step instead (OMN-9050)"
    )


# --- the scanner can fail: it flags a known-bad workflow ---------------------

_LITERAL = """\
jobs:
  a:
    steps:
      - uses: actions/checkout@v4
        with:
          repository: OmniNode-ai/omnibase_core
          ref: d677b4e78219113139b5d20ac81efcdcef78e3e0
"""
_RESOLVED = _LITERAL.replace(
    "d677b4e78219113139b5d20ac81efcdcef78e3e0", "${{ steps.core-pin.outputs.ref }}"
)


@pytest.mark.parametrize(
    "ref", ["d677b4e78219113139b5d20ac81efcdcef78e3e0", "dev", "${{ github.sha }}"]
)
def test_scanner_flags_a_ref_of_its_own(ref: str) -> None:
    text = _LITERAL.replace("d677b4e78219113139b5d20ac81efcdcef78e3e0", ref)
    assert own_refs(text) == [ref]


def test_scanner_flags_a_checkout_with_no_ref() -> None:
    text = _LITERAL.replace("          ref: d677b4e78219113139b5d20ac81efcdcef78e3e0\n", "")
    assert own_refs(text) == ["None"]


def test_scanner_passes_a_resolved_ref() -> None:
    assert core_checkout_refs(_RESOLVED) == ["${{ steps.core-pin.outputs.ref }}"]
    assert own_refs(_RESOLVED) == []
