# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""AC2 Done-gate check for OMN-26767: the signed tag v1.1.17 names the bump's merge commit,
contains the merges of omnidash#542 and #543, and its release carries the bundle and .sha256.

Failure modes:

* tag v1.1.17 does not exist or points at the wrong commit;
* tag v1.1.17 is not annotated or is not signed;
* the merges of #542 or #543 are not ancestors of the tagged commit;
* gh release view v1.1.17 does not list omnidash-bundle-v1.1.17.tar.gz or its .sha256.

Plain pytest, matching this directory's bare-env convention.
"""

from __future__ import annotations

import json
import subprocess

TAG = "v1.1.17"
TAG_COMMIT = "46cec44f36619b8af93af41c353d5471195aad25"
PR542_MERGE = "ab6b116d3ed1d03bc8707a3ba923b1560041636c"
PR543_MERGE = "23687cd74d6d84d806e95011459ca0ad6eab9abc"
BUNDLE_ASSET = "omnidash-bundle-v1.1.17.tar.gz"
BUNDLE_SHA256_ASSET = "omnidash-bundle-v1.1.17.tar.gz.sha256"
REPO = "OmniNode-ai/omnidash"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=True)


def test_tag_exists_and_points_at_merge_commit() -> None:
    r = _run("git", "rev-parse", f"{TAG}^{{commit}}")
    assert r.stdout.strip() == TAG_COMMIT, (
        f"tag {TAG} points at {r.stdout.strip()}, expected {TAG_COMMIT}"
    )


def test_pr542_merge_is_ancestor_of_tag() -> None:
    _run("git", "merge-base", "--is-ancestor", PR542_MERGE, TAG)


def test_pr543_merge_is_ancestor_of_tag() -> None:
    _run("git", "merge-base", "--is-ancestor", PR543_MERGE, TAG)


def test_tag_is_annotated() -> None:
    r = _run("git", "cat-file", "-t", TAG)
    assert r.stdout.strip() == "tag", (
        f"{TAG} is {r.stdout.strip()}, expected annotated tag"
    )


def test_tag_is_signed() -> None:
    r = _run("git", "cat-file", "tag", TAG)
    body = r.stdout
    assert (
        "-----BEGIN SSH SIGNATURE-----" in body
        or "-----BEGIN PGP SIGNATURE-----" in body
    ), f"{TAG} has no signature block"


def test_release_carries_bundle_and_sha256() -> None:
    r = _run("gh", "release", "view", TAG, "--repo", REPO, "--json", "assets")
    assets = {a["name"] for a in json.loads(r.stdout).get("assets", [])}
    assert BUNDLE_ASSET in assets, f"release {TAG} missing {BUNDLE_ASSET}"
    assert BUNDLE_SHA256_ASSET in assets, f"release {TAG} missing {BUNDLE_SHA256_ASSET}"
