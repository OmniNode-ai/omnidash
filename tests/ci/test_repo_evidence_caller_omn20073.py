# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20073: omnidash's repo-evidence caller runs in S5 shadow mode.

The caller records the new-path verdict beside OCC's on the same head and must
block nothing: the reusable's ``shadow`` input makes ``repo-evidence / verify``
and ``repo-evidence / dod-verify`` conclude success, neither context may be a
required check, and omnidash's ``CI Summary`` must not read external check-runs
(so a non-success row from this caller cannot redden it).

Failure modes this catches: the caller dropped ``shadow`` or ``compare-with-occ``
(the check-run would carry a real refusal); the pin moved to a branch name; the
caller moved to ``pull_request`` (a PR could then edit what judges it); a job
name was added (the context prefix would change); a repo-evidence context was
added to the required-check manifest before the S6 ruling; CI Summary began to
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

# Squash commit of omnibase_core#1914 on that repository's dev branch: the receipt-gate
# pin omnibase_core's own caller and omnibase_infra's caller use. 0.4.305 is the first
# omnimarket release carrying omnimarket#3563, the verifier half of the contract-home marker.
RECEIPT_GATE_PIN = "fb0c6c2117d5868a398b0920cd0048d0824415b1"
VERIFIER_FLOOR = (0, 4, 305)
CONTRACT = REPO_ROOT / "contracts" / "OMN-20073.yaml"


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


def test_caller_is_in_shadow_mode_and_compares_with_occ() -> None:
    inputs = _job()["with"]
    assert inputs["evidence-source"] == "caller"
    # Quoted strings: the reusable's boolean-like inputs are string inputs.
    assert inputs["shadow"] == "true"
    assert inputs["compare-with-occ"] == "true"
    version = tuple(int(part) for part in inputs["verifier-version"].split("."))
    assert version >= DIFFERENCE_CLASSIFIER_FLOOR


def test_no_repo_evidence_context_is_a_required_check() -> None:
    gates = _load(MANIFEST)["gates"]
    assert not [g["name"] for g in gates if g["name"].startswith("repo-evidence")]
    producers = [
        g
        for g in gates
        if g.get("workflow") == CALLER.name or g.get("caller_workflow") == CALLER.name
    ]
    assert not producers, "shadow caller must not produce a required context"


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


def test_caller_pins_the_current_receipt_gate_and_verifier() -> None:
    inputs = _job()["with"]
    assert _job()["uses"].endswith(f"receipt-gate.yml@{RECEIPT_GATE_PIN}")
    version = tuple(int(part) for part in inputs["verifier-version"].split("."))
    assert version >= VERIFIER_FLOOR


def test_repo_contract_for_the_pr_ticket_names_a_falsifier_per_criterion() -> None:
    contract = _load(CONTRACT)
    assert contract["ticket_id"] == "OMN-20073"
    criteria = [
        ac
        for req in contract["requirements"]
        for ac in req["acceptance"]
    ]
    assert criteria, "contract must declare acceptance criteria"
    checks = [
        check["check_value"]
        for item in contract["dod_evidence"]
        for check in item["checks"]
    ]
    for criterion in criteria:
        assert "falsifier:" in criterion["statement"]
        falsifier = criterion["statement"].split("falsifier:", 1)[1].strip()
        assert falsifier in checks, f"{criterion['id']} falsifier has no dod check"
        test_file = falsifier.split()[3]
        assert (REPO_ROOT / test_file).is_file(), f"{test_file} does not exist"
