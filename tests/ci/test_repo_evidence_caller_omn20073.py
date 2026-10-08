# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20073/OMN-20074: omnidash's repo-evidence caller enforces after S6.

The caller's ``shadow`` and ``compare-with-occ`` inputs are ``"false"``: the
verdict is real, and the difference step must not wait for an OCC verdict after
dev branch protection drops the OCC contexts. ``repo-evidence / dod-verify`` is
required by a repository ruleset on refs/heads/dev, so it has no required-checks
manifest row. The verifier retains the classifier for a comparison rollback.
Omnidash's ``CI Summary`` must not read external check-runs.

Failure modes this catches: the caller re-enabled shadow or OCC comparison after
the S6 cut-over; the verifier lost the classifier; the pin moved to a branch name; the
caller moved to ``pull_request`` (a PR could then edit what judges it); a job
name was added (the context prefix would change); a repo-evidence context was
added to the branch-protection manifest despite its ruleset requirement; CI Summary began to
sweep external check-runs.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CALLER = REPO_ROOT / ".github" / "workflows" / "call-repo-evidence-gate.yml"
CI = REPO_ROOT / ".github" / "workflows" / "ci.yml"
MANIFEST = REPO_ROOT / ".github" / "required-checks.yaml"

# First release whose wheel ships node_dod_verify occ-difference (omnimarket#3277).
DIFFERENCE_CLASSIFIER_FLOOR = (0, 4, 294)


def _load(path: Path) -> dict[Any, Any]:
    assert path.is_file(), f"missing {path}"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _job() -> dict[str, Any]:
    return _load(CALLER)["jobs"]["repo-evidence"]


def test_caller_runs_from_the_base_branch_on_dev_and_main() -> None:
    doc = _load(CALLER)
    # YAML 1.1 reads a bare `on` as the boolean True.
    triggers = doc.get("on", doc.get(True))
    assert set(triggers) == {"pull_request_target"}
    assert triggers["pull_request_target"]["branches"] == ["dev", "main"]
    assert triggers["pull_request_target"]["types"] == [
        "opened",
        "synchronize",
        "reopened",
        "edited",
        "ready_for_review",
    ]
    assert doc["permissions"] == {"contents": "read", "pull-requests": "read"}
    assert set(doc["jobs"]) == {"repo-evidence"}


def test_caller_job_is_a_bare_call_with_no_secrets() -> None:
    job = _job()
    for key in ("steps", "secrets", "if", "name", "permissions"):
        assert key not in job, f"caller job must not declare {key}"
    assert "secrets: inherit" not in CALLER.read_text(encoding="utf-8")


def test_caller_pins_the_reusable_by_full_sha() -> None:
    assert re.fullmatch(
        r"OmniNode-ai/omnibase_core/\.github/workflows/receipt-gate\.yml@[0-9a-f]{40}",
        _job()["uses"],
    )


def test_caller_enforces_and_stops_comparing_with_occ_after_the_s6_cutover() -> None:
    inputs = _job()["with"]
    assert inputs["evidence-source"] == "caller"
    # Quoted strings: the reusable's boolean-like inputs are string inputs.
    assert inputs["shadow"] == "false"
    assert inputs["compare-with-occ"] == "false"
    version = tuple(int(part) for part in inputs["verifier-version"].split("."))
    assert version >= DIFFERENCE_CLASSIFIER_FLOOR


def test_no_repo_evidence_context_is_a_required_check() -> None:
    gates = _load(MANIFEST)["gates"]
    assert not [g["name"] for g in gates if g["name"].startswith("repo-evidence")], (
        "repo-evidence is ruleset-required on dev, never a branch-protection manifest row"
    )
    producers = [
        g
        for g in gates
        if g.get("workflow") == CALLER.name or g.get("caller_workflow") == CALLER.name
    ]
    assert not producers, "ruleset-required caller must not have a branch-protection manifest row"


def test_occ_preflight_context_keeps_its_own_producer() -> None:
    # compare-with-occ reads occ-preflight / eligibility on the same head.
    workflows = REPO_ROOT / ".github" / "workflows"
    texts = [p.read_text(encoding="utf-8") for p in workflows.glob("call-*.yml")]
    assert any(
        "OmniNode-ai/omnibase_core/.github/workflows/occ-preflight.yml@" in t
        for t in texts
    )


def test_ci_summary_judges_only_its_own_needs_never_external_check_runs() -> None:
    summary = _load(CI)["jobs"]["ci-summary"]
    assert summary["name"] == "CI Summary"
    assert set(summary["needs"]) == {"test", "tenant-rls"}
    script = "\n".join(step.get("run", "") for step in summary["steps"])
    for token in ("check-runs", "check_runs", "statuses", "gh api", "gh pr checks"):
        assert token not in script, f"CI Summary must not sweep external checks: {token}"
    assert "repo-evidence" not in script
