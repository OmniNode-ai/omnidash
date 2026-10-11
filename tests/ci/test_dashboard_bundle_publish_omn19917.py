# SPDX-FileCopyrightText: 2025 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""Pin the properties omnimarket's checksum pin depends on (OMN-19917, T2.9, D8(a)).

`onex dashboard` downloads this repository's published bundle and refuses it
unless its sha256 matches a value pinned in omnimarket's `pyproject.toml`. Three
properties of publish-dashboard-bundle.yml hold that arrangement up, and each
fails silently rather than loudly if it regresses:

* THE ARCHIVE IS DETERMINISTIC. `tar`'s defaults record the packing machine's
  clock and uid, so two identical builds would publish two different digests and
  the pin would appear to drift on its own. Anyone who sees a pin drift without
  a build change learns to ignore a mismatch, which is the one thing the pin
  exists to prevent.
* THE CHECKSUM FILE IS PUBLISHED, AND IS NOT THE TRUSTED VALUE. It ships for
  `shasum -c` and for a human. An attacker who can replace the bundle can
  replace the file beside it, so the value the CLI trusts lives in omnimarket's
  own tree.
* THE BUILD IS REFUSED WHEN EMPTY. A `dist/` with no `index.html`, or with no
  JavaScript, still serves a 200 for `/` and would pass a naive check while
  every page rendered blank -- the exact failure T2.9's headless-browser step
  exists to catch, caught here instead at the point of publication.

Plain pytest + pyyaml, matching this directory's bare-env convention.
"""

from __future__ import annotations

from pathlib import Path

import yaml

WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/publish-dashboard-bundle.yml"


def _doc() -> dict:
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def _steps() -> list[dict]:
    return _doc()["jobs"]["publish"]["steps"]


def _run_text() -> str:
    return "\n".join(s.get("run", "") for s in _steps())


def test_the_workflow_exists_and_fires_on_a_version_tag() -> None:
    doc = _doc()
    triggers = doc["on"] if "on" in doc else doc[True]
    assert triggers["push"]["tags"] == ["v[0-9]*.[0-9]*.[0-9]*"]
    # Recovery path: a tag whose publish failed must be re-runnable by hand.
    assert "tag" in triggers["workflow_dispatch"]["inputs"]


def test_the_archive_is_packed_deterministically() -> None:
    """Every flag here exists because tar's default would put machine state in
    the digest: member order, mtime, owner and group, and numeric owners."""
    run = _run_text()
    for flag in ("--sort=name", "--mtime=", "--owner=0", "--group=0", "--numeric-owner"):
        assert flag in run, f"{flag} is missing; the published digest would not be reproducible"


def test_both_the_bundle_and_its_checksum_are_uploaded() -> None:
    run = _run_text()
    assert "sha256sum" in run, "nothing computes the digest the pin compares against"
    assert ".sha256" in run, "the checksum file is not written"
    assert "gh release upload" in run
    assert "--clobber" in run, "a re-run must replace the asset rather than fail"


def test_an_empty_or_scriptless_build_is_refused() -> None:
    run = _run_text()
    assert "dist/index.html" in run, "an index-less build would publish and serve a blank 200"
    assert "-name '*.js'" in run, "a bundle with no JavaScript would serve blank pages"


def test_it_does_not_move_main_and_release_yml_still_only_does_that() -> None:
    """release.yml's single mutation is the point of keeping these apart: it
    fast-forwards `main` over REST with an App token, and a build has no
    business in that job."""
    run = _run_text()
    assert "refs/heads/main" not in run
    assert "git push" not in run
    release = (WORKFLOW.parent / "release.yml").read_text(encoding="utf-8")
    assert "npm run build" not in release, "the pointer move must not grow a build"


def test_the_permission_is_only_what_an_upload_needs() -> None:
    assert _doc()["permissions"] == {"contents": "write"}
