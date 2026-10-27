# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20073 / OMN-20074: omnidash's repo-evidence caller enforces after S6.

Admission verifies repo-owned evidence without shadowing or comparing with OCC.
The caller uses the pinned receipt-gate and verifier, runs from the base branch,
and keeps its context prefix. A dev ruleset is to require repo-evidence /
dod-verify; it has no required-checks manifest row. CI Summary judges only its
own test and tenant-rls needs and never sweeps external check-runs.
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

# Squash commit of omnibase_core#2102 on dev (OMN-21166), the first receipt-gate
# whose sibling resolver reads .github/sibling-pins.yaml (AC209). It keeps the
# check-timeout-seconds input of omnibase_core#2085 (ba76a6f0), which #1932's
# 4e4f5e04 did not take.
RECEIPT_GATE_PIN = "abc2cb3e85b962bb8dc5a12a308d8a723b3f42a4"
# Seconds each dod_verify check may run; at the verifier's 30 s default the
# browser checks were killed before reaching a verdict.
CHECK_TIMEOUT_SECONDS = "300"
VERIFIER_FLOOR = (0, 4, 310)
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


def test_caller_enforces_and_stops_comparing_with_occ_after_the_s6_cutover() -> None:
    inputs = _job()["with"]
    assert inputs["evidence-source"] == "caller"
    # Quoted strings: the reusable's boolean-like inputs are string inputs.
    assert inputs["shadow"] == "false"
    assert inputs["compare-with-occ"] == "false"


def test_no_repo_evidence_context_is_a_required_check() -> None:
    gates = _load(MANIFEST)["gates"]
    assert not [g["name"] for g in gates if g["name"].startswith("repo-evidence")]
    producers = [
        g
        for g in gates
        if g.get("workflow") == CALLER.name or g.get("caller_workflow") == CALLER.name
    ]
    assert not producers, "repo-evidence is to be required by a dev ruleset, not a manifest row"


def test_ci_summary_judges_only_its_own_needs_never_external_check_runs() -> None:
    summary = _load(CI)["jobs"]["ci-summary"]
    assert summary["name"] == "CI Summary"
    assert set(summary["needs"]) == {"test", "tenant-rls", "public-runner-placement"}
    script = "\n".join(step.get("run", "") for step in summary["steps"])
    for token in ("check-runs", "check_runs", "statuses", "gh api", "gh pr checks"):
        assert token not in script, f"CI Summary must not sweep external checks: {token}"
    assert "repo-evidence" not in script


def test_caller_pins_the_current_receipt_gate_and_verifier() -> None:
    inputs = _job()["with"]
    assert _job()["uses"].endswith(f"receipt-gate.yml@{RECEIPT_GATE_PIN}")
    version = tuple(int(part) for part in inputs["verifier-version"].split("."))
    assert version >= VERIFIER_FLOOR


def test_caller_gives_each_check_a_browser_sized_timeout() -> None:
    # A quoted whole number of seconds within the reusable's 1 to 900 range; an
    # unquoted or out-of-range value is refused there, and an absent one keeps 30 s.
    timeout = _job()["with"].get("check-timeout-seconds")
    assert timeout == CHECK_TIMEOUT_SECONDS
    assert isinstance(timeout, str) and timeout.isdigit() and 1 <= int(timeout) <= 900


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
