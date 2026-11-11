# SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
# SPDX-License-Identifier: MIT
"""OMN-23330 AC42: the evidence closer can count this ticket's new checks as behaviour proof.

The scheduled evidence closer (OMN-16106) reads each contract check with omnimarket's
classify_command, which walks a command's segments and stops at the first one that is not a
runner, a merge-state read or a static check. Measured 2026-11-11 on omnimarket dev 141b5fb8:

* ``test -d node_modules || npm ci ...; npx vitest run <file>`` -> INDETERMINATE (the walk stops at npm ci);
* ``npx vitest run <file>`` and ``npx playwright test <spec>`` -> INDETERMINATE (npx is no runner);
* ``npm test -- run <file>`` and ``npm run test:e2e -- <spec>`` -> BEHAVIOR.

A runner checkout has no node_modules, so the readable forms need the install to happen inside
npm's own lifecycle: ``pretest`` for ``npm test`` and ``pretest:e2e`` for ``npm run test:e2e``.

Failure modes (F30):
* a new check is written in a form the closer cannot count;
* the lifecycle script that installs dependencies is missing, so the readable form fails on a runner;
* the install reruns over an existing node_modules (it must be guarded by ``test -d node_modules``).

Plain pytest, matching this directory's bare-env convention.
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
INSTALL = "test -d node_modules || npm ci --no-audit --no-fund"
READABLE = {
    "dod-omn23330-ac38": "npm run test:e2e -- ",
    "dod-omn23330-ac41": "npm test -- run ",
}


def _scripts() -> dict:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]


def _checks() -> dict[str, list[str]]:
    contract = yaml.safe_load((ROOT / "contracts/OMN-23330.yaml").read_text(encoding="utf-8"))
    return {
        item["id"]: [" ".join(str(check["check_value"]).split()) for check in item.get("checks", [])]
        for item in contract.get("dod_evidence", [])
    }


def test_npm_test_installs_dependencies_first() -> None:
    assert _scripts().get("pretest") == INSTALL


def test_npm_run_test_e2e_installs_dependencies_first() -> None:
    assert _scripts().get("pretest:e2e") == INSTALL


def test_the_new_checks_use_forms_the_closer_counts() -> None:
    checks = _checks()
    for item_id, prefix in READABLE.items():
        assert item_id in checks, item_id
        assert checks[item_id], item_id
        for value in checks[item_id]:
            assert value.startswith(prefix), (item_id, value)
            assert "npx " not in value and "npm ci" not in value, (item_id, value)
