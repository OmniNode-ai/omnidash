# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""The closer can resolve the migrated contracts without a sibling checkout.

The SHA-256 values were read from onex_change_control commit
49cfc14c21a2c50f9964c1aeed4b66001ce279a3. Missing contracts fail discovery;
changed bytes fail preservation. This test needs no change-control checkout.
"""

import hashlib
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_SHA256 = {
    "OMN-14754": "ed793259c5efb745900057ef0c50f85783a4f3d7eaf74a1a2cb0aeeb4bda9182",
    "OMN-14895": "e366fb5bbf8fbbc2cc5123e54fcd282c1b405e718878edd8bdb747b195788a75",
    "OMN-16396": "d7e94611696bf2a1843b5cc59ac4469fcd028b974c4b93f3f3d620d5f5327a8c",
    "OMN-17184": "1b2c72198f0ab3a3fd487675de0e89e6080c5d89b7db1eec41b518204d1d00ab",
    "OMN-17874": "c8b6d3f6fb9932398b85c0d477d0e35a8bd8b964977bb9869206a1da1cea17e3",
    "OMN-18028": "8abd0477df3385adc24d88736b3cbc7e47de761924d1b721a7eb98d2c39ff9d6",
    "OMN-19865": "56289e8e7b6403c4229511c3090940aef1bb4d37a855eba3c7bcf23abce57d5f",
    "OMN-20186": "7b31ccbc295b6dd629a27b98614fb4f2e03df5c6f7dbb950b4c97372e95389f6",
}


@pytest.mark.parametrize("ticket", SOURCE_SHA256)
def test_migrated_contract_is_locally_resolvable(ticket: str) -> None:
    path = REPO_ROOT / "contracts" / f"{ticket}.yaml"
    assert path.is_file(), f"Closer cannot resolve the repository-owned contract: {ticket}"


@pytest.mark.parametrize("ticket, expected_sha256", SOURCE_SHA256.items())
def test_migrated_contract_preserves_source_bytes(
    ticket: str, expected_sha256: str
) -> None:
    path = REPO_ROOT / "contracts" / f"{ticket}.yaml"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected_sha256, (
        f"Migrated contract differs from the source: {ticket}"
    )
