# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20074: the S6 cut-over keeps the skip-token scan without OCC contexts.

The caller adopts omniclaude#2540's preflight-free reusable. The manifest drops
the OCC contexts while preserving the required scan. This change lands with
the S6 dev branch-protection change and not before (epic OMN-20068).
"""

from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CALLER = REPO_ROOT / ".github" / "workflows" / "call-reject-skip.yml"
MANIFEST = REPO_ROOT / ".github" / "required-checks.yaml"
PREFLIGHT_FREE_REF = (
    "OmniNode-ai/omniclaude/.github/workflows/reject-deploy-gate-skip.yml"
    "@4358450ccbba0cee11e390208dd0b8b1728e94ab"
)
SCAN = "call-reject-skip-token / scan / reject-skip-gate-token"


def test_skip_token_caller_pins_the_preflight_free_reusable() -> None:
    caller = yaml.safe_load(CALLER.read_text(encoding="utf-8"))
    assert caller["jobs"]["call-reject-skip-token"]["uses"] == PREFLIGHT_FREE_REF


def test_manifest_scan_row_names_the_same_pin() -> None:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    scan = next(row for row in manifest["gates"] if row["name"] == SCAN)
    assert scan["cross_repo_ref"] == PREFLIGHT_FREE_REF


def test_manifest_drops_the_occ_contexts_for_the_s6_cutover() -> None:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    names = {row["name"] for row in manifest["gates"]}
    assert not names.intersection(
        {
            "occ-preflight / eligibility",
            "verify / verify",
            "call-reject-skip-token / occ-preflight / eligibility",
        }
    )


def test_manifest_keeps_the_scan_context() -> None:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    scan = next(row for row in manifest["gates"] if row["name"] == SCAN)
    assert scan["mode"] == "REQUIRED"
