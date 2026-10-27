# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""Tests for OMN-21166 AC212: omnidash sibling pin agreement.

Ensures that the omnibase_core commit declared in .github/sibling-pins.yaml
is the single source of truth, and that every literal actions/checkout@...
reference to the core repo in .github/workflows agrees with that pin.
Step-output refs (expressions) are exempt because they read the handshake's
pin at run time.
"""

from __future__ import annotations

import re
from pathlib import Path
from collections.abc import Iterator
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]

PINS = REPO_ROOT / ".github" / "sibling-pins.yaml"
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
HANDSHAKE = WORKFLOWS / "check-handshake.yml"
CORE = "OmniNode-ai/omnibase_core"


class _UniqueKeySafeLoader(yaml.SafeLoader):
    """yaml.SafeLoader subclass that rejects duplicate mapping keys."""

    def construct_mapping(
        self,
        node: yaml.MappingNode,
        deep: bool = False,
    ) -> dict[Any, Any]:
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if repr(key) in [repr(k) for k in mapping]:
                raise ValueError(
                    f"Duplicate key {key!r} in mapping at line {node.start_mark.line + 1}"
                )
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


_UniqueKeySafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _UniqueKeySafeLoader.construct_mapping,
)


def _load_unique(path: Path) -> Any:
    """Load a YAML file, raising ValueError on any duplicate mapping key."""
    with path.open("r", encoding="utf-8") as fh:
        return yaml.load(fh, Loader=_UniqueKeySafeLoader)


def _declared() -> str:
    """Return the omnibase_core pin value declared in sibling-pins.yaml."""
    data = _load_unique(PINS)
    return data["pins"]["omnibase_core"]


def _core_checkout_refs() -> Iterator[tuple[str, str]]:
    """Yield (workflow file name, ref) for every literal core checkout."""
    for path in sorted(list(WORKFLOWS.glob("*.yml")) + list(WORKFLOWS.glob("*.yaml"))):
        with path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        yield from _walk(data, path.name)


def _walk(node: Any, file_name: str) -> Iterator[tuple[str, str]]:
    """Recursively walk a YAML structure, yielding core checkout refs."""
    if isinstance(node, dict):
        uses = node.get("uses")
        if isinstance(uses, str) and uses.startswith("actions/checkout@"):
            with_block = node.get("with")
            if isinstance(with_block, dict):
                repo = with_block.get("repository")
                if isinstance(repo, str) and repo.lower() == CORE.lower():
                    ref = with_block.get("ref")
                    yield (file_name, str(ref) if ref is not None else "")
        for value in node.values():
            yield from _walk(value, file_name)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item, file_name)


def test_declared_pin_file_names_one_core_commit() -> None:
    """Guards that sibling-pins.yaml declares exactly one omnibase_core pin as a 40-char SHA."""
    data = _load_unique(PINS)
    assert isinstance(data, dict)
    assert set(data.keys()) == {"pins"}
    pins = data["pins"]
    assert isinstance(pins, dict)
    assert set(pins.keys()) == {"omnibase_core"}
    pin = pins["omnibase_core"]
    assert isinstance(pin, str)
    assert re.fullmatch(r"[0-9a-f]{40}", pin) is not None


def test_declared_pin_has_one_active_key_line() -> None:
    """Guards that exactly one uncommented omnibase_core key line exists in the pin file."""
    pattern = re.compile(r"^[ \t]*omnibase_core:[ \t]*([0-9a-f]{40})\b")
    matches = [
        line
        for line in PINS.read_text(encoding="utf-8").splitlines()
        if pattern.match(line)
    ]
    assert len(matches) == 1, f"Expected exactly one active pin line, found {len(matches)}"


def test_handshake_checkout_matches_the_declared_pin() -> None:
    """Guards that the handshake workflow's core checkout ref equals the declared pin."""
    refs = [ref for name, ref in _core_checkout_refs() if name == HANDSHAKE.name]
    assert len(refs) == 1, f"Expected exactly one core checkout in handshake, found {len(refs)}"
    assert refs[0] == _declared(), (
        f"Handshake checkout ref {refs[0]!r} does not match declared pin {_declared()!r}"
    )


def test_every_literal_core_checkout_agrees_with_the_declared_pin() -> None:
    """Guards that every literal core checkout ref in workflows equals the declared pin."""
    declared = _declared()
    checked_count = 0
    for name, ref in _core_checkout_refs():
        if "${{" in ref:
            continue
        if ref == "":
            raise AssertionError(
                f"{name}: core checkout has no ref (would fetch default branch), "
                f"expected {declared!r}"
            )
        assert ref == declared, (
            f"{name}: core checkout ref {ref!r} does not match declared pin {declared!r}"
        )
        checked_count += 1
    assert checked_count >= 1, "No literal core checkout refs were checked"
