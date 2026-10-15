# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20937: contract.local.yaml.example carries a broker placeholder, not a lab host.

Lab and deployment configuration does not belong in a shipped repository. The
example names the shape of the broker address; the ignored contract.local.yaml
holds the operator's own endpoints.

Falsifier: restore a private LAN address or a tailnet name in the example and
these tests fail.

Only the standard library, pytest and pyyaml are used, so the file runs with
``--noconftest``.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "contract.local.yaml.example"

PRIVATE_LAN = re.compile(r"\b192\.168\.\d{1,3}\.\d{1,3}\b")
TAILNET = re.compile(r"\.ts\.net\b")
PLACEHOLDER = "<broker-host>:<port>"


def _text() -> str:
    return EXAMPLE.read_text(encoding="utf-8")


def test_example_holds_no_private_lan_address() -> None:
    assert PRIVATE_LAN.search(_text()) is None


def test_example_holds_no_tailnet_name() -> None:
    assert TAILNET.search(_text()) is None


def test_example_broker_is_the_placeholder() -> None:
    loaded = yaml.safe_load(_text())
    assert isinstance(loaded, dict)
    assert loaded["event_bus"]["bootstrap_servers"] == PLACEHOLDER
