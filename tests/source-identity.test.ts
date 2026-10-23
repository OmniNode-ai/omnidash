// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceIdentity } from './e2e/source-identity';

// Failures: an archive is mislabelled a tested commit, its files change, an
// empty/invalid manifest passes, or a manifest reads outside the source tree.
describe('verified source archive identity for browser artifacts', () => {
  let directory: string;
  let manifest: string;
  let file: string;
  const head = 'a'.repeat(40);
  const digest = createHash('sha256').update('original source').digest('hex');
  function save(data: unknown) { writeFileSync(manifest, JSON.stringify(data)); }
  beforeEach(() => {
    directory = mkdtempSync(join(process.cwd(), '.source-identity-test-'));
    file = relative(process.cwd(), join(directory, 'source.txt'));
    manifest = join(directory, 'manifest.json');
    writeFileSync(file, 'original source');
    save({ worktree_head: head, files: { [file]: digest } });
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('records the real supplied baseline and verified files without claiming a tested commit', () => {
    expect(sourceIdentity(manifest)).toMatchObject({ baseSha: head, testedCommit: null,
      sourceArchive: { worktree_head: head, files: { [file]: digest } } });
  });
  it('refuses a changed file', () => { writeFileSync(file, 'changed'); expect(() => sourceIdentity(manifest)).toThrow(/mismatch/i); });
  it('refuses an absent file', () => { save({ worktree_head: head, files: { 'absent-source-identity-control': digest } }); expect(() => sourceIdentity(manifest)).toThrow(); });
  it('refuses an empty file inventory', () => { save({ worktree_head: head, files: {} }); expect(() => sourceIdentity(manifest)).toThrow(/files|empty/i); });
  it('refuses an invalid baseline', () => { save({ worktree_head: 'unknown', files: { [file]: digest } }); expect(() => sourceIdentity(manifest)).toThrow(/baseline|head/i); });
  it('refuses an invalid digest', () => { save({ worktree_head: head, files: { [file]: 'unknown' } }); expect(() => sourceIdentity(manifest)).toThrow(/digest|hash/i); });
  it.each(['/outside-source', '../outside-source'])('refuses source paths outside the checkout: %s', path => {
    save({ worktree_head: head, files: { [path]: digest } }); expect(() => sourceIdentity(manifest)).toThrow(/path|outside/i);
  });
});
