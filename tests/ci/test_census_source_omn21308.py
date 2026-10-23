"""Regression for census checks executing in a Git-free npm stage."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHA = "1234567890abcdef1234567890abcdef12345678"


class CensusSourceCommand(unittest.TestCase):
    def test_git_free_stage_uses_original_product_checkout(self):
        self.run_case(explicit=False)

    def test_explicit_archive_identity_does_not_require_git(self):
        self.run_case(explicit=True)

    def test_missing_checkout_fails_before_browser_execution(self):
        self.run_case(explicit=False, missing=True)

    def run_case(self, explicit, missing=False):
        contract = (ROOT / "contracts/OMN-21308.yaml").read_text()
        commands = [json.loads(line.split(": ", 1)[1]) for line in contract.splitlines()
                    if line.strip().startswith(("command:", "check_value:"))
                    and "local-dashboard-identity-census.omn21308.spec.ts" in line]
        self.assertEqual(len(commands), 2)
        self.assertEqual(commands[0], commands[1])
        with tempfile.TemporaryDirectory(prefix="omn21308-source-") as tmp:
            home = Path(tmp) / "original"
            repo = home / "omnidash"
            repo.mkdir(parents=True)
            subprocess.run(["git", "init", "--quiet", str(repo)], check=True)
            # Controlled Git metadata fixture: no commit is created or published.
            (repo / ".git/HEAD").write_text(SHA + "\n")
            stage = Path(tmp) / "npm-stage"
            runner = stage / "node_modules/playwright/cli.js"
            runner.parent.mkdir(parents=True)
            runner.write_text("console.log(process.env.OMNIDASH_TEST_SOURCE_SHA || 'MISSING')")
            env = dict(os.environ, OMNI_HOME=str(home), GIT_CEILING_DIRECTORIES=tmp)
            for key in ["OMNIDASH_TEST_SOURCE_SHA", "GIT_DIR", "GIT_WORK_TREE"]:
                env.pop(key, None)
            if missing:
                env["OMNI_HOME"] = str(Path(tmp) / "absent")
            if explicit:
                env["OMNIDASH_TEST_SOURCE_SHA"] = SHA
                env["OMNI_HOME"] = str(Path(tmp) / "absent")
            result = subprocess.run(["bash", "-e", "-o", "pipefail", "-c", commands[0]],
                                    cwd=stage, env=env, text=True, capture_output=True)
            if missing:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                return
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), SHA, result.stderr)
            self.assertNotIn("fatal:", result.stderr)


if __name__ == "__main__":
    unittest.main()
