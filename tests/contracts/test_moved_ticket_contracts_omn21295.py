# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-21295: the four contracts moved from change control resolve in this repository.

OMN-18771, OMN-18773, OMN-19645 and OMN-19732 were left out of the first
migration (OMN-17427) and are copied into contracts/ by this change. Each one
must be present at the closer's lookup path, parse as a YAML mapping and name
its own ticket. Its dod_evidence items must each carry an id and a check.
omnibase_core's ModelTicketContract is not used here: it refuses these
contracts' ``ac_bindings`` field as they stand, and their bytes are not
changed by this move.
"""

from pathlib import Path
from typing import Any

import pytest
import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
MOVED_TICKETS = ("OMN-18771", "OMN-18773", "OMN-19645", "OMN-19732")


def _load(ticket: str) -> Any:
    path = REPO_ROOT / "contracts" / f"{ticket}.yaml"
    assert path.is_file(), f"Closer cannot resolve the repository-owned contract: {ticket}"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("ticket", MOVED_TICKETS)
def test_moved_contract_names_its_ticket(ticket: str) -> None:
    data = _load(ticket)
    assert isinstance(data, dict), f"{ticket}: contract is not a YAML mapping"
    assert data.get("ticket_id") == ticket, (ticket, data.get("ticket_id"))


@pytest.mark.parametrize("ticket", MOVED_TICKETS)
def test_moved_contract_evidence_items_carry_checks(ticket: str) -> None:
    data = _load(ticket)
    assert isinstance(data, dict), f"{ticket}: contract is not a YAML mapping"
    items = data.get("dod_evidence")
    assert isinstance(items, list) and items, f"{ticket}: no dod_evidence items"
    for item in items:
        assert isinstance(item, dict) and item.get("id"), (ticket, item)
        checks = item.get("checks")
        assert isinstance(checks, list) and checks, (ticket, item["id"])
        for check in checks:
            assert check.get("check_type") and check.get("check_value"), (
                ticket,
                item["id"],
                check,
            )
