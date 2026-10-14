# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-20332: omnidash CI reads every sibling repo at a pinned commit.

A workflow that reads a sibling repo at its live ``dev`` or ``main`` (or with no
ref at all, which is the default branch) goes red the moment that sibling
merges, and no omnidash PR can fix it. On 2026-10-01 an omniclaude merge turned
omnimarket dev red exactly that way. The ruling (2026-10-01T21:43:10Z): each
repo reads its siblings at a pinned version, and moves a pin only in a PR that
tests the new version.

Each test names the read it exists to catch:

* a reusable workflow or composite action of a sibling addressed by a branch;
* an ``actions/checkout`` of a sibling with ``ref: dev``, ``ref: main``, any
  other non-sha ref, or no ref;
* a ``git clone`` of a sibling that is never moved to a recorded commit;
* a ``cross_repo_ref`` in ``.github/required-checks.yaml`` naming a branch;
* a scanner that matches nothing, which would pass every assertion while
  checking nothing.

Only the standard library, pytest and pyyaml are used, so the
``workflow-script-refs.yml`` bare environment can run it with ``--noconftest``.
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
REQUIRED_CHECKS = REPO_ROOT / ".github" / "required-checks.yaml"

SHA = re.compile(r"^[0-9a-f]{40}$")
# Any OmniNode-ai repo other than this one is a sibling.
SIBLING = r"OmniNode-ai/(?!omnidash\b)([A-Za-z0-9_-]+)"
USES = re.compile(rf"^\s*(?:-\s+)?uses:\s*{SIBLING}/(\S+?)@(\S+)")
CLONE = re.compile(rf"git clone\b.*{SIBLING}")
MOVED_TO_SHA = re.compile(
    r"git\s+(?:-C\s+\S+\s+)?(?:checkout|fetch\b.*)\s.*\b[0-9a-f]{40}\b"
)
STEP_START = re.compile(r"^\s*-\s+(?:name|uses|run):")


OUTPUT_REF = re.compile(
    r"\$\{\{\s*steps\.([A-Za-z_][A-Za-z0-9_-]*)\.outputs\.ref\s*\}\}"
)
PIN_COMMAND = "uv run --no-project --python 3.12 --with pyyaml python - <<'PY'\n"
# This is a bounded static proof, not execution of workflow-controlled code.
# Only this straight-line resolver is understood. AST comparison permits
# formatting/comments, but rejects changed guards, writes or extra statements.
PIN_RESOLVER = """\
import os
import re
from pathlib import Path

import yaml

handshake = yaml.safe_load(Path('.github/workflows/check-handshake.yml').read_text())
refs = [
    (step.get('with') or {}).get('ref')
    for job in handshake['jobs'].values()
    for step in job['steps']
    if (step.get('with') or {}).get('repository') == 'OmniNode-ai/omnibase_core'
]
if len(refs) != 1 or not isinstance(refs[0], str) or not re.fullmatch(r'[0-9a-f]{40}', refs[0]):
    raise SystemExit('The handshake must pin exactly one omnibase_core checkout to a full commit SHA')
with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
    output.write(f'ref={refs[0]}\\n')
"""


def _mapping(node: yaml.Node) -> dict[str, yaml.Node]:
    assert isinstance(node, yaml.MappingNode), "expected a YAML mapping"
    result = {key.value: value for key, value in node.value}
    assert len(result) == len(node.value), "duplicate YAML keys cannot prove a pin"
    return result


def _scalar(node: yaml.Node | None) -> str | None:
    return node.value if isinstance(node, yaml.ScalarNode) else None


def _verified_resolver(step: dict[str, yaml.Node]) -> bool:
    # A skipped resolver or overridden output destination is not a proof.
    if set(step) - {"name", "id", "run"}:
        return False
    run = _scalar(step.get("run"))
    if not run or "${{" in run or not run.startswith(PIN_COMMAND):
        return False
    body, separator, tail = run[len(PIN_COMMAND) :].partition("\nPY")
    if not separator or tail.strip():
        return False
    try:
        return ast.dump(ast.parse(body)) == ast.dump(ast.parse(PIN_RESOLVER))
    except SyntaxError:
        return False


def live_uses(text: str) -> list[str]:
    """``uses:`` of a sibling workflow or action whose ref is not a full sha."""
    found = []
    for lineno, line in enumerate(text.splitlines(), 1):
        m = USES.match(line)
        if m and not SHA.fullmatch(m.group(3)):
            found.append(f"{lineno}: {m.group(1)}/{m.group(2)}@{m.group(3)}")
    return found


def live_checkouts(text: str) -> list[str]:
    """Sibling checkouts without a literal SHA or a proven full-SHA producer."""
    document = yaml.compose(text)
    if document is None:
        return []
    jobs = _mapping(document).get("jobs")
    if jobs is None:
        return []
    found = []
    for job in _mapping(jobs).values():
        steps_node = _mapping(job).get("steps")
        if steps_node is None:
            continue
        assert isinstance(steps_node, yaml.SequenceNode), "expected a steps list"
        steps = [_mapping(step) for step in steps_node.value]
        ids = [_scalar(step.get("id")) for step in steps]
        verified = set()
        for step in steps:
            settings = _mapping(step["with"]) if "with" in step else {}
            repository = _scalar(settings.get("repository"))
            sibling = re.fullmatch(SIBLING, repository or "")
            if sibling:
                ref = _scalar(settings.get("ref"))
                expression = OUTPUT_REF.fullmatch(ref or "")
                proven = (
                    repository == "OmniNode-ai/omnibase_core"
                    and expression is not None
                    and expression.group(1) in verified
                )
                if not SHA.fullmatch(ref or "") and not proven:
                    line = settings["repository"].start_mark.line + 1
                    found.append(f"{line}: {sibling.group(1)} ref={ref}")
            step_id = _scalar(step.get("id"))
            if step_id and ids.count(step_id) == 1 and _verified_resolver(step):
                verified.add(step_id)
    return found


def live_clones(text: str) -> list[str]:
    """``git clone`` of a sibling with no checkout or fetch of a sha in the same step."""
    lines = text.splitlines()
    found = []
    for i, line in enumerate(lines):
        m = CLONE.search(line)
        if not m:
            continue
        end = i + 1
        while end < len(lines) and not STEP_START.match(lines[end]):
            end += 1
        if not any(MOVED_TO_SHA.search(ln) for ln in lines[i:end]):
            found.append(f"{i + 1}: git clone {m.group(1)}")
    return found


def _workflow_files() -> list[Path]:
    return sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])


def _sibling_reads_in_tree() -> int:
    count = 0
    for path in _workflow_files():
        text = path.read_text()
        count += len(
            re.findall(rf"(?:uses:|repository:|git clone)[^\n]*{SIBLING}", text)
        )
    return count


# --- the scanner can fail: each extractor flags a known-bad line -------------

BAD_WORKFLOW = """\
jobs:
  a:
    uses: OmniNode-ai/omnibase_core/.github/workflows/receipt-gate.yml@main
  b:
    uses: OmniNode-ai/omniclaude/.github/workflows/x.yml@dev
  c:
    steps:
      - uses: OmniNode-ai/onex_change_control/.github/actions/validate-contract@v1
      - name: no ref
        uses: actions/checkout@v4
        with:
          repository: OmniNode-ai/omnimarket
          path: src
      - name: branch ref
        uses: actions/checkout@v4
        with:
          repository: OmniNode-ai/omnibase_core
          ref: dev
      - name: clone, never pinned
        run: git clone --depth=1 https://github.com/OmniNode-ai/omnibase_core.git ../core
      - name: next step
        run: echo done
"""

GOOD_WORKFLOW = """\
jobs:
  a:
    uses: OmniNode-ai/omnibase_core/.github/workflows/receipt-gate.yml@1e69bec909f245be511803191554e5b340def0b7
  c:
    steps:
      - uses: OmniNode-ai/omnidash/.github/actions/local@main
      - name: pinned checkout
        uses: actions/checkout@v4
        with:
          ref: 1e69bec909f245be511803191554e5b340def0b7
          repository: OmniNode-ai/omnibase_core
      - name: clone, then pinned
        run: |
          git clone https://github.com/OmniNode-ai/omnibase_core.git ../core
          git -C ../core checkout 1e69bec909f245be511803191554e5b340def0b7
"""


def test_extractors_flag_every_live_read() -> None:
    assert live_uses(BAD_WORKFLOW) == [
        "3: omnibase_core/.github/workflows/receipt-gate.yml@main",
        "5: omniclaude/.github/workflows/x.yml@dev",
        "8: onex_change_control/.github/actions/validate-contract@v1",
    ]
    assert live_checkouts(BAD_WORKFLOW) == [
        "12: omnimarket ref=None",
        "17: omnibase_core ref=dev",
    ]
    assert live_clones(BAD_WORKFLOW) == ["20: git clone omnibase_core"]


def test_extractors_pass_pinned_reads_and_this_repo() -> None:
    assert live_uses(GOOD_WORKFLOW) == []
    assert live_checkouts(GOOD_WORKFLOW) == []
    assert live_clones(GOOD_WORKFLOW) == []


def _resolved_workflow() -> dict:
    return {
        "jobs": {
            "schema": {
                "steps": [
                    {"id": "core-pin", "run": PIN_COMMAND + PIN_RESOLVER + "PY\n"},
                    {
                        "uses": "actions/checkout@v4",
                        "with": {
                            "repository": "OmniNode-ai/omnibase_core",
                            "ref": "${{ steps.core-pin.outputs.ref }}",
                        },
                    },
                ]
            }
        }
    }


def test_verified_output_is_a_pinned_checkout() -> None:
    assert live_checkouts(yaml.safe_dump(_resolved_workflow())) == []


def test_resolver_formatting_does_not_change_its_proof() -> None:
    workflow = _resolved_workflow()
    resolver = workflow["jobs"]["schema"]["steps"][0]
    resolver["run"] = resolver["run"].replace(
        "import os", "# Read the head's pin.\nimport os"
    )
    assert live_checkouts(yaml.safe_dump(workflow)) == []


def test_expression_expansion_inside_resolver_comments_is_rejected() -> None:
    workflow = _resolved_workflow()
    resolver = workflow["jobs"]["schema"]["steps"][0]
    resolver["run"] = resolver["run"].replace(
        "import os", "# ${{ github.event.inputs.code }}\nimport os"
    )
    assert live_checkouts(yaml.safe_dump(workflow))


@pytest.mark.parametrize(
    "old,new",
    [
        ("len(refs) != 1", "len(refs) < 1"),
        ("not isinstance(refs[0], str) or ", ""),
        (" or not re.fullmatch(r'[0-9a-f]{40}', refs[0])", ""),
        ("[0-9a-f]{40}", "[0-9a-f]+"),
        ("raise SystemExit(", "print("),
        ("ref={refs[0]}", "ref=dev"),
        ("ref={refs[0]}", "ref={refs[-1]}"),
        ("GITHUB_OUTPUT", "OTHER_OUTPUT"),
        ("read_text()", "read_text() or '{}'"),
        ("PY\n", "PY\necho 'ref=dev' >> \"$GITHUB_OUTPUT\"\n"),
        ("python - <<", "python -c 'pass'; python - <<"),
    ],
)
def test_unproven_resolver_is_rejected(old: str, new: str) -> None:
    workflow = _resolved_workflow()
    resolver = workflow["jobs"]["schema"]["steps"][0]
    assert old in resolver["run"]
    resolver["run"] = resolver["run"].replace(old, new)
    assert live_checkouts(yaml.safe_dump(workflow))


@pytest.mark.parametrize(
    "key,value",
    [
        ("if", "false"),
        ("continue-on-error", True),
        ("env", {"GITHUB_OUTPUT": "elsewhere"}),
    ],
)
def test_conditional_or_overridden_resolver_is_rejected(
    key: str, value: object
) -> None:
    workflow = _resolved_workflow()
    workflow["jobs"]["schema"]["steps"][0][key] = value
    assert live_checkouts(yaml.safe_dump(workflow))


@pytest.mark.parametrize(
    "scope", ["later", "other-job", "duplicate-id", "wrong-repository"]
)
def test_output_proof_is_scoped_to_the_checkout(scope: str) -> None:
    workflow = _resolved_workflow()
    steps = workflow["jobs"]["schema"]["steps"]
    if scope == "later":
        steps.reverse()
    elif scope == "other-job":
        workflow["jobs"]["producer"] = {"steps": [steps.pop(0)]}
    elif scope == "duplicate-id":
        steps.append({"id": "core-pin", "run": "echo ref=dev"})
    else:
        steps[1]["with"]["repository"] = "OmniNode-ai/omniclaude"
    assert live_checkouts(yaml.safe_dump(workflow))


@pytest.mark.parametrize(
    "ref",
    [
        "dev",
        "main",
        "v1",
        "${{ github.sha }}",
        "${{ steps.unknown.outputs.ref }}",
        "${{ steps.core-pin.outputs.other }}",
    ],
)
def test_live_or_unknown_output_ref_is_rejected(ref: str) -> None:
    workflow = _resolved_workflow()
    workflow["jobs"]["schema"]["steps"][1]["with"]["ref"] = ref
    assert live_checkouts(yaml.safe_dump(workflow))


@pytest.mark.parametrize(
    "refs,valid",
    [
        (["a" * 40], True),
        (["b" * 40], True),
        ([], False),
        (["dev"], False),
        (["main"], False),
        ([None], False),
        ([123], False),
        (["a" * 39], False),
        (["A" * 40], False),
        (["a" * 40, "b" * 40], False),
    ],
)
def test_recognized_resolver_emits_only_one_full_sha(
    tmp_path: Path, refs: list, valid: bool
) -> None:
    path = tmp_path / ".github/workflows/check-handshake.yml"
    path.parent.mkdir(parents=True)
    path.write_text(
        yaml.safe_dump(
            {
                "jobs": {
                    "check": {
                        "steps": [
                            {
                                "with": {
                                    "repository": "OmniNode-ai/omnibase_core",
                                    "ref": ref,
                                }
                            }
                            for ref in refs
                        ]
                    }
                }
            }
        )
    )
    output = tmp_path / "output"
    result = subprocess.run(
        [sys.executable, "-c", PIN_RESOLVER],
        cwd=tmp_path,
        env={"GITHUB_OUTPUT": str(output)},
        capture_output=True,
        text=True,
        check=False,
    )
    if valid:
        assert result.returncode == 0, result.stderr
        assert output.read_text() == f"ref={refs[0]}\n"
    else:
        assert result.returncode != 0
        assert "full commit SHA" in result.stderr
        assert not output.exists()


def test_duplicate_checkout_ref_is_not_a_proof() -> None:
    text = GOOD_WORKFLOW.replace(
        "ref: 1e69bec909f245be511803191554e5b340def0b7",
        "ref: 1e69bec909f245be511803191554e5b340def0b7\n          ref: dev",
    )
    with pytest.raises(AssertionError, match="duplicate YAML keys"):
        live_checkouts(text)


def test_the_scanner_sees_the_trees_sibling_reads() -> None:
    assert _sibling_reads_in_tree() > 0, "no sibling read found: the pattern is broken"


# --- the tree -----------------------------------------------------------------


@pytest.mark.parametrize("path", _workflow_files(), ids=lambda p: p.name)
def test_no_sibling_read_at_a_live_branch(path: Path) -> None:
    text = path.read_text()
    bad = [
        *(f"uses {x}" for x in live_uses(text)),
        *(f"checkout {x}" for x in live_checkouts(text)),
        *(f"clone {x}" for x in live_clones(text)),
    ]
    assert not bad, f"{path.name} reads a sibling at a live branch: {bad}"


def test_required_checks_cross_repo_refs_are_pinned() -> None:
    manifest = yaml.safe_load(REQUIRED_CHECKS.read_text())
    rows = [
        row
        for value in manifest.values()
        if isinstance(value, list)
        for row in value
        if isinstance(row, dict) and row.get("cross_repo_ref")
    ]
    assert rows, "no cross_repo_ref rows found: the manifest shape changed"
    bad = [
        row["cross_repo_ref"]
        for row in rows
        if not SHA.fullmatch(str(row["cross_repo_ref"]).rsplit("@", 1)[-1])
    ]
    assert not bad, f"cross_repo_ref at a live branch: {bad}"
