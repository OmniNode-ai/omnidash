# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""Pin the release version the v1.1.11 dashboard bundle is cut from (OMN-21469, AC1).

`onex dashboard` serves the bundle omnimarket pins, and publish-dashboard-bundle.yml
builds that bundle from the commit a `vX.Y.Z` tag names. The tag is cut on the
merge commit of a version-bump change (v1.1.10 was omnidash#400), so the version
the package declares has to be the one the tag will carry, in every place npm
records it:

* `package.json` `version`;
* `package-lock.json` top-level `version`;
* `package-lock.json` `packages[""].version`, the root package entry, which npm
  rewrites on install and which drifts silently when only package.json is edited.

A bump that moves one and not the others builds a bundle whose reported version
disagrees with its tag. This pins all three to the release being cut; the next
release moves this constant with them.

Plain pytest, matching this directory's bare-env convention.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELEASE = "1.1.11"


def _json(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def test_package_json_declares_the_release() -> None:
    assert _json("package.json")["version"] == RELEASE


def test_lockfile_top_level_version_matches() -> None:
    assert _json("package-lock.json")["version"] == RELEASE


def test_lockfile_root_package_entry_matches() -> None:
    assert _json("package-lock.json")["packages"][""]["version"] == RELEASE
