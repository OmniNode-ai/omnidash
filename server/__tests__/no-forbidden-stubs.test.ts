/**
 * OMN-5606: Stub guard -- hard-fail test
 *
 * Ensures no forbidden stub markers exist in source files.
 * Allowed escape hatches: stub-ok and intentional-skip comment prefixes.
 *
 * This test mirrors the CI check (check-ts-stubs pre-commit hook) so that
 * developers catch violations locally before pushing.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('OMN-5606: No forbidden stub markers', () => {
  it('should not contain forbidden stub markers without escape hatches', () => {
    // Grep for forbidden markers in server/, client/src/, shared/
    // Uses the same logic as onex_change_control/scripts/check_ts_stubs.sh
    const dirs = ['server/', 'client/src/', 'shared/'];
    const violations: string[] = [];

    for (const dir of dirs) {
      try {
        const result = execSync(
          `grep -rnE '//\\s*stub\\s*:' --include='*.ts' --include='*.tsx' ` +
            `--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next ` +
            `--exclude-dir=_archive --exclude-dir=__tests__ ${dir} 2>/dev/null || true`,
          { encoding: 'utf-8', cwd: process.cwd() }
        );

        for (const line of result.split('\n').filter(Boolean)) {
          const lower = line.toLowerCase();
          // Skip allowed escape hatches
          if (/\/\/\s*stub-ok\s*:/i.test(lower)) continue;
          if (/\/\/\s*intentional-skip\s*:/i.test(lower)) continue;
          violations.push(line);
        }
      } catch {
        // grep returns exit 1 when no matches -- that is fine
      }
    }

    expect(violations).toEqual([]);
  });
});
