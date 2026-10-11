# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-19994: the Receipt Gate caller must pin a workflow whose nested
validator accepts ``artifact_sha256`` on ``ModelDodReceipt``.

omnibase_core ``1e69bec909f2`` pins its nested validator to ``d35ae63d3687``,
whose model forbids ``artifact_sha256``. Run 37148478595 on omnidash#353 failed
with ``extra_forbidden`` on a captured receipt, and changing only the caller sha
does not move the nested pin. ``fad21c409`` is the first published workflow whose
nested validator is ``50f790aacb51`` (omnibase_core#1853).

Failure modes this catches: the caller reverted to, or left on, a workflow
whose nested validator rejects captured receipts; the caller moved to a branch
name; the ``uses:`` line was removed so nothing is checked.
"""

from __future__ import annotations

import re
from pathlib import Path

CALLER = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "call-receipt-gate.yml"
USES = re.compile(r"^\s*uses:\s*OmniNode-ai/omnibase_core/\.github/workflows/receipt-gate\.yml@([0-9a-zA-Z._/-]+)", re.M)

# Published workflow shas whose nested validator forbids artifact_sha256.
REJECTS_ARTIFACT_SHA256 = {"1e69bec909f245be511803191554e5b340def0b7"}


def _pin() -> str:
    found = USES.findall(CALLER.read_text())
    assert len(found) == 1, f"expected exactly one receipt-gate `uses:` in {CALLER.name}, found {found}"
    return found[0]


def test_caller_pin_is_a_full_sha() -> None:
    assert re.fullmatch(r"[0-9a-f]{40}", _pin())


def test_caller_pin_is_not_a_workflow_that_rejects_artifact_sha256() -> None:
    assert _pin() not in REJECTS_ARTIFACT_SHA256
