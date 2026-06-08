import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// OMN-12822 (A2): Mirage cleanup — no synthetic fixtures masquerading as
// projection data may be committed to the canonical repo.
//
// Audit wwmx7fobe/D3 flagged `fixtures/onex.snapshot.projection.ab-compare.v1/`
// as 9 git-tracked fabricated rows (zero-cost / hand-authored values) backing a
// projection that is DEGRADED on the live lane (table `llm_call_metrics`
// missing). Committed synthetic data presents as authoritative projection
// output on the demo path, which violates the deterministic-truth doctrine:
// clients render truth, they do not create it.
//
// This is a permanent regression gate: the synthetic ab-compare fixture
// directory must not reappear as git-tracked content.
const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');

const SYNTHETIC_AB_COMPARE_FIXTURE_PREFIX =
  'fixtures/onex.snapshot.projection.ab-compare.v1/';

function gitTrackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', 'fixtures/'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter((line) => line.length > 0);
}

describe('synthetic projection fixtures are not committed (OMN-12822)', () => {
  it('no git-tracked files under the synthetic ab-compare projection fixture', () => {
    const tracked = gitTrackedFiles();
    const offenders = tracked.filter((path) =>
      path.startsWith(SYNTHETIC_AB_COMPARE_FIXTURE_PREFIX),
    );

    expect(offenders).toEqual([]);
  });
});
