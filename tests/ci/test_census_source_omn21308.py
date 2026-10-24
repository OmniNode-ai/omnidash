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

    def test_without_omni_home_uses_current_nonstandard_checkout(self):
        self.run_without_home(has_checkout=True)

    def test_git_free_stage_without_any_source_fails(self):
        self.run_without_home(has_checkout=False)

    def run_without_home(self, has_checkout):
        with tempfile.TemporaryDirectory(prefix="omn21308-current-") as tmp:
            parent = Path(tmp)
            current = parent / "omnidash-overview-fit-control"
            current.mkdir()
            adjacent = parent / "omnidash"
            adjacent.mkdir()
            for repo, sha in [(adjacent, "f" * 40), (current, SHA)]:
                if repo == current and not has_checkout:
                    continue
                subprocess.run(["git", "init", "--quiet", str(repo)], check=True)
                (repo / ".git/HEAD").write_text(sha + "\n")
            helper = current / "census-source.mjs"
            helper.write_text((ROOT / "tests/e2e/census-source.mjs").read_text())
            env = dict(os.environ, GIT_CEILING_DIRECTORIES=tmp)
            for key in ["OMNI_HOME", "OMNIDASH_TEST_SOURCE_SHA", "GIT_DIR", "GIT_WORK_TREE"]:
                env.pop(key, None)
            result = subprocess.run(["node", "--input-type=module", "-e",
                "import { resolveCensusSourceSha } from './census-source.mjs'; console.log(resolveCensusSourceSha())"],
                cwd=current, env=env, text=True, capture_output=True)
            if has_checkout:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), SHA)
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")

    def run_case(self, explicit, missing=False):
        contract = (ROOT / "contracts/OMN-21308.yaml").read_text()
        def commands_for(key):
            return [json.loads(line.split(": ", 1)[1]) for line in contract.splitlines()
                    if line.strip().startswith(key)
                    and "local-dashboard-identity-census.omn21308.spec.ts" in line]
        commands = commands_for("command:")
        self.assertTrue(commands, "at least one census command must be verified")
        self.assertCountEqual(commands, commands_for("check_value:"))
        for command in commands:
            with self.subTest(command=command):
                self.run_command(command, explicit, missing)

    def run_command(self, command, explicit, missing):
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
            helper = stage / "tests/e2e/census-source.mjs"
            helper.parent.mkdir(parents=True)
            helper.write_text((ROOT / "tests/e2e/census-source.mjs").read_text())
            runner_source = "import { resolveCensusSourceSha } from '../../tests/e2e/census-source.mjs'; console.log(JSON.stringify({sha: resolveCensusSourceSha(), args: process.argv.slice(2)}))"
            runner.write_text(runner_source)
            binary = stage / "node_modules/.bin/playwright"
            binary.parent.mkdir(parents=True)
            binary.write_text("#!/usr/bin/env node\n" + runner_source)
            binary.chmod(0o755)
            # Exercise the existing npm script and the census's real test-side
            # identity helper, without installing dependencies here.
            scripts = json.loads((ROOT / "package.json").read_text())["scripts"]
            (stage / "package.json").write_text(json.dumps({
                "type": "module", "scripts": {"test:e2e": scripts["test:e2e"]}
            }))
            env = dict(os.environ, OMNI_HOME=str(home), GIT_CEILING_DIRECTORIES=tmp)
            for key in ["OMNIDASH_TEST_SOURCE_SHA", "GIT_DIR", "GIT_WORK_TREE"]:
                env.pop(key, None)
            if missing:
                env["OMNI_HOME"] = str(Path(tmp) / "absent")
            if explicit:
                env["OMNIDASH_TEST_SOURCE_SHA"] = SHA
                env["OMNI_HOME"] = str(Path(tmp) / "absent")
            result = subprocess.run(["bash", "-e", "-o", "pipefail", "-c", command],
                                    cwd=stage, env=env, text=True, capture_output=True)
            if missing:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                return
            self.assertEqual(result.returncode, 0, result.stderr)
            # The focused check must run both selectors exactly once; the full
            # census runs once. A repeated SHA cannot hide a missing invocation.
            expected = ["non-icon field", "Usage token-direction"] if "--grep" in command else [None]
            outputs = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual(len(outputs), len(expected), result.stderr)
            for output, selector in zip(outputs, expected):
                self.assertEqual(output["sha"], SHA, result.stderr)
                args = ["test", "tests/e2e/local-dashboard-identity-census.omn21308.spec.ts",
                        "--project=chromium", "--workers=1", "--retries=0", "--trace=on"]
                if selector is not None:
                    args += ["--grep", selector]
                self.assertEqual(output["args"], args)
            self.assertNotIn("fatal:", result.stderr)


if __name__ == "__main__":
    unittest.main()
