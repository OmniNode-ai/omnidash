#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""
OMN-3258: TypeScript Type Sync Check

Verifies that TypeScript boundary types in omnidash stay in sync with the
corresponding Python Pydantic models in omnibase_core / omniintelligence.

Strategy:
  1. Parse target Python model files with `ast` (stdlib — no install needed)
  2. Extract field names from Pydantic `Field(...)` or annotated assignments
  3. For each model, verify that every Python field name appears in the
     corresponding TypeScript file
  4. Exit 1 if any field is missing from the TypeScript type

This approach avoids `datamodel-codegen` (which generates incompatible output
for Zod-based schemas) and works with stdlib only — no uv/pip required.

Usage:
  python3 scripts/check_type_sync.py [--omnibase-core PATH] [--omniintelligence PATH]

Defaults assume the sibling repos are checked out alongside omnidash:
  omnibase_core/   (or set --omnibase-core)
  omniintelligence/ (or set --omniintelligence)
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Target model descriptors
# ---------------------------------------------------------------------------
#
# Each entry maps:
#   name         — human-readable name for log output
#   python_repo  — key into repo_roots ("omnibase_core" | "omniintelligence")
#   python_rel   — path to the Python source, relative to that repo root
#   model_class  — Pydantic model (or StrEnum) class name to extract from
#   ts_path      — path to the generated TS file, relative to omnidash root
#   is_enum      — when True, extract StrEnum member *values* instead of
#                  Pydantic field names (a StrEnum member is a plain
#                  `NAME = "value"` assignment, not an annotated field)
#   required_fields — explicit names/values that MUST appear in the TS file
#                  (overrides AST extraction; used for enums where the drift
#                  signal is the wire *value*, not the Python member name)
#   exclude_fields  — fields intentionally absent in TS (base-class internals)


# OMN-13130 (epic OMN-13129, Contract-Driven UI Platform — Phase 0):
# The six UI contract primitives plus EnumEmptyStateReason were added to
# omnibase_core dev (merge d215fe1a) and are emitted into
# src/shared/types/generated/onex-models.ts by scripts/emit_ts_types.py.
# These descriptors fail the gate if any Python field/enum-value drifts away
# from its regenerated TS mirror. The generated TS path is the json2ts output
# (TS_OUT in run-types-generate.sh); regenerate it via `npm run types:generate`
# rather than hand-editing.
_GENERATED_TS = "src/shared/types/generated/onex-models.ts"
_CORE_DASHBOARD = "src/omnibase_core/models/dashboard"

TARGETS: list[dict] = [
    {
        "name": "ModelComponentContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_component_contract.py",
        "model_class": "ModelComponentContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "ModelActionContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_action_contract.py",
        "model_class": "ModelActionContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "ModelDataBindingContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_data_binding_contract.py",
        "model_class": "ModelDataBindingContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "ModelPermissionContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_permission_contract.py",
        "model_class": "ModelPermissionContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "ModelEvidenceRequirementContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_evidence_requirement_contract.py",
        "model_class": "ModelEvidenceRequirementContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "ModelRendererCapabilityContract (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": f"{_CORE_DASHBOARD}/model_renderer_capability_contract.py",
        "model_class": "ModelRendererCapabilityContract",
        "ts_path": _GENERATED_TS,
    },
    {
        "name": "EnumEmptyStateReason (OMN-13130)",
        "python_repo": "omnibase_core",
        "python_rel": "src/omnibase_core/enums/enum_empty_state_reason.py",
        "model_class": "EnumEmptyStateReason",
        "ts_path": _GENERATED_TS,
        "is_enum": True,
        # Wire *values* (not Python member names): a rename of any of these
        # four values without regenerating the TS mirror must fail the gate.
        # These must stay byte-identical to the EmptyStateReason TS union in
        # shared/types/chart-config.ts.
        "required_fields": [
            "no-data",
            "missing-field",
            "upstream-blocked",
            "schema-invalid",
        ],
    },
]


# ---------------------------------------------------------------------------
# Python model field extraction
# ---------------------------------------------------------------------------


def extract_pydantic_fields(path: Path, class_name: str) -> set[str]:
    """Parse a Python file with `ast` and extract annotated field names
    from the named Pydantic class.

    Handles both:
      - `field: Type = Field(...)` style
      - `field: Type` bare annotations (without a default)

    Skips:
      - `model_config` (Pydantic v2 ConfigDict assignment)
      - ClassVar annotations
      - Private fields starting with `_`

    Returns:
        Set of field name strings found in the class body.
    """
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"  ERROR: Python model file not found: {path}", file=sys.stderr)
        return set()

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        print(f"  ERROR: Cannot parse {path}: {exc}", file=sys.stderr)
        return set()

    fields: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef) or node.name != class_name:
            continue
        for item in node.body:
            # Annotated assignment: `field: Type = ...` or `field: Type`
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                name = item.target.id
                if name.startswith("_"):
                    continue
                if name == "model_config":
                    continue
                # Skip ClassVar[...] annotations
                ann = item.annotation
                if isinstance(ann, ast.Subscript):
                    ann_name = (
                        getattr(ann.value, "id", "")
                        or getattr(
                            getattr(ann.value, "attr", None), "__str__", lambda: ""
                        )()
                    )
                    if ann_name == "ClassVar":
                        continue
                fields.add(name)
        # Only process the first matching class definition
        break

    return fields


def extract_enum_values(path: Path, class_name: str) -> set[str]:
    """Parse a Python file with `ast` and extract StrEnum member *values*
    from the named class.

    A StrEnum member is a plain assignment of the form::

        MEMBER_NAME = "wire-value"

    (an `ast.Assign`, not the `ast.AnnAssign` that Pydantic fields use), so
    `extract_pydantic_fields` returns nothing for it. This extractor reads the
    string literal on the right-hand side — the value that actually crosses the
    Python -> TS boundary — so drift on a wire value is caught.

    Skips dunder/private members and any non-string-literal assignment.

    Returns:
        Set of enum *value* strings found in the class body.
    """
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"  ERROR: Python enum file not found: {path}", file=sys.stderr)
        return set()

    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        print(f"  ERROR: Cannot parse {path}: {exc}", file=sys.stderr)
        return set()

    values: set[str] = set()

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef) or node.name != class_name:
            continue
        for item in node.body:
            if not isinstance(item, ast.Assign):
                continue
            # Single simple target: MEMBER = "value"
            if len(item.targets) != 1 or not isinstance(item.targets[0], ast.Name):
                continue
            member = item.targets[0].id
            if member.startswith("_"):
                continue
            if isinstance(item.value, ast.Constant) and isinstance(
                item.value.value, str
            ):
                values.add(item.value.value)
        break

    return values


# ---------------------------------------------------------------------------
# TypeScript field presence check
# ---------------------------------------------------------------------------


def check_fields_in_ts(ts_path: Path, required_fields: set[str]) -> list[str]:
    """Verify that each required field name appears somewhere in the TS file.

    Uses a simple substring/word-boundary search. A field `foo_bar` is
    considered present if the pattern `foo_bar` appears in the file as
    a standalone identifier (not as a substring of a longer word).

    Returns:
        List of missing field names (empty = all present).
    """
    if not ts_path.exists():
        print(f"  ERROR: TypeScript file not found: {ts_path}", file=sys.stderr)
        return list(required_fields)

    content = ts_path.read_text(encoding="utf-8")
    missing: list[str] = []

    for field in sorted(required_fields):
        # Match field as a standalone identifier (word boundary on both sides)
        pattern = rf"\b{re.escape(field)}\b"
        if not re.search(pattern, content):
            missing.append(field)

    return missing


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check TypeScript boundary types stay in sync with Python Pydantic models."
    )
    parser.add_argument(
        "--omnibase-core",
        default=None,
        help=(
            "Path to omnibase_core repo root. "
            "Defaults to ../omnibase_core relative to omnidash root."
        ),
    )
    parser.add_argument(
        "--omniintelligence",
        default=None,
        help=(
            "Path to omniintelligence repo root. "
            "Defaults to ../omniintelligence relative to omnidash root."
        ),
    )
    parser.add_argument(
        "--omnidash",
        default=None,
        help=(
            "Path to omnidash repo root. "
            "Defaults to the directory containing this script's parent."
        ),
    )
    return parser.parse_args()


def resolve_repo_path(
    arg_value: str | None, default_relative: str, omnidash_root: Path
) -> Path:
    if arg_value:
        return Path(arg_value).resolve()
    # Default: sibling directory relative to omnidash root
    return (omnidash_root / ".." / default_relative).resolve()


def main() -> int:
    args = parse_args()

    # Determine omnidash root
    script_dir = Path(__file__).resolve().parent
    omnidash_root = (
        Path(args.omnidash).resolve() if args.omnidash else script_dir.parent
    )

    repo_roots = {
        "omnibase_core": resolve_repo_path(
            args.omnibase_core, "omnibase_core", omnidash_root
        ),
        "omniintelligence": resolve_repo_path(
            args.omniintelligence, "omniintelligence", omnidash_root
        ),
    }

    print("TypeScript Type Sync Check (OMN-3258)")
    print("=" * 60)
    print(f"Omnidash root:      {omnidash_root}")
    for name, path in repo_roots.items():
        status = "OK" if path.exists() else "MISSING"
        print(f"  {name:<20} {path}  [{status}]")
    print()

    overall_pass = True

    for target in TARGETS:
        print(f"Checking: {target['name']}")
        print(f"  Python: {target['python_rel']}")
        print(f"  TS:     {target['ts_path']}")

        python_repo_root = repo_roots[target["python_repo"]]
        python_path = python_repo_root / target["python_rel"]
        ts_path = omnidash_root / target["ts_path"]

        # --- Step 1: Extract Python fields (or enum values) ---
        if target.get("is_enum"):
            all_fields = extract_enum_values(python_path, target["model_class"])
            kind = "enum values"
        else:
            all_fields = extract_pydantic_fields(python_path, target["model_class"])
            kind = "fields"
        if not all_fields:
            # A target that extracts nothing is a silent pass on a no-op — for
            # OMN-13130 primitives that means the model/enum vanished or moved.
            # Fail loudly rather than WARN-skip so the gate stays meaningful.
            print(
                f"  FAIL: No {kind} extracted from {target['model_class']} — "
                "file missing, class renamed, or moved. The gate cannot verify "
                "this target; treat as drift."
            )
            overall_pass = False
            print()
            continue

        print(f"  Python {kind} extracted: {sorted(all_fields)}")

        # --- Step 2: Determine required fields ---
        # Use explicit required_fields list if provided; otherwise use all
        # Python fields minus excluded ones.
        if target.get("required_fields"):
            required = set(target["required_fields"])
        else:
            required = all_fields - target.get("exclude_fields", set())

        print(f"  Required in TS ({len(required)}): {sorted(required)}")

        # --- Step 3: Check TS file ---
        missing = check_fields_in_ts(ts_path, required)

        if missing:
            print(f"  FAIL: {len(missing)} field(s) missing from TypeScript type:")
            for field in missing:
                print(f"    - {field}")
            overall_pass = False
        else:
            print(f"  PASS: all {len(required)} required fields present in TypeScript")

        print()

    print("=" * 60)
    if overall_pass:
        print("RESULT: PASS — all TypeScript boundary types are in sync")
        return 0
    else:
        print("RESULT: FAIL — TypeScript types are out of sync with Python models")
        print()
        print(
            "To fix: update the TypeScript types in shared/ to include the missing fields."
        )
        print("See OMN-3258 for the type sync policy.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
